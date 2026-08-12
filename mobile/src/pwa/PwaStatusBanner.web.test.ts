import {
    BROWSER_OFFLINE_MESSAGE,
    isDocumentModalOpen,
    resolvePwaNoticePlacement
} from './PwaStatusBanner.web';

describe('PwaStatusBanner placement', () => {
    it('keeps compact notices above bottom navigation', () => {
        expect(resolvePwaNoticePlacement(320, true)).toMatchObject({
            left: 16,
            right: 16,
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 174px)',
            alignItems: 'center'
        });
        expect(resolvePwaNoticePlacement(320, true).top).toBeUndefined();
    });

    it('moves desktop notices to the top-right without covering shell actions', () => {
        expect(resolvePwaNoticePlacement(1440, true)).toMatchObject({
            right: 16,
            top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
            alignItems: 'flex-end'
        });
        expect(resolvePwaNoticePlacement(1440, true).bottom).toBeUndefined();
    });

    it('keeps compact public notices away from landing actions', () => {
        expect(resolvePwaNoticePlacement(320, false)).toMatchObject({
            top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
            left: 16,
            right: 16
        });
        expect(resolvePwaNoticePlacement(320, false).bottom).toBeUndefined();
    });
    it('does not promise queued writes while offline', () => {
        expect(BROWSER_OFFLINE_MESSAGE).toBe(
            'Some information may be out of date. Reconnect before making changes.'
        );
    });

    it('suppresses outside notices while a modal dialog owns focus', () => {
        const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
        const querySelector = jest.fn().mockReturnValue({});
        Object.defineProperty(globalThis, 'document', {
            configurable: true,
            value: { querySelector }
        });

        expect(isDocumentModalOpen()).toBe(true);

        querySelector.mockReturnValue(null);
        expect(isDocumentModalOpen()).toBe(false);

        if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
        else Reflect.deleteProperty(globalThis, 'document');
    });
});
