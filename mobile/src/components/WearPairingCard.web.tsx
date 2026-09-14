import { AppSection } from './AppSection';
import { SectionHeader } from './SectionHeader';

/** The phone-to-Wear bridge is native-only; keep shared Settings routes safe on web. */
export function WearPairingCard({ embedded = false }: { embedded?: boolean } = {}) {
    if (embedded) return null;
    return (
        <AppSection>
            <SectionHeader
                title="Wear OS"
                description="Pair and manage a Calibrate watch from the Android app."
            />
        </AppSection>
    );
}
