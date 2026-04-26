import {
    QUICK_ADD_SHORTCUT_ACTIONS,
    QUICK_ADD_SHORTCUT_QUERY_PARAM,
    type QuickAddShortcutAction
} from '../constants/pwaShortcuts';

/**
 * Resolve a valid quick-add action from URL params used by PWA shortcuts.
 */
export function getQuickAddAction(searchParams: URLSearchParams): QuickAddShortcutAction | null {
    const action = searchParams.get(QUICK_ADD_SHORTCUT_QUERY_PARAM);
    if (action === QUICK_ADD_SHORTCUT_ACTIONS.food) return QUICK_ADD_SHORTCUT_ACTIONS.food;
    if (action === QUICK_ADD_SHORTCUT_ACTIONS.weight) return QUICK_ADD_SHORTCUT_ACTIONS.weight;
    return null;
}

