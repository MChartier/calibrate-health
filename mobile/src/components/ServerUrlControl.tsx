import React, { useRef, useState } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { AppChoiceGroup } from './AppChoiceGroup';
import { BottomSheetModal } from './BottomSheetModal';
import { TextField } from './TextField';
import { AppNotice } from './AppNotice';
import { spacing } from '../theme';
import { HOSTED_SERVER_URL, normalizeServerUrl, type ServerConnectionState } from '../config/server';

const SERVICE_MODES = { MANAGED: 'managed', SELF_HOSTED: 'self-hosted' } as const;
type ServiceMode = typeof SERVICE_MODES[keyof typeof SERVICE_MODES];

type ServerUrlControlProps = ViewProps & {
    value: string;
    connection: ServerConnectionState;
    onTestConnection: (value: string) => Promise<boolean>;
    onConfirmServer: (value: string) => Promise<boolean>;
    onEditingChange?: (editing: boolean) => void;
    disabled?: boolean;
    switchingAccount?: boolean;
};

/** Keep a candidate local until the user explicitly confirms a compatible service. */
export const ServerUrlControl: React.FC<ServerUrlControlProps> = ({
    value, connection, onTestConnection, onConfirmServer, onEditingChange,
    disabled = false, switchingAccount = false, style, ...props
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [mode, setMode] = useState<ServiceMode>(SERVICE_MODES.MANAGED);
    const [draft, setDraft] = useState('');
    const [isTesting, setIsTesting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const busyRef = useRef(false);
    const triggerRef = useRef<View>(null);
    const isHosted = normalizeServerUrl(value) === HOSTED_SERVER_URL;
    const candidate = mode === SERVICE_MODES.MANAGED ? HOSTED_SERVER_URL : draft;
    const normalizedCandidate = normalizeServerUrl(candidate);
    const matchesTest = normalizedCandidate
        ? normalizedCandidate === connection.testedUrl
        : candidate.trim() === connection.testedInput;
    const showResult = matchesTest && connection.status !== 'idle';

    function openEditor() {
        if (disabled) return;
        setMode(SERVICE_MODES.SELF_HOSTED);
        setDraft(isHosted ? '' : value);
        setError(null);
        setIsEditing(true);
        onEditingChange?.(true);
    }

    function closeEditor() {
        if (isSaving) return;
        setIsEditing(false);
        setError(null);
        onEditingChange?.(false);
    }

    async function checkConnection(confirm: boolean) {
        if (busyRef.current) return;
        busyRef.current = true;
        setError(null);
        if (confirm) setIsSaving(true);
        else setIsTesting(true);
        try {
            const success = await (confirm ? onConfirmServer(candidate) : onTestConnection(candidate));
            if (!success) setError('Could not confirm this service. Check the address and connection details, then try again.');
            if (confirm && success) {
                setIsEditing(false);
                onEditingChange?.(false);
            }
        } catch {
            setError('The service could not be confirmed. Check the connection and try again.');
        } finally {
            busyRef.current = false;
            setIsTesting(false);
            setIsSaving(false);
        }
    }

    const busy = isSaving || isTesting;
    const options = [
        { value: SERVICE_MODES.MANAGED, label: 'Calibrate', description: 'Managed hosting. No server setup needed.', disabled: busy },
        { value: SERVICE_MODES.SELF_HOSTED, label: 'Self-hosted server', description: 'Use the address provided by your server administrator.', disabled: busy }
    ];
    let confirmTitle = 'Use this service';
    if (switchingAccount && normalizedCandidate !== normalizeServerUrl(value)) confirmTitle = 'Switch service and sign out';

    return (
        <View {...props} style={[styles.root, style]}>
            <View style={styles.identity}>
                <AppText variant="label">{isHosted ? 'Calibrate' : 'Self-hosted server'}</AppText>
                <AppText variant="caption">{isHosted ? 'Managed hosting. No server setup needed.' : value}</AppText>
            </View>
            <AppButton
                buttonRef={triggerRef}
                title={isHosted ? 'Use a self-hosted server' : 'Change service'}
                variant="ghost"
                disabled={disabled}
                onPress={openEditor}
            />
            <BottomSheetModal
                visible={isEditing}
                onRequestClose={closeEditor}
                title="Choose your service"
                description="Your account and data belong to the service you choose. Accounts are separate and are not transferred when you switch."
                dismissDisabled={isSaving}
                returnFocusRef={triggerRef}
            >
                <View style={styles.editor}>
                    <AppChoiceGroup label="Hosting" options={options} value={mode} onChange={(nextMode) => {
                        setMode(nextMode);
                        setError(null);
                    }} />
                    {mode === SERVICE_MODES.SELF_HOSTED ? (
                        <>
                            <TextField
                                label="Server URL"
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="url"
                                value={draft}
                                editable={!busy}
                                onChangeText={(nextDraft) => { setDraft(nextDraft); setError(null); }}
                                placeholder="https://calibrate.example.com"
                                helperText="Use a server you trust. HTTPS is required outside local development builds."
                            />
                            <AppText variant="caption">Your server operator is responsible for privacy, security, availability, backups, and support.</AppText>
                        </>
                    ) : <AppText selectable variant="caption">{HOSTED_SERVER_URL}</AppText>}
                    {switchingAccount && normalizedCandidate !== normalizeServerUrl(value) && (
                        <AppNotice tone="warning"><AppText>Switching signs you out on this device after the new service is checked. Sign in with an account on the new service to continue.</AppText></AppNotice>
                    )}
                    {showResult && <AppNotice tone={connection.status === 'error' ? 'danger' : 'info'} accessibilityLiveRegion="polite">
                        <AppText>{connection.message}</AppText>
                    </AppNotice>}
                    {error && !(showResult && connection.status === 'error') && <AppNotice tone="danger" accessibilityRole="alert"><AppText>{error}</AppText></AppNotice>}
                    <AppButton title="Test connection" variant="secondary" busy={isTesting} busyLabel="Testing..." disabled={busy || !candidate.trim()} onPress={() => void checkConnection(false)} />
                    <AppButton title={confirmTitle} busy={isSaving} busyLabel="Checking service..." disabled={busy || !candidate.trim()} onPress={() => void checkConnection(true)} />
                    <AppButton title="Cancel" variant="ghost" disabled={isSaving} onPress={closeEditor} />
                </View>
            </BottomSheetModal>
        </View>
    );
};

const styles = StyleSheet.create({
    root: { gap: spacing.xs },
    identity: { gap: spacing.xs },
    editor: { gap: spacing.md }
});
