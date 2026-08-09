import { fireEvent, render } from '@testing-library/react-native';
import { OUTBOX_MUTATION_STATES, type QueuedMutation } from '../offline/queuedMutation';
import { OnboardingCompletionRecovery } from './OnboardingCompletionRecovery';

const FAILED_MUTATION: QueuedMutation = {
    sequence: 1,
    id: 'onboarding-operation',
    namespace: 'https://health.example::user:7',
    operation: 'onboarding.complete',
    payload: {},
    state: OUTBOX_MUTATION_STATES.FAILED,
    attemptCount: 1,
    lastError: 'private server detail',
    createdAt: 1,
    updatedAt: 2
};

describe('OnboardingCompletionRecovery', () => {
    it('offers a privacy-safe retry action for failed completion replay', () => {
        const onRetry = jest.fn();
        const screen = render(
            <OnboardingCompletionRecovery
                mutation={FAILED_MUTATION}
                status="Waiting for connection"
                retrying={false}
                onRetry={onRetry}
            />
        );

        expect(screen.getByText('Setup completion needs another try. Your saved setup is still safe.')).toBeTruthy();
        expect(screen.queryByText('private server detail')).toBeNull();
        fireEvent.press(screen.getByRole('button', { name: 'Retry completion' }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('announces a busy retry without allowing a duplicate press', () => {
        const screen = render(
            <OnboardingCompletionRecovery
                mutation={FAILED_MUTATION}
                status={null}
                retrying
                onRetry={jest.fn()}
            />
        );

        expect(screen.getByText('Retrying setup completion...')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Retrying completion...' }).props.accessibilityState)
            .toEqual(expect.objectContaining({ busy: true, disabled: true }));
    });
});
