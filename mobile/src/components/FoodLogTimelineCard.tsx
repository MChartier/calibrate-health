import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FoodLogEntry } from '@calibrate/api-client';
import type { MealPeriod } from '@calibrate/shared';
import { AppButton } from './AppButton';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { colors, radius, spacing } from '../theme';
import { formatCalories, formatMealPeriod } from '../utils/format';
import { MEAL_OPTIONS } from '../utils/meals';

type FoodLogTimelineCardProps = ViewProps & {
    entries: FoodLogEntry[];
    disabled?: boolean;
    onAddFood: () => void;
    onAddMeal: (meal: MealPeriod) => void;
    onEditEntry: (entry: FoodLogEntry) => void;
    onDeleteEntry: (entry: FoodLogEntry) => void;
};

type MealGroup = {
    meal: MealPeriod;
    entries: FoodLogEntry[];
    calories: number;
};

const MEAL_ICONS: Record<MealPeriod, keyof typeof Ionicons.glyphMap> = {
    BREAKFAST: 'egg-outline',
    MORNING_SNACK: 'cafe-outline',
    LUNCH: 'fast-food-outline',
    AFTERNOON_SNACK: 'ice-cream-outline',
    DINNER: 'restaurant-outline',
    EVENING_SNACK: 'wine-outline'
};

const TIMELINE_ICON_SIZE = 34; // Keeps meal icons aligned with the PWA-style vertical timeline without dominating phone rows.

function getServingText(entry: FoodLogEntry): string | null {
    if (typeof entry.servings_consumed !== 'number' || !Number.isFinite(entry.servings_consumed)) return null;
    return `${entry.servings_consumed} serving${entry.servings_consumed === 1 ? '' : 's'}`;
}

/**
 * Interactive meal timeline for the Log tab, matching the PWA's meal grouping and add/edit/delete affordances.
 */
export const FoodLogTimelineCard: React.FC<FoodLogTimelineCardProps> = ({
    entries,
    disabled,
    onAddFood,
    onAddMeal,
    onEditEntry,
    onDeleteEntry,
    style,
    ...props
}) => {
    const [expandedMeals, setExpandedMeals] = useState<Record<MealPeriod, boolean>>({
        BREAKFAST: true,
        MORNING_SNACK: true,
        LUNCH: true,
        AFTERNOON_SNACK: true,
        DINNER: true,
        EVENING_SNACK: true
    });

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
                    <AppText variant="screenTitle">Food log</AppText>
                </View>
            </View>

            <View>
                {mealGroups.map((group, index) => (
                    <MealTimelineRow
                        key={group.meal}
                        group={group}
                        isFirst={index === 0}
                        isLast={index === mealGroups.length - 1}
                        isExpanded={expandedMeals[group.meal]}
                        disabled={disabled}
                        onAddMeal={onAddMeal}
                        onEditEntry={onEditEntry}
                        onDeleteEntry={onDeleteEntry}
                        onToggleMeal={toggleMeal}
                    />
                ))}
            </View>

            <AppButton
                title="Add food"
                disabled={disabled}
                leftIcon={<Ionicons name="add" size={18} color="#ffffff" />}
                onPress={onAddFood}
            />
        </AppCard>
    );
};

type MealTimelineRowProps = {
    group: MealGroup;
    isFirst: boolean;
    isLast: boolean;
    isExpanded: boolean;
    disabled?: boolean;
    onAddMeal: (meal: MealPeriod) => void;
    onEditEntry: (entry: FoodLogEntry) => void;
    onDeleteEntry: (entry: FoodLogEntry) => void;
    onToggleMeal: (meal: MealPeriod) => void;
};

