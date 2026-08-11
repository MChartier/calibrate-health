import { renderHook } from '@testing-library/react-native';
import { useBrowserRouteFocus } from './useBrowserRouteFocus';

class FakeElement {
    tabIndex = 0;
    readonly focus = jest.fn(() => {
        this.ownerDocument.activeElement = this;
    });

    constructor(private readonly ownerDocument: FakeDocument) {}
}

class FakeDocument {
    activeElement: FakeElement | null = null;
    title = '';
    readonly body = {};
    readonly routeTitle = new FakeElement(this);

    getElementById(id: string) {
        return id === 'route-focus-title' ? this.routeTitle : null;
    }

    querySelector() {
        return null;
    }
}

describe('useBrowserRouteFocus', () => {
    const originalDocument = globalThis.document;
    const originalLocation = window.location;

    afterEach(() => {
        Object.assign(globalThis, { document: originalDocument });
        Object.assign(window, { location: originalLocation });
    });

    it('preserves initial focus for the skip link, then focuses the h1 after client navigation', () => {
        const fakeDocument = new FakeDocument();
        const skipLink = new FakeElement(fakeDocument);
        fakeDocument.activeElement = skipLink;
        Object.assign(globalThis, { document: fakeDocument });

        const hook = renderHook(
            ({ pathname, title }: { pathname: string; title: string }) =>
                useBrowserRouteFocus(pathname, title),
            { initialProps: { pathname: '/login', title: 'Log in - Calibrate' } }
        );

        expect(fakeDocument.title).toBe('Log in - Calibrate');
        expect(fakeDocument.activeElement).toBe(skipLink);
        expect(fakeDocument.routeTitle.focus).not.toHaveBeenCalled();

        hook.rerender({ pathname: '/register', title: 'Create account - Calibrate' });

        expect(fakeDocument.title).toBe('Create account - Calibrate');
        expect(fakeDocument.routeTitle.tabIndex).toBe(-1);
        expect(fakeDocument.routeTitle.focus).toHaveBeenCalledWith({ preventScroll: true });
        expect(fakeDocument.activeElement).toBe(fakeDocument.routeTitle);
    });

    it('preserves focus when Expo resolves its placeholder route to the original deep link', () => {
        Object.assign(window, { location: { pathname: '/today' } });
        const fakeDocument = new FakeDocument();
        const skipLink = new FakeElement(fakeDocument);
        fakeDocument.activeElement = skipLink;
        Object.assign(globalThis, { document: fakeDocument });

        const hook = renderHook(
            ({ pathname, title }: { pathname: string; title: string }) =>
                useBrowserRouteFocus(pathname, title),
            { initialProps: { pathname: '/', title: 'Calibrate' } }
        );

        hook.rerender({ pathname: '/today', title: 'Today - Calibrate' });

        expect(fakeDocument.title).toBe('Today - Calibrate');
        expect(fakeDocument.activeElement).toBe(skipLink);
        expect(fakeDocument.routeTitle.focus).not.toHaveBeenCalled();

        hook.rerender({ pathname: '/progress', title: 'Progress - Calibrate' });

        expect(fakeDocument.routeTitle.focus).toHaveBeenCalledWith({ preventScroll: true });
        expect(fakeDocument.activeElement).toBe(fakeDocument.routeTitle);
    });
});
