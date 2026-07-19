import React from 'react';
import { AppCard } from './AppCard';
import { SectionHeader } from './SectionHeader';

/** The phone-to-Wear bridge is native-only; keep shared Settings routes safe on web. */
export function WearPairingCard({ embedded = false }: { embedded?: boolean } = {}) {
    if (embedded) return null;
    return (
        <AppCard>
            <SectionHeader
                title="Wear OS"
                description="Pair and manage a Calibrate watch from the Android app."
            />
        </AppCard>
    );
}
