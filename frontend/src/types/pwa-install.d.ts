export {};

declare global {
    interface BeforeInstallPromptChoiceResult {
        outcome: 'accepted' | 'dismissed';
        platform: string;
    }

    interface BeforeInstallPromptEvent extends Event {
        readonly platforms: string[];
        readonly userChoice: Promise<BeforeInstallPromptChoiceResult>;
        prompt: () => Promise<void>;
    }

    interface WindowEventMap {
        beforeinstallprompt: BeforeInstallPromptEvent;
    }
}
