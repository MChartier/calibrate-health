import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import type { FoodLogEntry } from '@calibrate/api-client';
import type { MealPeriod } from '@calibrate/shared';
import { AddFoodSheet } from '../../src/components/AddFoodSheet';
import { AppButton } from '../../src/components/AppButton';
import { AppText } from '../../src/components/AppText';
import { BottomSheetModal } from '../../src/components/BottomSheetModal';
import { CalorieBalanceCard } from '../../src/components/CalorieBalanceCard';
import { DateNavigation } from '../../src/components/DateNavigation';
import { DayCompletionCard } from '../../src/components/DayCompletionCard';
import { FoodLogTimelineCard } from '../../src/components/FoodLogTimelineCard';
import { LogContentSkeleton } from '../../src/components/LogContentSkeleton';
import { NumberStepperField } from '../../src/components/NumberStepperField';
import { OverlaySelect, type OverlaySelectOption } from '../../src/components/OverlaySelect';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { TextField } from '../../src/components/TextField';
import { useAuth } from '../../src/auth/AuthContext';
import { executeOrQueueMutation, OFFLINE_MUTATION_OPERATIONS } from '../../src/offline/operations';
import { useOfflineOutbox } from '../../src/offline/provider';
import { useSharedLogDateNavigation } from '../../src/context/LogDateContext';
import { addDaysToDateOnly } from '../../src/utils/dates';
import { formatMealPeriod } from '../../src/utils/format';
import { MEAL_OPTIONS } from '../../src/utils/meals';
import { colors, spacing } from '../../src/theme';

const SERVINGS_STEP = 0.1; // Edit servings with the same precision as the add-food flow.
const MEAL_SELECTOR_OPTIONS: Array<OverlaySelectOption<MealPeriod>> = MEAL_OPTIONS.map((option) => ({
    value: option,
    label: formatMealPeriod(option)
}));

