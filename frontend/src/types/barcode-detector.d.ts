export {};

declare global {
    type BarcodeFormat =
        | 'aztec'
        | 'code_128'
        | 'code_39'
        | 'code_93'
        | 'codabar'
        | 'data_matrix'
        | 'ean_13'
        | 'ean_8'
        | 'itf'
        | 'pdf417'
        | 'qr_code'
        | 'upc_a'
        | 'upc_e';

    type BarcodePoint2D = { x: number; y: number };

    interface DetectedBarcode {
        rawValue: string;
        format: BarcodeFormat;
        boundingBox?: DOMRectReadOnly;
        cornerPoints?: BarcodePoint2D[];
    }

    interface BarcodeDetectorOptions {
        formats?: BarcodeFormat[];
    }

    interface BarcodeDetector {
        detect(image: ImageBitmapSource): Promise<DetectedBarcode[]>;
    }

    // BarcodeDetector is supported in Chromium-based browsers and some Safari versions.
    // TypeScript does not ship these definitions in lib.dom today, so we declare them here.
    // https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector
    var BarcodeDetector: {
        prototype: BarcodeDetector;
        new (options?: BarcodeDetectorOptions): BarcodeDetector;
        getSupportedFormats?: () => Promise<BarcodeFormat[]>;
    };
}
