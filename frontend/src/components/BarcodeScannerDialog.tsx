import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    Typography,
    useMediaQuery,
    useTheme
} from '@mui/material';
import type { BrowserBarcodeReader, DecodeHintType } from '@zxing/library';

const UPC_BARCODE_FORMATS: BarcodeFormat[] = ['upc_a', 'upc_e', 'ean_13', 'ean_8'];

// Controls how frequently we attempt a native BarcodeDetector scan against the live video element.
const NATIVE_SCAN_INTERVAL_MS = 200;

// Controls how aggressively ZXing retries decoding frames when running as a fallback on browsers
// without BarcodeDetector (e.g. Firefox mobile). Keep this throttled to avoid pegging the CPU.
const ZXING_DECODE_ATTEMPT_INTERVAL_MS = 200;

/**
 * Normalize scan results so they are safe to send to provider lookup endpoints.
 */
const normalizeBarcodeValue = (rawValue: string): string => rawValue.replace(/[^0-9]/g, '').trim();

/**
 * Stop all MediaStream tracks so the camera is released promptly on close.
 */
const stopMediaStream = (stream: MediaStream | null): void => {
    stream?.getTracks().forEach((track) => track.stop());
};

/**
 * Pick UPC/EAN formats that are supported by the host browser, falling back to the full list.
 */
const resolveDetectorFormats = async (): Promise<BarcodeFormat[] | undefined> => {
    if (typeof BarcodeDetector === 'undefined') {
        return undefined;
    }

    if (typeof BarcodeDetector.getSupportedFormats !== 'function') {
        return UPC_BARCODE_FORMATS;
    }

    try {
        const supported = await BarcodeDetector.getSupportedFormats();
        const supportedSet = new Set(supported);
        const formats = UPC_BARCODE_FORMATS.filter((format) => supportedSet.has(format));
        return formats.length > 0 ? formats : undefined;
    } catch (error) {
        console.warn('Unable to resolve supported barcode formats.', error);
        return UPC_BARCODE_FORMATS;
    }
};

/**
 * Convert camera API failures into concise copy suitable for an in-app alert.
 */
const describeCameraError = (error: unknown): string => {
    if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
            return 'Camera permission was blocked. Allow camera access to scan barcodes.';
        }
        if (error.name === 'NotFoundError') {
            return 'No camera device was found for barcode scanning.';
        }
        if (error.name === 'NotReadableError') {
            return 'The camera is in use by another app. Close other camera apps and try again.';
        }
        if (error.name === 'OverconstrainedError') {
            return 'Unable to start the camera with the requested settings.';
        }
    }

    if (error instanceof Error && error.message) {
        return error.message;
    }

    return 'Unable to access the camera for scanning.';
};

/**
 * Resolve a deep-imported ZXing ESM module export that may be exposed as either a default export,
 * a named export, or (depending on bundler interop) wrapped under `module.a.default`.
 */
const resolveZxingModuleExport = <T,>(
    moduleNamespace: Record<string, unknown>,
    namedExportKey: string
): T | null => {
    const maybeDefault = moduleNamespace.default;
    if (maybeDefault) {
        return maybeDefault as T;
    }

    const maybeNamed = moduleNamespace[namedExportKey];
    if (maybeNamed) {
        return maybeNamed as T;
    }

    const maybeInteropWrapper = (moduleNamespace as { a?: { default?: unknown } }).a?.default;
    if (maybeInteropWrapper) {
        return maybeInteropWrapper as T;
    }

    return null;
};

/**
 * ZXing reports "no barcode in frame" as a NotFoundException; treat that as a normal scan miss.
 */
const isZxingNotFoundError = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const maybeError = error as { name?: unknown; getKind?: unknown };
    if (maybeError.name === 'NotFoundException') {
        return true;
    }

    if (typeof maybeError.getKind === 'function') {
        try {
            return (maybeError.getKind as () => unknown)() === 'NotFoundException';
        } catch {
            return false;
        }
    }

    return false;
};

type Props = {
    open: boolean;
    onClose: () => void;
    onDetected: (barcode: string) => void;
};

/**
 * Display a camera preview and scan UPC/EAN barcodes via the built-in BarcodeDetector API.
 */
