export const QUICK_ADD_SHORTCUT_QUERY_PARAM = 'quickAdd'; // Query param used to trigger quick-add dialogs from PWA shortcuts.

export const QUICK_ADD_SHORTCUT_ACTIONS = {
    food: 'food',
    weight: 'weight'
} as const;

export type QuickAddShortcutAction = typeof QUICK_ADD_SHORTCUT_ACTIONS[keyof typeof QUICK_ADD_SHORTCUT_ACTIONS];
