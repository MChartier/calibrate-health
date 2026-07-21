import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions, type ViewProps } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { FoodLogEntry } from '@calibrate/api-client';
import type { MealPeriod } from '@calibrate/shared';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { type AppTheme, useAppTheme } from '../theme';
import { formatCalories, formatMealPeriod } from '../utils/format';
import { MEAL_OPTIONS } from '../utils/meals';

type FoodLogTimelineCardProps = ViewProps & {
    title?: string;
    entries: FoodLogEntry[];
    disabled?: boolean;
    onEditEntry: (entry: FoodLogEntry) => void;
    onDeleteEntry: (entry: FoodLogEntry) => void;
};

type MealGroup = {
    meal: MealPeriod;
    entries: FoodLogEntry[];
    calories: number;
};

// Start collapsed so a populated food log remains scannable on phone screens.
const DEFAULT_EXPANDED_MEALS: Record<MealPeriod, boolean> = {
    BREAKFAST: false,
    MORNING_SNACK: false,
    LUNCH: false,
    AFTERNOON_SNACK: false,
    DINNER: false,
    EVENING_SNACK: false
};

function getServingText(entry: FoodLogEntry): string | null {
    if (typeof entry.servings_consumed !== 'number' || !Number.isFinite(entry.servings_consumed)) return null;
    return `${entry.servings_consumed} serving${entry.servings_consumed === 1 ? '' : 's'}`;
}

/**
 * Full meal log with expansion for populated meals and snapshot edit/delete actions.
 */
export const FoodLogTimelineCard: React.FC<FoodLogTimelineCardProps> = ({
    title = 'Food log',
    entries,
    disabled,
    onEditEntry,
    onDeleteEntry,
    style,
    ...props
}) => {
    const [expandedMeals, setExpandedMeals] = useState<Record<MealPeriod, boolean>>(DEFAULT_EXPANDED_MEALS);
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    const mealGroups = useMemo<MealGroup[]>(() => {
        return MEAL_OPTIONS.map((meal) => {
            const mealEntries = entries.filter((entry) => entry.meal_period === meal);
            return {
                meal,
                entries: mealEntries,
                calories: mealEntries.reduce((total, entry) => total + entry.calories, 0)
            };
        });
    }, [entries]);

    function toggleMeal(meal: MealPeriod) {
        setExpandedMeals((current) => ({ ...current, [meal]: !current[meal] }));
    }

    return (
        <AppCard {...props} style={style}>
            <View style={styles.headerRow}>
                <View style={styles.headerText}>
                    <AppText accessibilityRole="header" aria-level={2} variant="screenTitle">{title}</AppText>
                </View>
            </View>

            <View style={styles.mealList}>
                {mealGroups.map((group, index) => (
                    <MealTimelineRow
                        key={group.meal}
                        group={group}
                        isFirst={index === 0}
                        isExpanded={expandedMeals[group.meal]}
                        disabled={disabled}
                        onEditEntry={onEditEntry}
                        onDeleteEntry={onDeleteEntry}
                        onToggleMeal={toggleMeal}
                    />
                ))}
            </View>
        </AppCard>
    );
};

type MealTimelineRowProps = {
    group: MealGroup;
    isFirst: boolean;
    isExpanded: boolean;
    disabled?: boolean;
    onEditEntry: (entry: FoodLogEntry) => void;
    onDeleteEntry: (entry: FoodLogEntry) => void;
    onToggleMeal: (meal: MealPeriod) => void;
};