const BarcodeScannerDialog: React.FC<Props> = ({ open, onClose, onDetected }) => {
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

    const [error, setError] = useState<string | null>(null);
    const [manualBarcode, setManualBarcode] = useState('');
    const [isStartingCamera, setIsStartingCamera] = useState(false);

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const detectorRef = useRef<BarcodeDetector | null>(null);
    const zxingReaderRef = useRef<BrowserBarcodeReader | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const scanTimeoutRef = useRef<number | null>(null);
    const hasHandledResultRef = useRef(false);

    const canAttemptCameraScan = useMemo(() => {
        return Boolean(navigator.mediaDevices?.getUserMedia);
    }, []);

    const stopCamera = useCallback(() => {
        if (scanTimeoutRef.current !== null) {
            window.clearTimeout(scanTimeoutRef.current);
            scanTimeoutRef.current = null;
        }

        detectorRef.current = null;
        if (zxingReaderRef.current) {
            // ZXing manages its own stream; reset stops decoding + releases the camera promptly.
            zxingReaderRef.current.reset();
            zxingReaderRef.current = null;
        }
        stopMediaStream(streamRef.current);
        streamRef.current = null;

        const video = videoRef.current;
        if (video) {
            video.pause();
            video.srcObject = null;
        }
    }, []);

    const handleClose = useCallback(() => {
        stopCamera();
        onClose();
    }, [onClose, stopCamera]);

    const submitBarcode = useCallback(
        (barcode: string) => {
            const normalized = normalizeBarcodeValue(barcode);
            if (!normalized) {
                setError('Enter a barcode made up of digits (UPC/EAN).');
                return;
            }

            if (hasHandledResultRef.current) {
                return;
            }
            hasHandledResultRef.current = true;
            onDetected(normalized);
            handleClose();
        },
        [handleClose, onDetected]
    );

    useEffect(() => {
        if (!open) {
            return;
        }

        hasHandledResultRef.current = false;
        setError(null);
        setManualBarcode('');

        if (!canAttemptCameraScan) {
            setError(
                'Barcode scanning is not supported in this browser or camera access is unavailable. You can still enter a UPC manually.'
            );
            return;
        }

        let cancelled = false;

        const start = async () => {
            setIsStartingCamera(true);
            try {
                const video = videoRef.current;
                if (!video) {
                    throw new Error('Camera preview failed to initialize.');
                }

                const videoConstraints: MediaTrackConstraints = {
                    facingMode: { ideal: 'environment' },
                    // Cap resolution to keep scanning responsive on mobile devices.
                    width: { ideal: 1280, max: 1280 },
                    height: { ideal: 720, max: 720 }
                };

                if (typeof BarcodeDetector !== 'undefined') {
                    const formats = await resolveDetectorFormats();
                    detectorRef.current = new BarcodeDetector(formats ? { formats } : undefined);

                    const stream = await navigator.mediaDevices.getUserMedia({
                        audio: false,
                        video: videoConstraints
                    });

                    if (cancelled) {
                        stopMediaStream(stream);
                        return;
                    }

                    streamRef.current = stream;

                    video.srcObject = stream;
                    await video.play();

                    const scanOnce = async () => {
                        if (cancelled || hasHandledResultRef.current) {
                            return;
                        }

                        const activeVideo = videoRef.current;
                        const detector = detectorRef.current;
                        if (!activeVideo || !detector) {
                            return;
                        }

                        if (activeVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
                            scanTimeoutRef.current = window.setTimeout(() => void scanOnce(), NATIVE_SCAN_INTERVAL_MS);
                            return;
                        }

                        try {
                            const detections = await detector.detect(activeVideo);
                            const rawValue = detections.find((detected) => Boolean(detected.rawValue))?.rawValue;
                            const normalized = rawValue ? normalizeBarcodeValue(rawValue) : '';
                            if (normalized) {
                                navigator.vibrate?.(80);
                                submitBarcode(normalized);
                                return;
                            }
                        } catch (scanError) {
                            console.warn('Barcode scan failed.', scanError);
                        }

                        scanTimeoutRef.current = window.setTimeout(() => void scanOnce(), NATIVE_SCAN_INTERVAL_MS);
                    };

                    scanTimeoutRef.current = window.setTimeout(() => void scanOnce(), NATIVE_SCAN_INTERVAL_MS);
                    return;
                }

                // Firefox (and other non-Chromium browsers) often lack BarcodeDetector. Use ZXing (1D reader) as a JS fallback.
                // We deep-import only the pieces we need so we don't pull the full multi-format bundle into the async chunk.
                const [{ BrowserBarcodeReader }, barcodeFormatModule, decodeHintTypeModule] = await Promise.all([
                    import('@zxing/library/esm/browser/BrowserBarcodeReader'),
                    import('@zxing/library/esm/core/BarcodeFormat'),
                    import('@zxing/library/esm/core/DecodeHintType')
                ]);
                if (cancelled) {
                    return;
                }

                const BarcodeFormatEnum = resolveZxingModuleExport<Record<string, unknown>>(barcodeFormatModule, 'BarcodeFormat');
                const DecodeHintTypeEnum = resolveZxingModuleExport<Record<string, unknown>>(
                    decodeHintTypeModule,
                    'DecodeHintType'
                );

                if (!BarcodeFormatEnum || !DecodeHintTypeEnum) {
                    throw new Error('Barcode scanner fallback failed to load in this browser.');
                }

                const hints = new Map<DecodeHintType, number[]>([
                    [
                        DecodeHintTypeEnum.POSSIBLE_FORMATS as DecodeHintType,
                        [
                            BarcodeFormatEnum.UPC_A as number,
                            BarcodeFormatEnum.UPC_E as number,
                            BarcodeFormatEnum.EAN_13 as number,
                            BarcodeFormatEnum.EAN_8 as number
                        ]
                    ]
                ]);

                const reader = new BrowserBarcodeReader(undefined, hints);
                reader.timeBetweenDecodingAttempts = ZXING_DECODE_ATTEMPT_INTERVAL_MS;
                zxingReaderRef.current = reader;

                await reader.decodeFromConstraints({ audio: false, video: videoConstraints }, video, (result, scanError) => {
                    if (cancelled || hasHandledResultRef.current) {
                        return;
                    }

                    if (result) {
                        const normalized = normalizeBarcodeValue(result.getText());
                        if (normalized) {
                            navigator.vibrate?.(80);
                            submitBarcode(normalized);
                        }
                        return;
                    }

                    if (scanError && !isZxingNotFoundError(scanError)) {
                        console.warn('Barcode scan failed.', scanError);
                    }
                });
            } catch (cameraError) {
                if (cancelled) {
                    return;
                }

                console.error(cameraError);
                setError(describeCameraError(cameraError));
                stopCamera();
            } finally {
                if (!cancelled) {
                    setIsStartingCamera(false);
                }
            }
        };

        void start();

        return () => {
            cancelled = true;
            stopCamera();
            setIsStartingCamera(false);
        };
    }, [canAttemptCameraScan, open, stopCamera, submitBarcode]);

    return (
        <Dialog open={open} onClose={handleClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
            <DialogTitle>Scan UPC Barcode</DialogTitle>
            <DialogContent>
                <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary">
                        Align the barcode within the frame. If scanning is unavailable, enter the UPC/EAN digits
                        manually.
                    </Typography>

                    {error && <Alert severity="warning">{error}</Alert>}

                    {canAttemptCameraScan && (
                        <Box
                            sx={{
                                position: 'relative',
                                width: '100%',
                                borderRadius: 2,
                                overflow: 'hidden',
                                bgcolor: 'grey.900',
                                minHeight: 220,
                                maxHeight: '60vh'
                            }}
                        >
                            <video
                                ref={videoRef}
                                muted
                                playsInline
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover'
                                }}
                            />
                            {isStartingCamera && (
                                <Box
                                    sx={{
                                        position: 'absolute',
                                        inset: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        bgcolor: 'rgba(0,0,0,0.4)'
                                    }}
                                >
                                    <CircularProgress color="inherit" />
                                </Box>
                            )}
                        </Box>
                    )}

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField
                            label="UPC/EAN digits"
                            placeholder="e.g. 012345678905"
                            fullWidth
                            value={manualBarcode}
                            onChange={(event) => setManualBarcode(event.target.value)}
                            inputProps={{ inputMode: 'numeric' }}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    submitBarcode(manualBarcode);
                                }
                            }}
                        />
                        <Button
                            variant="contained"
                            onClick={() => submitBarcode(manualBarcode)}
                            disabled={!manualBarcode.trim()}
                            sx={{ whiteSpace: 'nowrap' }}
                        >
                            Use barcode
                        </Button>
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
};

export default BarcodeScannerDialog;
