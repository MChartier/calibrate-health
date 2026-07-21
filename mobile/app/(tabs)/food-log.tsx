import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import type { FoodLogEntry } from '@calibrate/api-client';
import type { MealPeriod } from '@calibrate/shared';
import { AppButton } from '../../src/components/AppButton';
import { AppCard } from '../../src/components/AppCard';
import { AppText } from '../../src/components/AppText';
import { BottomSheetModal } from '../../src/components/BottomSheetModal';
import { DateNavigation } from '../../src/components/DateNavigation';
import { FoodLogTimelineCard } from '../../src/components/FoodLogTimelineCard';
import { NumberStepperField } from '../../src/components/NumberStepperField';
import { OverlaySelect } from '../../src/components/OverlaySelect';
import { PageHeader } from '../../src/components/PageHeader';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { SkeletonBlock } from '../../src/components/SkeletonBlock';
import { TextField } from '../../src/components/TextField';
import { useAuth } from '../../src/auth/AuthContext';
import { useSharedLogDateNavigation } from '../../src/context/LogDateContext';
import { usePrefetchPreviousFoodLog } from '../../src/hooks/usePrefetchPreviousFoodLog';
import { executeOrQueueMutation, OFFLINE_MUTATION_OPERATIONS } from '../../src/offline/operations';
import { useOfflineOutbox } from '../../src/offline/provider';
import { MEAL_SELECT_OPTIONS } from '../../src/utils/meals';
import { type AppTheme, useAppTheme } from '../../src/theme';
import { SERVING_INPUT_INCREMENT } from '../../src/config/inputPrecision';

export default function FoodLogScreen() {
    const routeParams = useLocalSearchParams<{ date?: string }>();
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
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    usePrefetchPreviousFoodLog(selectedDate, dateNavigation.minDate);

    const foodQuery = useQuery({ queryKey: ['mobile-food', selectedDate], queryFn: () => api.getFoodLog(selectedDate) });

    useEffect(() => {
        if (typeof routeParams.date === 'string') dateNavigation.setDate(routeParams.date);
    }, [dateNavigation.setDate, routeParams.date]);

    async function invalidateLogQueries() {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['mobile-food', selectedDate] }),
            queryClient.invalidateQueries({ queryKey: ['mobile-profile'] }),
            queryClient.invalidateQueries({ queryKey: ['mobile-recent-foods'] })
        ]);
    }

    const deleteFood = useMutation({
        mutationFn: (id: number) => {
            const payload = { id };
            return executeOrQueueMutation({
                operation: OFFLINE_MUTATION_OPERATIONS.DELETE_FOOD_LOG,
                payload,
                execute: (operationId) => api.deleteFoodLog(id, operationId),
                enqueue
            });
        },
        onSuccess: async () => {
            await Haptics.selectionAsync();
            await invalidateLogQueries();
        }
    });

    const updateFood = useMutation({
        mutationFn: () => {
            if (!editEntry) throw new Error('Choose a food entry to edit.');

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

            if (editServings.trim()) payload.servings_consumed = Number(editServings);

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
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await invalidateLogQueries();
        },
        onError: (error) => {
            setEditError(error instanceof Error ? error.message : 'Unable to update food entry.');
        }
    });

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
        <Screen safeTop reserveBottomTabs>
            <PageHeader
                title="Food log"
                description="Review and edit every meal entry."
                backLabel="Back to Today"
                onBack={() => router.navigate('/(tabs)/today')}
            />

            <DateNavigation navigation={dateNavigation} />

            {foodQuery.isLoading ? (
                <FoodLogSkeleton />
            ) : (
                <FoodLogTimelineCard
                    title="Meals"
                    entries={foodQuery.data ?? []}
                    onEditEntry={openEditEntry}
                    onDeleteEntry={(entry) => deleteFood.mutate(entry.id)}
                />
            )}

            {foodQuery.error && <AppText style={styles.error}>{foodQuery.error.message}</AppText>}
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
                        step={SERVING_INPUT_INCREMENT}
                        min={SERVING_INPUT_INCREMENT}
                    />
                )}
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
                {(editError || updateFood.error) && <AppText style={styles.error}>{editError ?? updateFood.error?.message}</AppText>}
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
        </Screen>
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
        }
    });
}
