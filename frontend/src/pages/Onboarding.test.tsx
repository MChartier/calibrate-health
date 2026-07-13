// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContextType, User } from '../context/authContext';
import { createAppTheme } from '../theme';
import Onboarding from './Onboarding';

const testState = vi.hoisted(() => ({
    auth: null as AuthContextType | null
}));

vi.mock('../context/useAuth', () => ({
    useAuth: () => testState.auth
}));

vi.mock('../i18n/useI18n', () => ({
    useI18n: () => ({
        t: (key: string) => key
    })
}));

vi.mock('../hooks/usePrefersReducedMotion', () => ({
    usePrefersReducedMotion: () => true
}));

vi.mock('../queries/userProfile', () => ({
    useUserProfileQuery: () => ({
        data: undefined,
        isSuccess: false,
        refetch: vi.fn().mockResolvedValue(undefined)
    })
}));

vi.mock('../components/imports/LoseItImportDialog', () => ({
    default: () => null
}));

const user: User = {
    id: 1,
    email: 'onboarding@example.test',
    created_at: '2026-07-12T00:00:00.000Z',
    weight_unit: 'KG',
    height_unit: 'CM',
    timezone: 'America/Los_Angeles',
    language: 'en',
    reminder_log_weight_enabled: true,
    reminder_log_food_enabled: true,
    haptics_enabled: true
};

function createAuth(): AuthContextType {
    return {
        user,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        changePassword: vi.fn(),
        clearDeletedAccountSession: vi.fn(),
        updateUnitPreferences: vi.fn().mockResolvedValue(undefined),
        updateReminderPreferences: vi.fn().mockResolvedValue(undefined),
        updateFeedbackPreferences: vi.fn().mockResolvedValue(undefined),
        updateWeightUnit: vi.fn().mockResolvedValue(undefined),
        updateHeightUnit: vi.fn().mockResolvedValue(undefined),
        updateLanguage: vi.fn().mockResolvedValue(undefined),
        updateProfile: vi.fn().mockResolvedValue(undefined),
        updateProfileImage: vi.fn().mockResolvedValue(undefined),
        updateTimezone: vi.fn().mockResolvedValue(undefined),
        isLoading: false
    };
}

function renderOnboarding() {
    return render(
        <ThemeProvider theme={createAppTheme('light')}>
            <MemoryRouter>
                <Onboarding />
            </MemoryRouter>
        </ThemeProvider>
    );
}

async function enterGoalsWizard(interaction: ReturnType<typeof userEvent.setup>) {
    renderOnboarding();
    await interaction.click(screen.getByRole('button', { name: 'onboarding.intro.action' }));
    return screen.findByRole('spinbutton', { name: /Current weight/i });
}

describe('Onboarding guided flow', () => {
    beforeEach(() => {
        testState.auth = createAuth();
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: vi.fn(() => ({
                matches: false,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn()
            }))
        });
        Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
            configurable: true,
            value: vi.fn()
        });
    });

    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('blocks an empty current weight and surfaces its validation message', async () => {
        const interaction = userEvent.setup();
        const currentWeight = await enterGoalsWizard(interaction);

        expect((screen.getByRole('button', { name: 'common.continue' }) as HTMLButtonElement).disabled).toBe(true);

        await interaction.type(currentWeight, '{Enter}');

        expect(await screen.findByText('Required.')).not.toBeNull();
        expect(screen.getByRole('spinbutton', { name: /Current weight/i })).not.toBeNull();
        expect(screen.queryByRole('spinbutton', { name: /Target weight/i })).toBeNull();
    });

    it('advances on a valid answer and preserves it when navigating back', async () => {
        const interaction = userEvent.setup();
        const currentWeight = await enterGoalsWizard(interaction);
        await interaction.type(currentWeight, '180');

        await interaction.click(screen.getByRole('button', { name: 'common.continue' }));

        expect(await screen.findByRole('spinbutton', { name: /Target weight/i })).not.toBeNull();
        await interaction.click(screen.getByRole('button', { name: 'common.back' }));

        expect(((await screen.findByRole('spinbutton', { name: /Current weight/i })) as HTMLInputElement).value).toBe('180');
    });

    it('moves from completed goal questions into the calorie-burn section', async () => {
        const interaction = userEvent.setup();
        const currentWeight = await enterGoalsWizard(interaction);
        await interaction.type(currentWeight, '180');
        await interaction.click(screen.getByRole('button', { name: 'common.continue' }));

        const targetWeight = await screen.findByRole('spinbutton', { name: /Target weight/i });
        await interaction.type(targetWeight, '160');
        await interaction.click(screen.getByRole('button', { name: 'common.continue' }));

        expect(await screen.findByText('How fast do you want to lose weight?')).not.toBeNull();
        await interaction.click(screen.getByRole('button', { name: 'onboarding.cta.nextAbout' }));

        expect(await screen.findByLabelText(/profile\.dateOfBirth/)).not.toBeNull();
        expect(screen.getByText("What's your date of birth?")).not.toBeNull();
    });
});
