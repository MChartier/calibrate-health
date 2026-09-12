/** Native navigation is guarded by usePreventRemove in useConfirmDiscardNavigation. */
export function useBrowserDiscardNavigation(
    _shouldPreventRemoval: boolean,
    _requestNavigation: (navigate: () => void) => Promise<void>
): void {}
