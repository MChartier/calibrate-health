import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { WearNode } from '@calibrate/wear-pairing';
import { useAuth } from '../auth/AuthContext';
import {
    getWearPairingErrorMessage,
    getReachableWearNodes,
    processWearPairingInbox,
    readStoredWearPairing,
    startWearPairing,
    type StoredWearPairing
} from '../wear/pairing';
import { colors, spacing } from '../theme';
import { AppButton } from './AppButton';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { SectionHeader } from './SectionHeader';

/** Phone-owned discovery and one-time credential relay for the signed Calibrate watch app. */
export function WearPairingCard() {
    const { api, serverUrl, user } = useAuth();
    const [nodes, setNodes] = useState<WearNode[]>([]);
    const [pairing, setPairing] = useState<StoredWearPairing | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [status, setStatus] = useState('Open Calibrate on your watch, then check for its pairing request.');
    const scope = `${serverUrl}|${user?.id ?? 'signed-out'}`;
    const activeScope = useRef(scope);

    useEffect(() => {
        let active = true;
        activeScope.current = scope;
        setPairing(null);
        setNodes([]);
        setIsChecking(false);
        setStatus('Open Calibrate on your watch, then check for its pairing request.');
        if (user) {
            void readStoredWearPairing(serverUrl, user.id).then((stored) => {
                if (active) setPairing(stored);
            });
        }
        return () => { active = false; };
    }, [scope, serverUrl, user]);

    async function checkForWatch() {
        if (!user) return;
        const checkedScope = scope;
        setIsChecking(true);
        try {
            const reachable = await getReachableWearNodes();
            if (activeScope.current !== checkedScope) return;
            setNodes(reachable);
            const result = await processWearPairingInbox({ api, serverOrigin: serverUrl, userId: user.id });
            if (activeScope.current !== checkedScope) return;
            if (result.paired) setPairing(result.paired);
            if (result.errors.length > 0) setStatus(result.errors[0]);
            else if (result.processed > 0) setStatus('Pairing data sent. Finish the secure exchange on your watch.');
            else if (reachable.length > 0) {
                const node = reachable.find(({ isNearby }) => isNearby) ?? reachable[0];
                await startWearPairing({ node, serverOrigin: serverUrl, userId: user.id });
                setStatus(`Pairing request sent to ${node.displayName || 'your watch'}. Open Calibrate there to continue.`);
            } else setStatus('No compatible reachable Calibrate watch app was found.');
        } catch (error) {
            if (activeScope.current === checkedScope) {
                setStatus(getWearPairingErrorMessage(error));
            }
        } finally {
            if (activeScope.current === checkedScope) setIsChecking(false);
        }
    }

    return (
        <AppCard>
            <SectionHeader
                title="Galaxy Watch"
                description="Pair the signed Wear OS companion without copying your phone session or password."
            />
            <View style={styles.statusPanel}>
                <AppText style={styles.status}>{status}</AppText>
                <AppText variant="caption">
                    Selected server: {serverUrl}. Changing the phone server never retargets an already-paired watch.
                </AppText>
            </View>
            {pairing && (
                <AppText variant="caption">
                    Paired {pairing.watchDeviceName ?? pairing.watchDeviceId} to {pairing.serverOrigin}.
                </AppText>
            )}
            {nodes.map((node) => (
                <AppText key={node.id} variant="caption">
                    {node.displayName || 'Wear OS watch'} | {node.isNearby ? 'nearby' : 'reachable'}
                </AppText>
            ))}
            <AppButton
                title={isChecking ? 'Checking...' : 'Check for watch'}
                disabled={isChecking}
                onPress={() => void checkForWatch()}
            />
        </AppCard>
    );
}

const styles = StyleSheet.create({
    statusPanel: {
        gap: spacing.xs,
        padding: spacing.md,
        borderRadius: spacing.sm,
        backgroundColor: colors.primarySoft
    },
    status: {
        color: colors.text,
        fontWeight: '700'
    }
});
