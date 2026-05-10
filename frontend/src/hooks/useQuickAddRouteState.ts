import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { LogDateNavigationState } from '../context/quickAddFabState';
import { QUICK_ADD_SHORTCUT_ACTIONS, QUICK_ADD_SHORTCUT_QUERY_PARAM } from '../constants/pwaShortcuts';
import { getQuickAddAction } from '../utils/quickAddShortcut';

type QuickAddLogDateBridgeArgs = {
    selectedDate: string;
    navigation: LogDateNavigationState;
    setLogDateOverride: (date: string | null) => void;
    setLogDateNavigation: (state: LogDateNavigationState | null) => void;
    isActive?: boolean;
};

type QuickAddShortcutActionArgs = {
    navigation: Pick<LogDateNavigationState, 'setDate'>;
    today: string;
    openFoodDialog: () => void;
    openWeightDialog: () => void;
};

/**
 * Publish route-owned local-day controls to the shared quick-add shell while the route is active.
 */
export function useQuickAddLogDateBridge({
    selectedDate,
    navigation,
    setLogDateOverride,
    setLogDateNavigation,
    isActive = true
}: QuickAddLogDateBridgeArgs): void {
    useEffect(() => {
        setLogDateOverride(isActive ? selectedDate : null);
    }, [isActive, selectedDate, setLogDateOverride]);

    useEffect(() => {
        return () => {
            setLogDateOverride(null);
        };
    }, [setLogDateOverride]);

    useEffect(() => {
        setLogDateNavigation(isActive ? navigation : null);
    }, [isActive, navigation, setLogDateNavigation]);

    useEffect(() => {
        return () => {
            setLogDateNavigation(null);
        };
    }, [setLogDateNavigation]);
}

/**
 * Consume one-shot PWA shortcut query params and open the matching quick-add dialog.
 */
export function useQuickAddShortcutAction({
    navigation,
    today,
    openFoodDialog,
    openWeightDialog
}: QuickAddShortcutActionArgs): void {
    const [searchParams, setSearchParams] = useSearchParams();
    const searchParamSnapshot = searchParams.toString();
    const consumedShortcutSnapshotRef = useRef<string | null>(null);
    const { setDate } = navigation;

    useEffect(() => {
        const nextParams = new URLSearchParams(searchParamSnapshot);
        const quickAddAction = getQuickAddAction(nextParams);
        if (!quickAddAction) {
            consumedShortcutSnapshotRef.current = null;
            return;
        }
        if (consumedShortcutSnapshotRef.current === searchParamSnapshot) return;

        consumedShortcutSnapshotRef.current = searchParamSnapshot;

        setDate(today);

        switch (quickAddAction) {
            case QUICK_ADD_SHORTCUT_ACTIONS.food:
                openFoodDialog();
                break;
            case QUICK_ADD_SHORTCUT_ACTIONS.weight:
                openWeightDialog();
                break;
            default:
                break;
        }

        nextParams.delete(QUICK_ADD_SHORTCUT_QUERY_PARAM);
        setSearchParams(nextParams, { replace: true });
    }, [
        openFoodDialog,
        openWeightDialog,
        searchParamSnapshot,
        setDate,
        setSearchParams,
        today
    ]);
}
