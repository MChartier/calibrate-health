import type { ActivityDaySummary, ActivityRecordEntry } from '@calibrate/api-client';

const ACTIVITY_DELAY_THRESHOLD_MS = 6 * 60 * 60 * 1000; // Flag same-day summaries that have not refreshed for most of a waking day.

const KNOWN_ACTIVITY_SOURCES: Record<string, string> = {
    'com.sec.android.app.shealth': 'Samsung Health',
    'com.samsung.android.wear.shealth': 'Samsung Health',
    'com.fitbit.FitbitMobile': 'Fitbit',
    'com.google.android.apps.fitness': 'Google Fit',
    android: 'Android'
};

const HEALTH_CONNECT_PACKAGE_PATTERN = /(?:^|\.)healthconnect(?:\.|$)/i;

export function formatActivitySource(packageName: string): string {
    const normalized = packageName.trim();
    if (!normalized) return 'Health Connect';
    const friendly = KNOWN_ACTIVITY_SOURCES[normalized];
    if (friendly) return friendly;
    if (HEALTH_CONNECT_PACKAGE_PATTERN.test(normalized)) return 'Health Connect';
    return 'Connected health app';
}

export function getActivitySourceLabels(records: ActivityRecordEntry[]): string[] {
    const labels = new Set(records.map((record) => formatActivitySource(record.data_origin)));
    if (labels.size === 0) return ['Health Connect'];
    return Array.from(labels).sort();
}

export function isActivitySummaryEmpty(summary: ActivityDaySummary | null | undefined): boolean {
    if (!summary) return true;
    return [summary.steps, summary.active_calories_kcal, summary.total_calories_kcal, summary.exercise_minutes]
        .every((value) => value === null);
}

export function isActivitySummaryDelayed(
    summary: ActivityDaySummary | null | undefined,
    isToday: boolean,
    now = new Date()
): boolean {
    if (!summary || !isToday) return false;
    const observedAt = new Date(summary.observed_at);
    if (Number.isNaN(observedAt.getTime())) return false;
    return now.getTime() - observedAt.getTime() > ACTIVITY_DELAY_THRESHOLD_MS;
}
