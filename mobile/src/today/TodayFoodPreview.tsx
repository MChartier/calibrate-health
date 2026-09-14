import React from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { FoodLogEntry } from '@calibrate/api-client';
import { AppText } from '../components/AppText';
import { FixedPageColumn } from '../components/FixedPage';
import { useFocusVisible } from '../components/useFocusVisible';
import { type AppTheme, useAppTheme } from '../theme';
import { formatCalories, formatMealPeriod } from '../utils/format';
import { fitTodayFoodMeals, getTodayFoodMeals, type TodayFoodMeal } from './foodPreview';

type TodayFoodPreviewProps = {
    entries: FoodLogEntry[];
    onPress: () => void;
    style?: StyleProp<ViewStyle>;
    expanded?: boolean;
};

// The compact page reserves enough space for its heading and one ordinary meal/item pair.
const MINIMUM_PREVIEW_HEIGHT = 124;
// Short phones need the same tighter vertical rhythm as the approved 320px layout.
const NARROW_PHONE_BREAKPOINT = 360;
// Layout changes smaller than a display fraction should not restart fitting.
const MEASUREMENT_TOLERANCE = 0.25;

type MeasuredRows = Record<string, number>;

export function TodayFoodPreview({ entries, onPress, style, expanded = false }: TodayFoodPreviewProps) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const { fontScale, width } = useWindowDimensions();
    const narrow = width < NARROW_PHONE_BREAKPOINT;
    const meals = React.useMemo(() => getTodayFoodMeals(entries), [entries]);
    const [bodySize, setBodySize] = React.useState({ width: 0, height: 0 });
    const [hovered, setHovered] = React.useState(false);
    const { focusVisible, handleFocus, handleBlur } = useFocusVisible();
    const [measurementRevision, updateMeasurementRevision] = React.useReducer((value: number) => value + 1, 0);
    const measurementKey = JSON.stringify([bodySize.width, fontScale, theme.typography.styles.body, entries.map(({ id, name, calories, meal_period }) => [id, name, calories, meal_period])]);
    const measurements = React.useRef<{ key: string; values: MeasuredRows }>({ key: measurementKey, values: {} });
    if (measurements.current.key !== measurementKey) measurements.current = { key: measurementKey, values: {} };

    const requiredKeys = React.useMemo(() => [
        'omission', ...meals.map((meal) => `meal-${meal.meal}`), ...entries.map((entry) => `entry-${entry.id}`)
    ], [entries, meals]);

    const measureRow = (key: string) => (event: LayoutChangeEvent) => {
        // Ignore delayed native layout events from a previous width or food snapshot.
        if (measurements.current.key !== measurementKey) return;
        const height = event.nativeEvent.layout.height;
        const values = measurements.current.values;
        if (Math.abs((values[key] ?? -1) - height) < MEASUREMENT_TOLERANCE) return;
        values[key] = height;
        if (requiredKeys.every((required) => values[required] !== undefined)) updateMeasurementRevision();
    };

    const measured = requiredKeys.every((key) => measurements.current.values[key] !== undefined);
    const fitted = React.useMemo(() => {
        if (expanded) return { meals, omittedCount: 0 };
        if (!measured || !bodySize.width) return { meals: [], omittedCount: 0 };
        const values = measurements.current.values;
        return fitTodayFoodMeals(meals, bodySize.height, {
            entries: Object.fromEntries(entries.map((entry) => [entry.id, values[`entry-${entry.id}`]])),
            meals: Object.fromEntries(meals.map((meal) => [meal.meal, values[`meal-${meal.meal}`]])),
            omission: values.omission + (narrow ? theme.spacing.xs : theme.spacing.sm),
            mealGap: theme.spacing.md
        });
    }, [bodySize, entries, expanded, meals, measured, measurementRevision, narrow, theme.spacing.md, theme.spacing.sm, theme.spacing.xs]);

    const measureBody = (event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        setBodySize((previous) => (
            Math.abs(previous.width - width) < MEASUREMENT_TOLERANCE && Math.abs(previous.height - height) < MEASUREMENT_TOLERANCE
                ? previous : { width, height }
        ));
    };

    const mealHeading = (meal: TodayFoodMeal, measuring = false) => <View
        testID={measuring ? `food-preview-measure-meal-${meal.meal}` : undefined}
        onLayout={measuring ? measureRow(`meal-${meal.meal}`) : undefined}
        style={styles.mealHeading}
    >
        <AppText style={styles.mealName}>{formatMealPeriod(meal.meal)}</AppText>
        <AppText variant="muted" style={styles.calories}>{formatCalories(meal.calories)}</AppText>
    </View>;

    const itemRow = (entry: FoodLogEntry, measuring = false) => <View
        key={entry.id}
        testID={measuring ? `food-preview-measure-entry-${entry.id}` : `food-preview-entry-${entry.id}`}
        onLayout={measuring ? measureRow(`entry-${entry.id}`) : undefined}
        style={styles.item}
    >
        <AppText style={styles.itemName}>{entry.name}</AppText>
        <AppText style={styles.itemCalories}>{Math.round(entry.calories).toLocaleString()}</AppText>
    </View>;

    let omissionText = `${fitted.omittedCount} earlier ${fitted.omittedCount === 1 ? 'item' : 'items'} in log`;
    if (!fitted.meals.length) omissionText = `${fitted.omittedCount} ${fitted.omittedCount === 1 ? 'item' : 'items'} in log`;
    const accessibleMeals = fitted.meals.map((meal) => (
        `${formatMealPeriod(meal.meal)}, ${formatCalories(meal.calories)}. ${meal.entries.map((entry) => `${entry.name}, ${formatCalories(entry.calories)}`).join('. ')}.`
    )).join(' ');

    return <Pressable
        testID="today-food-preview"
        accessibilityRole="button"
        accessibilityLabel={`Food log. ${entries.length} ${entries.length === 1 ? 'item' : 'items'}. ${accessibleMeals ? `${accessibleMeals} ` : ''}View full log`}
        accessibilityHint="Opens the detailed food log for this day"
        onPress={onPress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={({ pressed }) => [
            styles.root, narrow && styles.narrow, expanded && styles.expanded, hovered && styles.hovered,
            pressed && styles.pressed, focusVisible && styles.focusVisible, style
        ]}
    >
        <FixedPageColumn style={[styles.inner, expanded && styles.expanded]}>
        <View style={[styles.heading, narrow && styles.narrowHeading]}>
            <AppText variant="section">Food log</AppText>
            <View accessibilityElementsHidden aria-hidden>
                <Ionicons name="chevron-forward" size={20} color={theme.colors.primary} />
            </View>
        </View>
        <View testID="food-preview-body" style={[styles.body, expanded && styles.expandedBody]} onLayout={measureBody}>
            {!entries.length && <View style={styles.empty}>
                <AppText style={styles.emptyTitle}>Start today's food log</AppText>
                <AppText style={styles.emptyMessage}>Your meals will appear here as you add food.</AppText>
            </View>}
            {fitted.omittedCount > 0 && <AppText variant="muted" style={[styles.omission, narrow && styles.narrowOmission]}>{omissionText}</AppText>}
            <View style={styles.meals}>
                {fitted.meals.map((meal) => <View key={meal.meal}>
                    {mealHeading(meal)}
                    {meal.entries.map((entry) => itemRow(entry))}
                </View>)}
            </View>
            {!expanded && entries.length > 0 && <View
                key={measurementKey}
                testID="food-preview-measurements"
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                aria-hidden
                style={styles.measurements}
            >
                <AppText testID="food-preview-measure-omission" variant="muted" style={[styles.omission, narrow && styles.narrowOmission]} onLayout={measureRow('omission')}>
                    {`${entries.length} earlier items in log`}
                </AppText>
                {meals.map((meal) => <View key={meal.meal}>
                    {mealHeading(meal, true)}
                    {meal.entries.map((entry) => itemRow(entry, true))}
                </View>)}
            </View>}
        </View>
        </FixedPageColumn>
    </Pressable>;
}

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        root: { flex: 1, minHeight: MINIMUM_PREVIEW_HEIGHT, width: '100%', paddingTop: theme.spacing.md, paddingBottom: theme.spacing.sm },
        inner: { flex: 1, minHeight: 0 },
        narrow: { minHeight: MINIMUM_PREVIEW_HEIGHT - theme.spacing.sm, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xs },
        expanded: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
        heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm, marginBottom: theme.spacing.sm, flexShrink: 0 },
        narrowHeading: { marginBottom: theme.spacing.xs },
        body: { flex: 1, minHeight: 0 },
        expandedBody: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
        meals: { gap: theme.spacing.md },
        mealHeading: { flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm },
        mealName: { flex: 1, fontWeight: '600' },
        calories: { flexShrink: 0, fontVariant: ['tabular-nums'] },
        item: { flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.md, paddingVertical: theme.spacing.xs / 2 },
        itemName: { flex: 1, color: theme.colors.onSurfaceVariant },
        itemCalories: { flexShrink: 0, color: theme.colors.onSurfaceVariant, fontVariant: ['tabular-nums'] },
        omission: { marginBottom: theme.spacing.sm, fontVariant: ['tabular-nums'] },
        narrowOmission: { ...theme.typography.styles.label, fontWeight: '400', marginBottom: theme.spacing.xs },
        measurements: { position: 'absolute', top: 0, left: 0, right: 0, height: 0, overflow: 'hidden', opacity: 0 },
        empty: { flex: 1, justifyContent: 'center', gap: theme.spacing.xs },
        emptyTitle: { fontWeight: '500' },
        emptyMessage: { color: theme.colors.onSurfaceVariant },
        hovered: { backgroundColor: theme.colors.surfaceHovered },
        pressed: { backgroundColor: theme.colors.surfacePressed },
        focusVisible: { outlineWidth: theme.interaction.focusRingWidth, outlineStyle: 'solid', outlineColor: theme.colors.focusRing }
    });
}