const MealTimelineRow: React.FC<MealTimelineRowProps> = ({
    group,
    isFirst,
    isExpanded,
    disabled,
    onEditEntry,
    onDeleteEntry,
    onToggleMeal
}) => {
    const hasEntries = group.entries.length > 0;
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const { fontScale } = useWindowDimensions();
    const useStackedLayout = fontScale >= 1.6;

    return (
        <View style={styles.mealRow}>
            <View style={styles.mealContent}>
                <View
                    style={[
                        styles.mealHeader,
                        useStackedLayout && styles.mealHeaderStacked,
                        !isFirst && styles.mealDivider
                    ]}
                >
                    <View style={styles.mealTitleRow}>
                        <AppText variant="body" numberOfLines={2} style={styles.mealTitle}>
                            {formatMealPeriod(group.meal)}
                        </AppText>
                    </View>
                    <View style={[styles.mealMetaRow, useStackedLayout && styles.mealMetaRowStacked]}>
                        <AppText variant="body" style={styles.mealCalories}>{formatCalories(group.calories)}</AppText>
                        {hasEntries ? (
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} ${formatMealPeriod(group.meal)}`}
                                android_ripple={{ color: theme.colors.ripple }}
                                onPress={() => onToggleMeal(group.meal)}
                                style={({ pressed }) => [styles.expandButton, pressed && styles.pressed]}
                            >
                                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.onSurfaceVariant} />
                            </Pressable>
                        ) : null}
                    </View>
                </View>
                {hasEntries && isExpanded && (
                    <View style={styles.entries}>
                        {group.entries.map((entry) => (
                            <FoodEntryRow
                                key={entry.id}
                                entry={entry}
                                disabled={disabled}
                                onEditEntry={onEditEntry}
                                onDeleteEntry={onDeleteEntry}
                            />
                        ))}
                    </View>
                )}
            </View>
        </View>
    );
};

type FoodEntryRowProps = {
    entry: FoodLogEntry;
    disabled?: boolean;
    onEditEntry: (entry: FoodLogEntry) => void;
    onDeleteEntry: (entry: FoodLogEntry) => void;
};

const FoodEntryRow: React.FC<FoodEntryRowProps> = ({ entry, disabled, onEditEntry, onDeleteEntry }) => {
    const servingText = getServingText(entry);
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const { fontScale } = useWindowDimensions();
    const useStackedLayout = fontScale >= 1.6;

    return (
        <View style={[styles.entryRow, useStackedLayout && styles.entryRowStacked]}>
            <View style={styles.entryText}>
                <AppText variant="body" numberOfLines={2}>{entry.name}</AppText>
                {servingText && <AppText variant="caption" numberOfLines={2}>{servingText}</AppText>}
            </View>
            <View style={[styles.entryMetaRow, useStackedLayout && styles.entryMetaRowStacked]}>
                <AppText variant="body" style={styles.entryCalories}>{formatCalories(entry.calories)}</AppText>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${entry.name}`}
                    disabled={disabled}
                    android_ripple={{ color: theme.colors.ripple }}
                    onPress={() => onEditEntry(entry)}
                    style={({ pressed }) => [styles.entryAction, disabled && styles.disabled, pressed && styles.pressed]}
                >
                    <Ionicons name="pencil" size={20} color={theme.colors.onSurfaceVariant} />
                </Pressable>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${entry.name}`}
                    disabled={disabled}
                    android_ripple={{ color: theme.colors.ripple }}
                    onPress={() => onDeleteEntry(entry)}
                    style={({ pressed }) => [styles.entryAction, disabled && styles.disabled, pressed && styles.pressed]}
                >
                    <Ionicons name="trash-outline" size={20} color={theme.colors.onSurfaceVariant} />
                </Pressable>
            </View>
        </View>
    );
};

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: theme.spacing.md
    },
    headerText: {
        flex: 1,
        minWidth: 0,
        gap: theme.spacing.xs
    },
    mealList: {
        marginTop: theme.spacing.xs
    },
    mealRow: {
        minHeight: 0
    },
    mealContent: {
        flex: 1,
        minWidth: 0
    },
    mealHeader: {
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.xs
    },
    mealHeaderStacked: {
        alignItems: 'stretch',
        flexDirection: 'column',
        paddingVertical: theme.spacing.sm
    },
    mealDivider: {
        borderTopColor: theme.colors.outlineVariant,
        borderTopWidth: StyleSheet.hairlineWidth
    },
    mealTitleRow: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm
    },
    mealTitle: {
        flex: 1,
        minWidth: 0,
        fontWeight: '600'
    },
    mealMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        flexShrink: 0
    },
    mealMetaRowStacked: {
        alignSelf: 'stretch',
        justifyContent: 'flex-end'
    },
    mealCalories: {
        color: theme.colors.onSurfaceVariant,
        fontWeight: '600',
        textAlign: 'right',
        fontSize: 14
    },
    expandButton: {
        width: theme.interaction.minimumTouchTarget,
        height: theme.interaction.minimumTouchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        overflow: 'hidden'
    },
    entries: {
        borderTopColor: theme.colors.outlineVariant,
        borderTopWidth: StyleSheet.hairlineWidth
    },
    entryRow: {
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        borderBottomColor: theme.colors.outlineVariant,
        borderBottomWidth: StyleSheet.hairlineWidth
    },
    entryRowStacked: {
        alignItems: 'stretch',
        flexDirection: 'column',
        paddingVertical: theme.spacing.sm
    },
    entryText: {
        flex: 1,
        minWidth: 0
    },
    entryCalories: {
        color: theme.colors.onSurfaceVariant,
        textAlign: 'right'
    },
    entryMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs
    },
    entryMetaRowStacked: {
        alignSelf: 'stretch',
        justifyContent: 'flex-end'
    },
    entryAction: {
        width: theme.interaction.minimumTouchTarget,
        height: theme.interaction.minimumTouchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        overflow: 'hidden'
    },
    disabled: {
        opacity: 0.45
    },
    pressed: {
        backgroundColor: theme.colors.surfacePressed
    }
    });
}
