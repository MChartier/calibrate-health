import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    Typography,
    useMediaQuery
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
import './ProfilePhotoCropDialog.css';

const OUTPUT_SIZE_PX = 256;
const OUTPUT_MIME_TYPE = 'image/jpeg';
const OUTPUT_QUALITY = 0.92;
const OUTPUT_FILL_COLOR = '#ffffff';

type Props = {
    open: boolean;
    /** Object URL or data URL for the selected image. */
    imageUrl: string | null;
    onCancel: () => void;
    /** Called with a processed (cropped + resized) data URL. */
    onConfirm: (dataUrl: string) => Promise<void>;
};

/**
 * ProfilePhotoCropDialog
 *
 * Wraps CropperJS in a MUI dialog to let the user position/zoom their photo, then produces a
 * small (256x256) cropped avatar as a data URL suitable for storage in the DB.
 */
const ProfilePhotoCropDialog: React.FC<Props> = ({ open, imageUrl, onCancel, onConfirm }) => {
    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
    const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
    const cropperRef = useRef<Cropper | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isCropperReady, setIsCropperReady] = useState(false);
    const [error, setError] = useState('');

    const attachImageRef = useCallback((node: HTMLImageElement | null) => {
        setImageElement(node);
    }, []);

    const destroyCropper = useCallback(() => {
        const cropper = cropperRef.current;
        if (cropper) {
            cropper.destroy();
            cropperRef.current = null;
        }
        setIsCropperReady(false);
    }, []);

    useEffect(() => {
        if (!open || !imageUrl || !imageElement) {
            destroyCropper();
            return;
        }

        let cancelled = false;

        const waitForImage = async () => {
            if (imageElement.complete) {
                if (imageElement.naturalWidth > 0) return;
                throw new Error('Image failed to load');
            }

            await new Promise<void>((resolve, reject) => {
                const handleLoad = () => resolve();
                const handleError = () => reject(new Error('Image failed to load'));

                imageElement.addEventListener('load', handleLoad, { once: true });
                imageElement.addEventListener('error', handleError, { once: true });
            });
        };

        const initializeCropper = async () => {
            setError('');
            setIsCropperReady(false);

            try {
                await waitForImage();
                await imageElement.decode?.().catch(() => undefined);

                if (cancelled) return;
                destroyCropper();

                cropperRef.current = new Cropper(imageElement, {
                    aspectRatio: 1,
                    viewMode: 1,
                    dragMode: 'move',
                    autoCropArea: 0.9,
                    guides: false,
                    center: true,
                    highlight: false,
                    background: false,
                    responsive: true,
                    cropBoxMovable: false,
                    cropBoxResizable: false,
                    toggleDragModeOnDblclick: false
                });

                setIsCropperReady(true);
            } catch (err) {
                if (cancelled) return;
                if (import.meta.env.DEV) {
                    console.error(err);
                }
                setError('Unable to load this photo for cropping. Please try a different image.');
            }
        };

        void initializeCropper();

        return () => {
            cancelled = true;
            destroyCropper();
        };
    }, [destroyCropper, imageElement, imageUrl, open]);

    useEffect(() => {
        if (open) return;
        setError('');
        setIsSaving(false);
        setIsCropperReady(false);
    }, [open]);

    const helperText = useMemo(() => {
        return fullScreen ? 'Drag to reposition. Pinch to zoom.' : 'Drag to reposition. Scroll to zoom (or pinch on touch devices).';
    }, [fullScreen]);

    const handleSave = async () => {
        setError('');
        const cropper = cropperRef.current;
        if (!cropper) {
            setError('Cropper not ready yet. Please try again.');
            return;
        }

        setIsSaving(true);
        try {
            const canvas = cropper.getCroppedCanvas({
                width: OUTPUT_SIZE_PX,
                height: OUTPUT_SIZE_PX,
                fillColor: OUTPUT_FILL_COLOR,
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high'
            });

            const dataUrl = canvas.toDataURL(OUTPUT_MIME_TYPE, OUTPUT_QUALITY);
            await onConfirm(dataUrl);
        } catch (err) {
            if (import.meta.env.DEV) {
                console.error(err);
            }
            setError('Unable to save this photo. Please try a different image.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={isSaving ? undefined : onCancel} fullScreen={fullScreen} fullWidth maxWidth="sm">
            <DialogTitle>Crop your profile photo</DialogTitle>
            <DialogContent>
                <Stack spacing={2}>
                    {error && <Alert severity="error">{error}</Alert>}
                    <Typography variant="body2" color="text.secondary">
                        {helperText}
                    </Typography>

                    <Box
                        className="profilePhotoCropperRoot"
                        sx={{
                            width: '100%',
                            // Keep a consistent cropper stage height; on small screens the dialog goes full-screen.
                            height: fullScreen ? 'min(60vh, 420px)' : 360,
                            borderRadius: 2,
                            overflow: 'hidden',
                            border: (t) => `1px solid ${t.palette.divider}`,
                            backgroundColor: 'background.paper'
                        }}
                    >
                        {/* CropperJS mutates the <img>. Keep styles simple/stable. */}
                {imageUrl ? (
                            <img
                                ref={attachImageRef}
                                alt="Profile upload to crop"
                                src={imageUrl}
                                style={{ display: 'block', maxWidth: '100%', width: '100%' }}
                            />
                        ) : (
                            <Box sx={{ height: '100%' }} />
                        )}
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onCancel} disabled={isSaving}>
                    Cancel
                </Button>
                <Button variant="contained" onClick={() => void handleSave()} disabled={isSaving || !isCropperReady}>
                    Save Photo
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ProfilePhotoCropDialog;
