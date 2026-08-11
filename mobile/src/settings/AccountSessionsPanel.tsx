/**
 * Provides Expo client behavior for account sessions panel.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { AccountSessionSummary } from '@calibrate/api-client';
import { AppButton } from '../components/AppButton';
import { AppText } from '../components/AppText';
import { BottomSheetModal } from '../components/BottomSheetModal';
import { radius, spacing, useAppTheme } from '../theme';

type AccountSessionsPanelProps = {
    sessions: AccountSessionSummary[];
    pendingSessionId?: string;
    revokingOthers: boolean;
    onRevoke: (sessionId: string) => void | Promise<void>;
    onRevokeOthers: () => void | Promise<void>;
};

const SESSION_KIND_LABELS: Record<AccountSessionSummary['kind'], string> = {
    browser: 'Browser session',
    android_phone: 'Android phone',
    wear_os: 'Wear OS watch'
};

// Preserves readable session metadata beside actions until compact layouts need to wrap.
const SESSION_COPY_MIN_WIDTH = 220;

type SessionConfirmation =
    | { kind: 'one'; session: AccountSessionSummary }
    | { kind: 'others' };

/** Format account session timestamp for stable display or serialization. */
export function formatAccountSessionTimestamp(value: string | null): string {
    if (!value) return 'Not recorded';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Not recorded';
    return parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

/** Render the account sessions panel interface. */
export function AccountSessionsPanel({
    sessions,
    pendingSessionId,
    revokingOthers,
    onRevoke,
    onRevokeOthers
}: AccountSessionsPanelProps) {
    const { colors } = useAppTheme();
    const [confirmation, setConfirmation] = useState<SessionConfirmation | null>(null);
    const remoteSessionCount = sessions.filter((session) => !session.current).length;
    const confirmingSession = confirmation?.kind === 'one' ? confirmation.session : null;
    const confirmationTitle = confirmingSession ? 'Revoke signed-in session?' : 'Revoke all other sessions?';
    const confirmationDescription = confirmingSession
        ? `This signs ${confirmingSession.device_label ?? SESSION_KIND_LABELS[confirmingSession.kind]} out remotely.`
        : 'Every other browser, phone, and watch session will be signed out. This session stays signed in.';

    async function handleConfirm() {
        if (!confirmation) return;
        try {
            if (confirmation.kind === 'one') {
                await onRevoke(confirmation.session.id);
            } else {
                await onRevokeOthers();
            }
            setConfirmation(null);
        } catch {
            // The owning mutation presents the privacy-safe error while this dialog remains open.
        }
    }

    return (
        <View testID="settings-sessions-list" style={styles.list}>
            {sessions.map((session) => (
                <View
                    key={session.id}
                    testID={`settings-session-${session.id}`}
                    style={[styles.session, { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant }]}
                >
                    <View style={styles.sessionCopy}>
                        <View style={styles.titleRow}>
                            <AppText variant="body" style={styles.sessionTitle}>
                                {session.device_label ?? SESSION_KIND_LABELS[session.kind]}
                            </AppText>
                            {session.current && (
                                <AppText variant="label" style={{ color: colors.success }}>This session</AppText>
                            )}
                        </View>
                        <AppText variant="caption">{SESSION_KIND_LABELS[session.kind]}</AppText>
                        <AppText variant="caption">
                            Last activity: {formatAccountSessionTimestamp(session.last_activity_at)}
                        </AppText>
                        <AppText variant="caption">
                            Signed in: {formatAccountSessionTimestamp(session.created_at)}
                        </AppText>
                        {session.current && (
                            <AppText variant="caption">Use Log out in Account to end this session.</AppText>
                        )}
                    </View>
                    {!session.current && (
                        <AppButton
                            testID={`settings-session-revoke-${session.id}`}
                            title="Revoke"
                            variant="danger"
                            busy={pendingSessionId === session.id}
                            busyLabel="Revoking..."
                            disabled={Boolean(pendingSessionId) || revokingOthers}
                            onPress={() => setConfirmation({ kind: 'one', session })}
                            style={styles.revokeButton}
                        />
                    )}
                </View>
            ))}
            {remoteSessionCount > 0 && (
                <AppButton
                    testID="settings-session-revoke-others"
                    title="Revoke all other sessions"
                    variant="secondary"
                    busy={revokingOthers}
                    busyLabel="Revoking sessions..."
                    disabled={Boolean(pendingSessionId)}
                    onPress={() => setConfirmation({ kind: 'others' })}
                />
            )}
            <BottomSheetModal
                visible={Boolean(confirmation)}
                accessibilityLabel={confirmationTitle}
                title={confirmationTitle}
                description={confirmationDescription}
                showCloseButton
                dismissDisabled={Boolean(pendingSessionId) || revokingOthers}
                onRequestClose={() => setConfirmation(null)}
            >
                <View testID="settings-session-confirmation" style={styles.confirmationActions}>
                    <AppButton
                        title="Cancel"
                        variant="secondary"
                        disabled={Boolean(pendingSessionId) || revokingOthers}
                        onPress={() => setConfirmation(null)}
                        style={styles.confirmationButton}
                    />
                    <AppButton
                        testID="settings-session-confirm"
                        title={confirmation?.kind === 'others' ? 'Revoke others' : 'Revoke'}
                        variant="danger"
                        busy={Boolean(pendingSessionId) || revokingOthers}
                        busyLabel="Revoking..."
                        onPress={() => void handleConfirm()}
                        style={styles.confirmationButton}
                    />
                </View>
            </BottomSheetModal>
        </View>
    );
}

const styles = StyleSheet.create({
    list: {
        gap: spacing.md
    },
    session: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.md,
        borderWidth: StyleSheet.hairlineWidth
    },
    sessionCopy: {
        flex: 1,
        minWidth: SESSION_COPY_MIN_WIDTH,
        gap: spacing.xs
    },
    titleRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: spacing.sm
    },
    sessionTitle: {
        fontWeight: '800'
    },
    revokeButton: {
        flexShrink: 0
    },
    confirmationActions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.md
    },
    confirmationButton: {
        flex: 1
    }
});
