import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { openOutboxDatabase } from '../offline/database';
import { storedOrigin } from './targetTransition';
import { isOnboardingFormState } from '../onboarding/completionState';
import { ACTIVITY_RECORD_TYPES } from '@calibrate/shared';

/** Inspect every account's queues, not just the last visible account. Never alter retained data. */
export async function inspectTargetTransitionState(previousOrigin?: string): Promise<{ hasState: boolean }> {
    if (Platform.OS === 'android') {
        const bridge = (require('@calibrate/wear-pairing') as typeof import('@calibrate/wear-pairing')).default;
        if ((!bridge && previousOrigin) || (bridge && bridge.listMessages().length > 0)) {
            throw new Error('Wear inbox is pending or unavailable; use the previous build to resolve it.');
        }
    }
    const database = await openOutboxDatabase();
    const rows = await database.getAllAsync<{ namespace: string }>('SELECT namespace FROM queued_mutations');
    if (rows.length) throw new Error('Resolve pending, failed or interrupted offline changes in the previous build first.');
    const origins = new Set<string>(previousOrigin ? [previousOrigin] : []);
    const keys = (await AsyncStorage.getAllKeys()).filter(key =>
        /^@calibrate\/(offline-workspace|onboarding-draft|health-connect|wear|food-day-receipts|account-deletion)/.test(key));
    for (const key of keys) {
        const raw = await AsyncStorage.getItem(key);
        if (raw === null) throw new Error('Saved state changed during inspection.');
        // Sync and pairing work can live outside the SQLite outbox.
        if (/^@calibrate\/(health-connect\/pending|wear\/(pending|handoffs|sync-invalidation)|account-deletion)/.test(key)) {
            throw new Error('Resolve pending device sync or account cleanup in the previous build first.');
        }
        if (!/^@calibrate\/(offline-workspace|onboarding-draft|food-day-receipts|health-connect\/(preferences|last-success|token)|wear\/pairings)\/v1\//.test(key)) {
            throw new Error('Unrecognized saved data namespace.');
        }
        const isHealthToken = key.startsWith('@calibrate/health-connect/token/');
        const match = key.match(isHealthToken
            ? /\/v1\/([^/]+)\/([1-9]\d*)\/([^/]+)$/
            : /\/v1\/([^/]+)(?:\/([1-9]\d*))?$/);
        if (!match) throw new Error('Unrecognized saved data namespace.');
        if (isHealthToken && !Object.values(ACTIVITY_RECORD_TYPES).some(recordType => recordType === match[3])) {
            throw new Error('Unknown Health Connect record type.');
        }
        const decoded = decodeURIComponent(match[1]);
        if (key.startsWith('@calibrate/food-day-receipts/') && !/::user:[1-9]\d*$/.test(decoded)) {
            throw new Error('Saved tracking account identity is unknown.');
        }
        const origin = storedOrigin(decoded.split('::user:')[0]);
        origins.add(origin);
        if (!key.startsWith('@calibrate/offline-workspace/') && !key.startsWith('@calibrate/food-day-receipts/') && !match[2]) {
            throw new Error('Saved account identity is unknown.');
        }
        // Timestamp/checkpoint values may be JSON scalars. Parsing still rejects unreadable state.
        if (key.startsWith('@calibrate/health-connect/last-success/')) {
            if (!Number.isFinite(Date.parse(raw))) throw new Error('Saved sync checkpoint is unknown.');
            continue;
        }
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Saved state is unknown.');
        const record = value as Record<string, unknown>;
        if (key.startsWith('@calibrate/onboarding-draft/') &&
            (record.version !== 1 || !isOnboardingFormState(record.form) || !['about', 'activity', 'plan'].includes(String(record.step)))) {
            throw new Error('Saved draft is unknown.');
        }
        if (key.startsWith('@calibrate/food-day-receipts/') &&
            (record.version !== 1 || !Number.isSafeInteger(record.sequence) || !Array.isArray(record.rows) ||
                record.rows.some(row => !row || row.namespace !== decoded))) {
            throw new Error('Saved tracking receipts are unknown.');
        }
        if (key.startsWith('@calibrate/health-connect/preferences/') &&
            (typeof record.connected !== 'boolean' || typeof record.paused !== 'boolean' || !record.selection)) {
            throw new Error('Saved health consent is unknown.');
        }
        if (key.startsWith('@calibrate/health-connect/token/') &&
            (typeof record.token !== 'string' || typeof record.timeZone !== 'string')) {
            throw new Error('Saved health checkpoint is unknown.');
        }
        if (key.startsWith('@calibrate/wear/pairings/') &&
            (record.serverOrigin !== origin || typeof record.nodeId !== 'string' || typeof record.watchDeviceId !== 'string')) {
            throw new Error('Saved Wear identity is unknown.');
        }
        if (key.startsWith('@calibrate/offline-workspace/')) {
            const workspace = value as { version?: number; origin?: string; user?: { id?: number }; cache?: { queries?: unknown[] } };
            if (workspace.version !== 1 || workspace.origin !== origin || !Number.isSafeInteger(workspace.user?.id) || Number(workspace.user?.id) <= 0 || !Array.isArray(workspace.cache?.queries)) {
                throw new Error('Saved workspace identity is unknown.');
            }
        }
    }
    for (const origin of origins) {
        const key = 'calibrate.logout.' + Array.from(origin).map(c => c.charCodeAt(0).toString(16)).join('');
        const raw = await SecureStore.getItemAsync(key);
        if (raw === null) continue;
        const intent = JSON.parse(raw) as { signedOut?: boolean; pending?: boolean; refreshTokens?: unknown[] };
        if (typeof intent?.signedOut !== 'boolean' || typeof intent.pending !== 'boolean' || intent.pending ||
            (intent.refreshTokens !== undefined && (!Array.isArray(intent.refreshTokens) || intent.refreshTokens.length > 0))) {
            throw new Error('Previous service sign-out must finish before changing builds.');
        }
    }
    return { hasState: keys.length > 0 };
}
