import React from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from '../components/AppText';
import { FixedPageColumn } from '../components/FixedPage';
import { type AppTheme, useAppTheme } from '../theme';

const PAUSE_SYMBOL_SIZE = 80; // Anchors the paused day in the space normally used for calorie tracking.
const PAUSE_GLYPH_SIZE = 36; // Keeps the pause symbol legible without competing with the heading.
const MESSAGE_MAX_WIDTH = 440; // Keeps centered explanatory copy readable on wide screens.

export function PausedDayMessage({ isToday }: { isToday: boolean }) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    return <FixedPageColumn testID="paused-day-message" style={styles.region}>
        <View style={styles.message}>
            <View style={styles.symbol} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Ionicons name="pause" size={PAUSE_GLYPH_SIZE} color={theme.colors.onPrimaryContainer} />
            </View>
            <AppText variant="label" style={styles.eyebrow}>{isToday ? 'Taking a break' : 'A day on pause'}</AppText>
            <AppText accessibilityRole="header" aria-level={1} variant="title" style={styles.centered}>
                {isToday ? 'Tracking paused' : 'Tracking was paused'}
            </AppText>
            <AppText variant="body" style={styles.description}>
                {isToday
                    ? 'Food logging, calorie targets, and reminders are on pause. Resume whenever you are ready.'
                    : 'Food and calorie tracking were paused for this day. It is not counted as a zero-calorie day.'}
            </AppText>
            <View style={styles.supportingCopy}>
                <AppText variant="body" style={styles.centered}>Weight logging is always available.</AppText>
                <AppText variant="muted" style={styles.centered}>
                    {isToday
                        ? 'Your goal and logged history are still here.'
                        : 'Use Edit day if you want to backfill your food log.'}
                </AppText>
            </View>
        </View>
    </FixedPageColumn>;
}

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        region: { flexGrow: 1, justifyContent: 'center', paddingVertical: theme.spacing.xxl },
        message: { width: '100%', maxWidth: MESSAGE_MAX_WIDTH, alignSelf: 'center', alignItems: 'center', gap: theme.spacing.md },
        symbol: { width: PAUSE_SYMBOL_SIZE, height: PAUSE_SYMBOL_SIZE, borderRadius: theme.radius.pill, backgroundColor: theme.colors.primaryContainer, alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing.sm },
        eyebrow: { color: theme.colors.primary },
        centered: { textAlign: 'center' },
        description: { textAlign: 'center', color: theme.colors.onSurfaceVariant },
        supportingCopy: { width: '100%', gap: theme.spacing.sm, paddingTop: theme.spacing.lg }
    });
}
