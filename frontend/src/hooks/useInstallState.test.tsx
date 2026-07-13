// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type InstallPromptResult, useInstallState } from './useInstallState';

const CHROMIUM_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
const FIREFOX_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/133.0';

type DeferredPromptFixture = {
    event: BeforeInstallPromptEvent;
    preventDefault: ReturnType<typeof vi.fn>;
    prompt: ReturnType<typeof vi.fn>;
};

/** Build the Chromium-only event shape that browsers dispatch when the PWA is installable. */
function createDeferredPrompt(outcome: BeforeInstallPromptChoiceResult['outcome']): DeferredPromptFixture {
    const preventDefault = vi.fn();
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event('beforeinstallprompt') as BeforeInstallPromptEvent;

    Object.defineProperties(event, {
        platforms: { value: ['web'] },
        prompt: { value: prompt },
        userChoice: { value: Promise.resolve({ outcome, platform: 'web' }) },
        preventDefault: { value: preventDefault }
    });

    return { event, preventDefault, prompt };
}

function InstallStateHarness() {
    const installState = useInstallState();
    const [result, setResult] = useState<InstallPromptResult | 'none'>('none');

    const prompt = async () => {
        setResult(await installState.promptInstall());
    };

    return (
        <>
            <output aria-label="platform">{installState.platformHint}</output>
            <output aria-label="installed">{String(installState.isInstalled)}</output>
            <output aria-label="result">{result}</output>
            {installState.showInstallCta && <button onClick={prompt}>Install app</button>}
            <button onClick={prompt}>Attempt prompt</button>
        </>
    );
}

function mockBrowser(userAgent: string) {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: vi.fn().mockReturnValue({
            matches: false,
            media: '(display-mode: standalone)',
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn()
        })
    });
}

describe('useInstallState', () => {
    beforeEach(() => {
        mockBrowser(CHROMIUM_USER_AGENT);
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it('makes the install action available when Chromium supplies a deferred prompt', async () => {
        const deferredPrompt = createDeferredPrompt('accepted');
        render(<InstallStateHarness />);

        expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull();

        window.dispatchEvent(deferredPrompt.event);

        expect(await screen.findByRole('button', { name: 'Install app' })).toBeTruthy();
        expect(deferredPrompt.preventDefault).toHaveBeenCalledOnce();
        expect(deferredPrompt.prompt).not.toHaveBeenCalled();
    });

    it('prompts for installation and records an accepted choice as installed', async () => {
        const user = userEvent.setup();
        const deferredPrompt = createDeferredPrompt('accepted');
        render(<InstallStateHarness />);
        window.dispatchEvent(deferredPrompt.event);

        await user.click(await screen.findByRole('button', { name: 'Install app' }));

        expect(deferredPrompt.prompt).toHaveBeenCalledOnce();
        expect(await screen.findByText('accepted', { selector: 'output' })).toBeTruthy();
        expect(screen.getByLabelText('installed').textContent).toBe('true');
        expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull();
    });

    it('clears a dismissed prompt without marking the app as installed', async () => {
        const user = userEvent.setup();
        const deferredPrompt = createDeferredPrompt('dismissed');
        render(<InstallStateHarness />);
        window.dispatchEvent(deferredPrompt.event);

        await user.click(await screen.findByRole('button', { name: 'Install app' }));

        expect(deferredPrompt.prompt).toHaveBeenCalledOnce();
        expect(await screen.findByText('dismissed', { selector: 'output' })).toBeTruthy();
        expect(screen.getByLabelText('installed').textContent).toBe('false');
        expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull();
    });

    it('does not advertise installation and returns unavailable in an unsupported browser', async () => {
        vi.restoreAllMocks();
        mockBrowser(FIREFOX_USER_AGENT);
        const user = userEvent.setup();
        render(<InstallStateHarness />);

        expect(screen.getByLabelText('platform').textContent).toBe('other');
        expect(screen.queryByRole('button', { name: 'Install app' })).toBeNull();

        await user.click(screen.getByRole('button', { name: 'Attempt prompt' }));

        expect(await screen.findByText('unavailable', { selector: 'output' })).toBeTruthy();
        expect(screen.getByLabelText('installed').textContent).toBe('false');
    });
});
