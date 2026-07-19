import { readBrowserServerUrl, writeBrowserServerUrl } from './browserServerStorage';

function createStorage(initialValue: string | null = null) {
    let value = initialValue;
    return {
        getItem: jest.fn(() => value),
        setItem: jest.fn((_key: string, nextValue: string) => { value = nextValue; })
    };
}

describe('browser server storage', () => {
    it('restores a normalized self-hosted origin without storing credentials', async () => {
        const storage = createStorage();

        await writeBrowserServerUrl('https://self-hosted.example:3443', storage);

        expect(storage.setItem).toHaveBeenCalledWith(
            'calibrate.web.serverUrl',
            'https://self-hosted.example:3443'
        );
        expect(readBrowserServerUrl(storage, 'https://calibratehealth.app'))
            .toBe('https://self-hosted.example:3443');
    });

    it('falls back when persisted state is missing, malformed, or inaccessible', () => {
        expect(readBrowserServerUrl(createStorage(), 'https://fallback.example'))
            .toBe('https://fallback.example');
        expect(readBrowserServerUrl(createStorage('not a URL'), 'https://fallback.example'))
            .toBe('https://fallback.example');

        const blockedStorage = {
            getItem: jest.fn(() => { throw new Error('blocked'); }),
            setItem: jest.fn(() => { throw new Error('blocked'); })
        };
        expect(readBrowserServerUrl(blockedStorage, 'https://fallback.example'))
            .toBe('https://fallback.example');
        expect(writeBrowserServerUrl('https://self-hosted.example', blockedStorage)).resolves.toBeUndefined();
    });
});
