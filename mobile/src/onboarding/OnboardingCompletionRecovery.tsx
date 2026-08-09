import { AppButton } from '../components/AppButton';
import { AppText } from '../components/AppText';
import { OUTBOX_MUTATION_STATES, type QueuedMutation } from '../offline/queuedMutation';

type OnboardingCompletionRecoveryProps = {
    mutation: QueuedMutation | undefined;
    status: string | null;
    retrying: boolean;
    onRetry: () => void | Promise<void>;
};

/** Keeps completion replay status explicit without exposing persisted health values or server errors. */
export function OnboardingCompletionRecovery({
    mutation,
    status,
    retrying,
    onRetry
}: OnboardingCompletionRecoveryProps) {
    const needsRetry = mutation?.state === OUTBOX_MUTATION_STATES.FAILED;
    let message = status;
    if (needsRetry) message = 'Setup completion needs another try. Your saved setup is still safe.';
    if (retrying) message = 'Retrying setup completion...';
    if (!message) return null;

    return (
        <>
            <AppText
                testID="onboarding-draft-status"
                accessibilityLiveRegion="polite"
                variant="caption"
            >
                {message}
            </AppText>
            {needsRetry && (
                <AppButton
                    testID="onboarding-retry-completion"
                    title="Retry completion"
                    busy={retrying}
                    busyLabel="Retrying completion..."
                    variant="secondary"
                    onPress={() => void onRetry()}
                />
            )}
        </>
    );
}