const MealTimelineRow: React.FC<MealTimelineRowProps> = ({
    group,
    isFirst,
    isLast,
    isExpanded,
    disabled,
    onAddMeal,
    onEditEntry,
    onDeleteEntry,
    onToggleMeal
}) => {
    const hasEntries = group.entries.length > 0;

    return (
        <View style={styles.mealRow}>
            <View style={styles.rail}>
                {!isFirst && <View style={[styles.railLine, styles.railLineTop]} />}
                {!isLast && <View style={[styles.railLine, styles.railLineBottom]} />}
                <View style={[styles.mealIcon, hasEntries && styles.mealIconActive]}>
                    <Ionicons
                        name={MEAL_ICONS[group.meal]}
                        size={18}
                        color={hasEntries ? colors.primaryDark : colors.muted}
                    />
                </View>
            </View>
            <View style={styles.mealContent}>
                <View style={styles.mealHeader}>
                    <View style={styles.mealTitleRow}>
                        <AppText variant="subtitle" numberOfLines={1} adjustsFontSizeToFit style={styles.mealTitle}>
                            {formatMealPeriod(group.meal)}
                        </AppText>
                    </View>
                    <View style={styles.mealMetaRow}>
                        <AppText variant="body" style={styles.mealCalories}>{formatCalories(group.calories)}</AppText>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Add food to ${formatMealPeriod(group.meal)}`}
                            disabled={disabled}
                            onPress={() => onAddMeal(group.meal)}
                            style={({ pressed }) => [styles.addMealButton, disabled && styles.disabled, pressed && styles.pressed]}
                        >
                            <Ionicons name="add" size={20} color={disabled ? colors.muted : colors.primaryDark} />
                        </Pressable>
                        {hasEntries ? (
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} ${formatMealPeriod(group.meal)}`}
                                onPress={() => onToggleMeal(group.meal)}
                                style={({ pressed }) => [styles.expandButton, pressed && styles.pressed]}
                            >
                                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
                            </Pressable>
                        ) : (
                            <View style={styles.expandButton} />
                        )}
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

    return (
        <View style={styles.entryRow}>
            <View style={styles.entryText}>
                <AppText variant="body" numberOfLines={1}>{entry.name}</AppText>
                {servingText && <AppText variant="caption" numberOfLines={1}>{servingText}</AppText>}
            </View>
            <AppText variant="body" style={styles.entryCalories}>{formatCalories(entry.calories)}</AppText>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${entry.name}`}
                disabled={disabled}
                onPress={() => onEditEntry(entry)}
                style={({ pressed }) => [styles.entryAction, disabled && styles.disabled, pressed && styles.pressed]}
            >
                <Ionicons name="pencil" size={18} color={disabled ? colors.muted : colors.muted} />
            </Pressable>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${entry.name}`}
                disabled={disabled}
                onPress={() => onDeleteEntry(entry)}
                style={({ pressed }) => [styles.entryAction, disabled && styles.disabled, pressed && styles.pressed]}
            >
                <Ionicons name="trash" size={18} color={disabled ? colors.muted : colors.danger} />
            </Pressable>
        </View>
    );
};

const styles = StyleSheet.create({
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    headerText: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs
    },
    mealRow: {
        flexDirection: 'row',
        minHeight: 64
    },
    rail: {
        width: TIMELINE_ICON_SIZE,
        alignItems: 'center',
        position: 'relative'
    },
    railLine: {
        position: 'absolute',
        width: StyleSheet.hairlineWidth,
        backgroundColor: colors.border
    },
    railLineTop: {
        top: 0,
        bottom: '50%'
    },
    railLineBottom: {
        top: '50%',
        bottom: 0
    },
    mealIcon: {
        width: TIMELINE_ICON_SIZE,
        height: TIMELINE_ICON_SIZE,
        borderRadius: TIMELINE_ICON_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceAlt,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        zIndex: 1
    },
    mealIconActive: {
        backgroundColor: colors.primarySoft,
        borderColor: colors.primary
    },
    mealContent: {
        flex: 1,
        minWidth: 0,
        paddingLeft: spacing.md,
        paddingBottom: spacing.md
    },
    mealHeader: {
        minHeight: TIMELINE_ICON_SIZE,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
        paddingBottom: spacing.sm
    },
    mealTitleRow: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm
    },
    mealTitle: {
        flex: 1,
        minWidth: 0
    },
    mealMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        flexShrink: 0
    },
    mealCalories: {
        color: colors.muted,
        fontWeight: '800',
        textAlign: 'right',
        fontSize: 15
    },
    addMealButton: {
        width: 34,
        height: 34,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        backgroundColor: colors.primarySoft
    },
    expandButton: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center'
    },
    entries: {
        borderTopColor: colors.border,
        borderTopWidth: StyleSheet.hairlineWidth
    },
    entryRow: {
        minHeight: 50,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        borderBottomColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth
    },
    entryText: {
        flex: 1,
        minWidth: 0
    },
    entryCalories: {
        color: colors.muted,
        textAlign: 'right'
    },
    entryAction: {
        width: 34,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md
    },
    disabled: {
        opacity: 0.45
    },
    pressed: {
        backgroundColor: colors.surfacePressed
    }
});