export default function TodayScreen() {
    const { api } = useAuth();
    const { enqueue } = useOfflineOutbox();
    const queryClient = useQueryClient();
    const dateNavigation = useSharedLogDateNavigation();
    const selectedDate = dateNavigation.selectedDate;
    const [editEntry, setEditEntry] = useState<FoodLogEntry | null>(null);
    const [editName, setEditName] = useState('');
    const [editCalories, setEditCalories] = useState('');
    const [editMeal, setEditMeal] = useState<MealPeriod>('BREAKFAST');
    const [editServings, setEditServings] = useState('');
    const [editError, setEditError] = useState<string | null>(null);
    const [isEditMealSelectorOpen, setIsEditMealSelectorOpen] = useState(false);
    const [addFoodMeal, setAddFoodMeal] = useState<MealPeriod | null | undefined>(undefined);

    const profileQuery = useQuery({ queryKey: ['mobile-profile'], queryFn: () => api.getUserProfile() });
    const foodQuery = useQuery({ queryKey: ['mobile-food', selectedDate], queryFn: () => api.getFoodLog(selectedDate) });
    const foodDayQuery = useQuery({ queryKey: ['mobile-food-day', selectedDate], queryFn: () => api.getFoodDay(selectedDate) });
    const isFoodDayComplete = foodDayQuery.data?.is_complete ?? false;

    useEffect(() => {
        const previousDate = addDaysToDateOnly(selectedDate, -1);
        if (previousDate < dateNavigation.minDate) return;

        void queryClient.prefetchQuery({
            queryKey: ['mobile-food', previousDate],
            queryFn: () => api.getFoodLog(previousDate)
        });
        void queryClient.prefetchQuery({
            queryKey: ['mobile-food-day', previousDate],
            queryFn: () => api.getFoodDay(previousDate)
        });
    }, [api, dateNavigation.minDate, queryClient, selectedDate]);

    async function invalidateLogQueries() {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['mobile-food', selectedDate] }),
            queryClient.invalidateQueries({ queryKey: ['mobile-food-day', selectedDate] }),
            queryClient.invalidateQueries({ queryKey: ['mobile-profile'] }),
            queryClient.invalidateQueries({ queryKey: ['mobile-recent-foods'] })
        ]);
    }

    const toggleFoodDay = useMutation({
        mutationFn: () => {
            const payload = {
                date: selectedDate,
                is_complete: !isFoodDayComplete
            };
            return executeOrQueueMutation({
                operation: OFFLINE_MUTATION_OPERATIONS.UPDATE_FOOD_DAY,
                payload,
                execute: (operationId) => api.updateFoodDay(payload, operationId),
                enqueue
            });
        },
        onSuccess: async () => {
            await Haptics.selectionAsync();
            await invalidateLogQueries();
        }
    });

    const deleteFood = useMutation({
        mutationFn: (id: number) => api.deleteFoodLog(id),
        onSuccess: async () => {
            await Haptics.selectionAsync();
            await invalidateLogQueries();
        }
    });

    const updateFood = useMutation({
        mutationFn: () => {
            if (!editEntry) {
                throw new Error('Choose a food entry to edit.');
            }

            const payload: {
                name: string;
                calories: number;
                meal_period: MealPeriod;
                servings_consumed?: number;
            } = {
                name: editName.trim(),
                calories: Number(editCalories),
                meal_period: editMeal
            };

            if (editServings.trim()) {
                payload.servings_consumed = Number(editServings);
            }

            return api.updateFoodLog(editEntry.id, payload);
        },
        onSuccess: async () => {
            setEditEntry(null);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await invalidateLogQueries();
        },
        onError: (error) => {
            setEditError(error instanceof Error ? error.message : 'Unable to update food entry.');
        }
    });

    const entries = foodQuery.data ?? [];
    const calories = entries.reduce((total, entry) => total + entry.calories, 0);
    const target = profileQuery.data?.calorieSummary.dailyCalorieTarget ?? null;
    const showContentSkeleton =
        (!profileQuery.data || !foodQuery.data || !foodDayQuery.data) &&
        (profileQuery.isLoading || foodQuery.isLoading || foodDayQuery.isLoading);

    function openAddFood(meal?: MealPeriod) {
        setAddFoodMeal(meal ?? null);
    }

    function openEditEntry(entry: FoodLogEntry) {
        setEditEntry(entry);
        setEditName(entry.name);
        setEditCalories(String(entry.calories));
        setEditMeal(entry.meal_period);
        setEditServings(
            typeof entry.servings_consumed === 'number' && Number.isFinite(entry.servings_consumed)
                ? String(entry.servings_consumed)
                : ''
        );
        setEditError(null);
        setIsEditMealSelectorOpen(false);
    }

    function handleSaveEdit() {
        if (!editName.trim()) {
            setEditError('Food name is required.');
            return;
        }

        const parsedCalories = Number(editCalories);
        if (!Number.isFinite(parsedCalories) || parsedCalories < 0) {
            setEditError('Calories must be a non-negative number.');
            return;
        }

        if (editServings.trim()) {
            const parsedServings = Number(editServings);
            if (!Number.isFinite(parsedServings) || parsedServings <= 0) {
                setEditError('Servings must be a positive number.');
                return;
            }
        }

        setEditError(null);
        updateFood.mutate();
    }

    return (
        <Screen reserveBottomTabs>
            <DateNavigation navigation={dateNavigation} />

            {showContentSkeleton ? (
                <LogContentSkeleton />
            ) : (
                <>
                    <CalorieBalanceCard
                        totalCalories={calories}
                        targetCalories={target}
                    />

                    <FoodLogTimelineCard
                        entries={entries}
                        disabled={isFoodDayComplete}
                        onAddFood={() => openAddFood()}
                        onAddMeal={openAddFood}
                        onEditEntry={openEditEntry}
                        onDeleteEntry={(entry) => deleteFood.mutate(entry.id)}
                    />

                    <DayCompletionCard
                        isComplete={isFoodDayComplete}
                        isBusy={foodDayQuery.isLoading || toggleFoodDay.isPending}
                        onToggle={() => toggleFoodDay.mutate()}
                    />
                </>
            )}

            {foodQuery.error && <AppText style={styles.error}>{foodQuery.error.message}</AppText>}
            {foodDayQuery.error && <AppText style={styles.error}>{foodDayQuery.error.message}</AppText>}
            {profileQuery.error && <AppText style={styles.error}>{profileQuery.error.message}</AppText>}
            {deleteFood.error && <AppText style={styles.error}>{deleteFood.error.message}</AppText>}

            <BottomSheetModal
                visible={Boolean(editEntry)}
                onRequestClose={() => {
                    setIsEditMealSelectorOpen(false);
                    setEditEntry(null);
                }}
            >
                <SectionHeader title="Edit food" description="Update this log entry snapshot." />
                <TextField label="Food name" value={editName} onChangeText={setEditName} />
                <NumberStepperField label="Calories" value={editCalories} onChangeText={setEditCalories} step={25} min={0} suffix="kcal" />
                {editEntry?.serving_unit_label_snapshot && (
                    <NumberStepperField
                        label={`Servings (${editEntry.serving_unit_label_snapshot})`}
                        value={editServings}
                        onChangeText={setEditServings}
                        step={SERVINGS_STEP}
                        min={SERVINGS_STEP}
                    />
                )}
                <AppText variant="label">Meal</AppText>
                <OverlaySelect
                    accessibilityLabel="Select meal"
                    value={editMeal}
                    options={MEAL_SELECTOR_OPTIONS}
                    isOpen={isEditMealSelectorOpen}
                    onToggle={() => setIsEditMealSelectorOpen((current) => !current)}
                    onChange={(nextMeal) => {
                        setEditMeal(nextMeal);
                        setIsEditMealSelectorOpen(false);
                    }}
                />
                {(editError || updateFood.error) && <AppText style={styles.error}>{editError ?? updateFood.error?.message}</AppText>}
                <View style={styles.row}>
                    <AppButton
                        title="Cancel"
                        variant="secondary"
                        leftIcon={<Ionicons name="close" size={18} color={colors.text} />}
                        onPress={() => {
                            setIsEditMealSelectorOpen(false);
                            setEditEntry(null);
                        }}
                        style={styles.rowButton}
                    />
                    <AppButton
                        title={updateFood.isPending ? 'Saving...' : 'Save'}
                        disabled={updateFood.isPending}
                        leftIcon={<Ionicons name="checkmark" size={18} color="#ffffff" />}
                        onPress={handleSaveEdit}
                        style={styles.rowButton}
                    />
                </View>
            </BottomSheetModal>

            <AddFoodSheet
                visible={addFoodMeal !== undefined}
                date={selectedDate}
                initialMeal={addFoodMeal}
                onClose={() => setAddFoodMeal(undefined)}
            />
        </Screen>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        gap: spacing.md
    },
    rowButton: {
        flex: 1
    },
    error: {
        color: colors.danger
    }
});
