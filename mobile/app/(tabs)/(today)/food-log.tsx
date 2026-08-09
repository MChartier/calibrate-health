import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, usePathname } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FoodLogCopyPayload, FoodLogEntry, FoodLogUpdatePayload } from '@calibrate/api-client';
import type { MealPeriod } from '@calibrate/shared';
import { AddFoodSheet } from '../../../src/components/AddFoodSheet';
import { AsyncStateBoundary, useAsyncResourceState, useOnlineStatus } from '../../../src/components/AsyncStateBoundary';
import { AppButton } from '../../../src/components/AppButton';
import { AppCard } from '../../../src/components/AppCard';
import { AppText } from '../../../src/components/AppText';
import { BottomSheetModal } from '../../../src/components/BottomSheetModal';
import {
    CopyFoodSheet,
    type FoodCopySelection,
    type FoodCopySource
} from '../../../src/components/CopyFoodSheet';
import { DateNavigation } from '../../../src/components/DateNavigation';
import { FoodLogTimelineCard } from '../../../src/components/FoodLogTimelineCard';
import { useFoodDayStatus } from '../../../src/components/FoodTrackingStatus';
import { NumberStepperField } from '../../../src/components/NumberStepperField';
import { OverlaySelect } from '../../../src/components/OverlaySelect';
import { TabScreen } from '../../../src/components/TabScreen';
import { SectionHeader } from '../../../src/components/SectionHeader';
import { SaveMealAsRecipeSheet } from '../../../src/components/SaveMealAsRecipeSheet';
import { SkeletonBlock } from '../../../src/components/SkeletonBlock';
import { TextField } from '../../../src/components/TextField';
import { useAuth } from '../../../src/auth/AuthContext';
import { useAddFoodRequest } from '../../../src/context/AddFoodRequestContext';
import { useSharedLogDateNavigation } from '../../../src/context/LogDateContext';
import { calibrationStatusQueryKey } from '../../../src/calibration/queryKeys';
import { usePrefetchPreviousFoodLog } from '../../../src/hooks/usePrefetchPreviousFoodLog';
import { getSafeActionErrorMessage } from '../../../src/errors/presentation';
import { getFoodLogEditableAmount } from '../../../src/food/foodLogAmount';
import { useFoodDeleteRecovery } from '../../../src/food/useFoodDeleteRecovery';
import { getActiveTabRoute } from '../../../src/navigation/contextualFab';
import { executeOrQueueMutation, OFFLINE_MUTATION_OPERATIONS } from '../../../src/offline/operations';
import { useOfflineOutbox } from '../../../src/offline/provider';
import { triggerHapticFeedback } from '../../../src/utils/haptics';
import { formatDateOnlyForDisplay } from '../../../src/utils/dates';
import { MEAL_SELECT_OPTIONS } from '../../../src/utils/meals';
import { type AppTheme, useAppTheme } from '../../../src/theme';
import { SERVING_INPUT_INCREMENT } from '../../../src/config/inputPrecision';

export default function FoodLogScreen() {
    const routeParams = useLocalSearchParams<{ date?: string }>();
    const pathname = usePathname();
    const { api, user } = useAuth();
    const outbox = useOfflineOutbox();
    const { enqueue } = outbox;
    const queryClient = useQueryClient();
    const dateNavigation = useSharedLogDateNavigation();
    const { request: addFoodRequest, consumeRequest: consumeAddFoodRequest } = useAddFoodRequest();
    const selectedDate = dateNavigation.selectedDate;
    const [addFoodMeal, setAddFoodMeal] = useState<MealPeriod | null | undefined>(undefined);
    const [editEntry, setEditEntry] = useState<FoodLogEntry | null>(null);
    const [editName, setEditName] = useState('');
    const [editCalories, setEditCalories] = useState('');
    const [editMeal, setEditMeal] = useState<MealPeriod>('BREAKFAST');
    const [editAmount, setEditAmount] = useState('');
    const [editAmountDirty, setEditAmountDirty] = useState(false);
    const [editCaloriesOverridden, setEditCaloriesOverridden] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);
    const [isEditMealSelectorOpen, setIsEditMealSelectorOpen] = useState(false);
    const [recipeDraftMeal, setRecipeDraftMeal] = useState<MealPeriod | null>(null);
    const [recipeDraftEntries, setRecipeDraftEntries] = useState<FoodLogEntry[]>([]);
    const [recipeSavedMessage, setRecipeSavedMessage] = useState<string | null>(null);
    const [copySource, setCopySource] = useState<FoodCopySource | null>(null);
    const [copySuccessMessage, setCopySuccessMessage] = useState<string | null>(null);
    const copyOperationRef = useRef<{ key: string; operationId: string } | null>(null);
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    usePrefetchPreviousFoodLog(selectedDate, dateNavigation.minDate);

    const foodQuery = useQuery({ queryKey: ['mobile-food', selectedDate], queryFn: () => api.getFoodLog(selectedDate) });
    const foodDayQuery = useFoodDayStatus(selectedDate);
    const isOnline = useOnlineStatus();
    const foodState = useAsyncResourceState(foodQuery, (entries) => entries.length === 0);
    const foodDayState = useAsyncResourceState(foodDayQuery, () => false);
    const canEditFood = foodDayQuery.data?.status === 'OPEN';
    const editAmountConfig = editEntry ? getFoodLogEditableAmount(editEntry) : null;

    useEffect(() => {
        if (typeof routeParams.date === 'string') dateNavigation.setDate(routeParams.date);
    }, [dateNavigation.setDate, routeParams.date]);

    useEffect(() => {
        if (!addFoodRequest || getActiveTabRoute(pathname) !== 'food-log') return;
        const requestDate = addFoodRequest.date ?? selectedDate;
        if (requestDate !== selectedDate) {
            dateNavigation.setDate(requestDate);
            return;
        }
        if (!canEditFood) return;
        setAddFoodMeal(addFoodRequest.meal ?? null);
        consumeAddFoodRequest(addFoodRequest.id);
    }, [addFoodRequest, canEditFood, consumeAddFoodRequest, dateNavigation.setDate, pathname, selectedDate]);

    async function invalidateLogQueries(additionalDates: string[] = []) {
        const dates = Array.from(new Set([selectedDate, ...additionalDates]));
        await Promise.all([
            ...dates.flatMap((date) => [
                queryClient.invalidateQueries({ queryKey: ['mobile-food', date] }),
                queryClient.invalidateQueries({ queryKey: ['mobile-food-day', date] })
            ]),
            queryClient.invalidateQueries({ queryKey: calibrationStatusQueryKey }),
            queryClient.invalidateQueries({ queryKey: ['mobile-profile'] }),
            queryClient.invalidateQueries({ queryKey: ['mobile-recent-foods'] })
        ]);
    }

    const deleteRecovery = useFoodDeleteRecovery({
        entries: foodQuery.data,
        deleteFoodLog: (id, operationId) => api.deleteFoodLog(id, operationId),
        outbox,
        onCommitted: async () => {
            triggerHapticFeedback(user?.haptics_enabled, 'selection');
            await invalidateLogQueries();
        }
    });

    const copyFood = useMutation({
        mutationFn: (selection: FoodCopySelection) => {
            if (!copySource || copySource.kind !== selection.kind) {
                throw new Error('Choose a meal or day to copy.');
            }
            const operationKey = JSON.stringify({ sourceDate: selectedDate, source: copySource, selection });
            if (copyOperationRef.current?.key !== operationKey) {
                copyOperationRef.current = { key: operationKey, operationId: Crypto.randomUUID() };
            }
            const payload: FoodLogCopyPayload = {
                operation_id: copyOperationRef.current.operationId,
                source_date: selectedDate,
                target_date: selection.targetDate
            };
            if (copySource.kind === 'meal') {
                if (selection.kind !== 'meal') throw new Error('Choose a meal to copy.');
                payload.meal_mappings = [{
                    source_meal_period: copySource.meal,
                    target_meal_period: selection.targetMeal
                }];
            }
            return api.copyFoodLogs(payload);
        },
        onSuccess: async (response) => {
            copyOperationRef.current = null;
            setCopySource(null);
            const noun = response.copied_count === 1 ? 'entry' : 'entries';
            setCopySuccessMessage(
                `${response.copied_count} ${noun} copied to ${formatDateOnlyForDisplay(response.target_date)}.`
            );
            triggerHapticFeedback(user?.haptics_enabled, 'success');
            await invalidateLogQueries([response.target_date]);
        }
    });

    const updateFood = useMutation({
        mutationFn: () => {
            if (!editEntry) throw new Error('Choose a food entry to edit.');

            const payload: FoodLogUpdatePayload = {
                name: editName.trim(),
                meal_period: editMeal
            };

            if (editAmountConfig && editAmountDirty && editAmount.trim()) {
                payload.servings_consumed = editAmountConfig.toServings(Number(editAmount));
            }
            const hasPreciseCalorieBasis = typeof editEntry.calories_per_serving_snapshot === 'number'
                && Number.isFinite(editEntry.calories_per_serving_snapshot);
            if (editCaloriesOverridden || (editAmountDirty && !hasPreciseCalorieBasis)) {
                payload.calories = Number(editCalories);
            }

            const queuedPayload = { id: editEntry.id, update: payload };
            return executeOrQueueMutation({
                operation: OFFLINE_MUTATION_OPERATIONS.UPDATE_FOOD_LOG,
                payload: queuedPayload,
                execute: (operationId) => api.updateFoodLog(editEntry.id, payload, operationId),
                enqueue
            });
        },
        onSuccess: async () => {
            setEditEntry(null);
            triggerHapticFeedback(user?.haptics_enabled, 'success');
            await invalidateLogQueries();
        },
        onError: (error) => {
            setEditError(getSafeActionErrorMessage(error, 'Unable to update food entry.'));
        }
    });

    function openCopy(source: FoodCopySource) {
        copyFood.reset();
        copyOperationRef.current = null;
        setCopySuccessMessage(null);
        setCopySource(source);
    }

    function openEditEntry(entry: FoodLogEntry) {
        const amountConfig = getFoodLogEditableAmount(entry);
        setEditEntry(entry);
        setEditName(entry.name);
        setEditCalories(String(entry.calories));
        setEditAmountDirty(false);
        setEditCaloriesOverridden(false);
        setEditMeal(entry.meal_period);
        setEditAmount(amountConfig ? String(amountConfig.amount) : '');
        setEditError(null);
        setIsEditMealSelectorOpen(false);
    }

    function handleEditAmountChange(nextAmount: string) {
        setEditAmount(nextAmount);
        const parsedAmount = Number(nextAmount);
        setEditAmountDirty(
            !nextAmount.trim()
            || !Number.isFinite(parsedAmount)
            || !editAmountConfig
            || Math.abs(parsedAmount - editAmountConfig.amount) > 0.000001
        );
        if (editCaloriesOverridden || !editEntry || !editAmountConfig) return;

        if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return;
        const servings = editAmountConfig.toServings(parsedAmount);
        const caloriesPerServing = editEntry.calories_per_serving_snapshot;
        if (typeof caloriesPerServing === 'number' && Number.isFinite(caloriesPerServing)) {
            setEditCalories(String(Math.round(servings * caloriesPerServing)));
        }
    }

    function handleSaveEdit() {
        if (!editName.trim()) {
            setEditError('Food name is required.');
            return;
        }

        if (!editCalories.trim()) {
            setEditError('Calories are required.');
            return;
        }
        const parsedCalories = Number(editCalories);
        if (!Number.isFinite(parsedCalories) || parsedCalories < 0) {
            setEditError('Calories must be a non-negative number.');
            return;
        }

        if (editAmountConfig) {
            const parsedAmount = Number(editAmount);
            if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
                setEditError('Amount must be a positive number.');
                return;
            }
        }

        setEditError(null);
        updateFood.mutate();
    }

    return (
        <TabScreen reserveFab={canEditFood}>
            <DateNavigation navigation={dateNavigation} />

            <AsyncStateBoundary
                state={foodState}
                resourceLabel="food log"
                loading={<FoodLogSkeleton />}
                empty={(
                    <FoodLogTimelineCard
                        title="Meals"
                        entries={deleteRecovery.visibleEntries}
                        disabled={!canEditFood}
                        copyDisabled={!isOnline}
                        onEditEntry={openEditEntry}
                        onDeleteEntry={deleteRecovery.requestDelete}
                        onCopyMeal={(meal) => openCopy({ kind: 'meal', meal })}
                        onCopyDay={() => openCopy({ kind: 'day' })}
                    />
                )}
                onRetry={isOnline ? () => foodQuery.refetch() : undefined}
                retrying={foodQuery.isFetching}
            >
                <FoodLogTimelineCard
                    title="Meals"
                    entries={deleteRecovery.visibleEntries}
                    disabled={!canEditFood}
                    copyDisabled={!isOnline}
                    onEditEntry={openEditEntry}
                    onDeleteEntry={deleteRecovery.requestDelete}
                    onCopyMeal={(meal) => openCopy({ kind: 'meal', meal })}
                    onCopyDay={() => openCopy({ kind: 'day' })}
                    onSaveMealAsRecipe={(meal, entries) => {
                        setRecipeSavedMessage(null);
                        setRecipeDraftMeal(meal);
                        setRecipeDraftEntries(entries);
                    }}
                />
            </AsyncStateBoundary>

            <AsyncStateBoundary
                state={foodDayState}
                resourceLabel="day status"
                loading={null}
                empty={null}
                onRetry={isOnline ? () => foodDayQuery.refetch() : undefined}
                retrying={foodDayQuery.isFetching}
            >
                {null}
            </AsyncStateBoundary>

            {recipeSavedMessage && (
                <AppText accessibilityLiveRegion="polite" variant="muted">{recipeSavedMessage}</AppText>
            )}
            {copySuccessMessage && (
                <AppText accessibilityLiveRegion="polite" variant="muted">{copySuccessMessage}</AppText>
            )}
            {deleteRecovery.pendingDelete && (
                <View accessibilityLiveRegion="polite" style={styles.noticeRow}>
                    <AppText style={styles.noticeText}>Deleted {deleteRecovery.pendingDelete.entry.name}.</AppText>
                    <AppButton
                        title="Undo"
                        variant="secondary"
                        leftIcon={<Ionicons name="arrow-undo-outline" size={18} color={theme.colors.onSurface} />}
                        onPress={() => deleteRecovery.undo(deleteRecovery.pendingDelete?.operationId)}
                    />
                </View>
            )}
            {deleteRecovery.failure && (
                <View accessibilityRole="alert" style={styles.noticeRow}>
                    <AppText style={[styles.noticeText, styles.error]}>{deleteRecovery.failure.message}</AppText>
                    <AppButton
                        title="Retry delete"
                        variant="secondary"
                        onPress={() => void deleteRecovery.retry(deleteRecovery.failure?.operationId)}
                    />
                </View>
            )}

            <AddFoodSheet
                visible={addFoodMeal !== undefined && canEditFood}
                date={selectedDate}
                initialMeal={addFoodMeal}
                returnTo="food-log"
                onClose={() => setAddFoodMeal(undefined)}
            />

            <CopyFoodSheet
                visible={copySource !== null}
                source={copySource}
                sourceDate={selectedDate}
                minDate={dateNavigation.minDate}
                maxDate={dateNavigation.maxDate}
                isSubmitting={copyFood.isPending}
                error={copyFood.error
                    ? getSafeActionErrorMessage(copyFood.error, 'Unable to copy food.')
                    : null}
                onRequestClose={() => {
                    if (copyFood.isPending) return;
                    setCopySource(null);
                }}
                onSubmit={(selection) => copyFood.mutate(selection)}
            />

            <SaveMealAsRecipeSheet
                visible={recipeDraftMeal !== null}
                date={selectedDate}
                meal={recipeDraftMeal}
                entries={recipeDraftEntries}
                onClose={() => {
                    setRecipeDraftMeal(null);
                    setRecipeDraftEntries([]);
                }}
                onSaved={(recipeName) => {
                    setRecipeDraftMeal(null);
                    setRecipeDraftEntries([]);
                    setRecipeSavedMessage(`${recipeName} saved to Recipes.`);
                }}
            />

            <BottomSheetModal
                visible={Boolean(editEntry)}
                onRequestClose={() => {
                    setIsEditMealSelectorOpen(false);
                    setEditEntry(null);
                }}
            >
                <SectionHeader title="Edit food" description="Update this log entry snapshot." />
                <TextField label="Food name" value={editName} onChangeText={setEditName} />
                {editAmountConfig && (
                    <NumberStepperField
                        label="Amount"
                        value={editAmount}
                        onChangeText={handleEditAmountChange}
                        step={editAmountConfig.unitLabel.toLowerCase() === 'g' ? 1 : SERVING_INPUT_INCREMENT}
                        min={editAmountConfig.unitLabel.toLowerCase() === 'g' ? 1 : SERVING_INPUT_INCREMENT}
                        suffix={editAmountConfig.unitLabel}
                    />
                )}
                <NumberStepperField
                    label="Calories"
                    value={editCalories}
                    onChangeText={(nextCalories) => {
                        setEditCalories(nextCalories);
                        setEditCaloriesOverridden(true);
                    }}
                    step={25}
                    min={0}
                    suffix="kcal"
                />
                <AppText variant="label">Meal</AppText>
                <OverlaySelect
                    accessibilityLabel="Select meal"
                    value={editMeal}
                    options={MEAL_SELECT_OPTIONS}
                    isOpen={isEditMealSelectorOpen}
                    onToggle={() => setIsEditMealSelectorOpen((current) => !current)}
                    onChange={(nextMeal) => {
                        setEditMeal(nextMeal);
                        setIsEditMealSelectorOpen(false);
                    }}
                />
                {(editError || updateFood.error) && (
                    <AppText accessibilityRole="alert" style={styles.error}>
                        {editError ?? getSafeActionErrorMessage(updateFood.error, 'Unable to update food entry.')}
                    </AppText>
                )}
                <View style={styles.row}>
                    <AppButton
                        title="Cancel"
                        variant="secondary"
                        leftIcon={<Ionicons name="close" size={18} color={theme.colors.text} />}
                        onPress={() => {
                            setIsEditMealSelectorOpen(false);
                            setEditEntry(null);
                        }}
                        style={styles.rowButton}
                    />
                    <AppButton
                        title={updateFood.isPending ? 'Saving...' : 'Save'}
                        disabled={updateFood.isPending}
                        leftIcon={<Ionicons name="checkmark" size={18} color={theme.colors.onPrimary} />}
                        onPress={handleSaveEdit}
                        style={styles.rowButton}
                    />
                </View>
            </BottomSheetModal>
        </TabScreen>
    );
}

const FoodLogSkeleton: React.FC = () => (
    <AppCard>
        <SkeletonBlock width="28%" height={30} />
        {[0, 1, 2, 3, 4, 5].map((row) => (
            <View key={row} style={skeletonStyles.row}>
                <SkeletonBlock width="40%" height={20} />
                <SkeletonBlock width={72} height={20} />
            </View>
        ))}
    </AppCard>
);

const skeletonStyles = StyleSheet.create({
    row: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    }
});

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        row: {
            flexDirection: 'row',
            gap: theme.spacing.md
        },
        rowButton: {
            flex: 1
        },
        error: {
            color: theme.colors.danger
        },
        noticeRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.md
        },
        noticeText: {
            flex: 1,
            minWidth: 0
        }
    });
}
