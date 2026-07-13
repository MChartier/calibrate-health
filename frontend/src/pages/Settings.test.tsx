// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContextType, User } from '../context/authContext';
import Settings from './Settings';

const testState = vi.hoisted(() => ({
    auth: null as AuthContextType | null
}));

vi.mock('../context/useAuth', () => ({
    useAuth: () => testState.auth
}));

vi.mock('../context/useThemeMode', () => ({
    useThemeMode: () => ({
        preference: 'system',
        mode: 'light',
        setPreference: vi.fn()
    })
}));

vi.mock('../i18n/useI18n', () => ({
    useI18n: () => ({
        t: (key: string) => key
    })
}));

vi.mock('@mui/material/styles', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mui/material/styles')>();
    return {
        ...actual,
        useTheme: () => ({
            custom: {
                layout: {
                    page: {
                        sectionGap: 3,
                        sectionGapCompact: 2
                    }
                }
            }
        })
    };
});

vi.mock('../components/AccountSecurityCard', () => ({ default: () => null }));
vi.mock('../components/imports/LoseItImportCard', () => ({ default: () => null }));
vi.mock('../components/ProfilePhotoCard', () => ({ default: () => null }));
vi.mock('../components/TimeZonePicker', () => ({ default: () => null }));

vi.mock('../ui/AppPage', () => ({
    default: ({ children }: React.PropsWithChildren) => <main>{children}</main>
}));

vi.mock('../ui/AppCard', () => ({
    default: ({ children }: React.PropsWithChildren) => <section>{children}</section>
}));

vi.mock('../ui/SectionHeader', () => ({
    default: ({ title }: { title: string }) => <h2>{title}</h2>
}));

vi.mock('../utils/haptics', () => ({
    setHapticsEnabled: vi.fn(),
    supportsHaptics: () => false
}));

const user: User = {
    id: 1,
    email: 'settings@example.test',
    created_at: '2026-07-12T00:00:00.000Z',
    weight_unit: 'KG',
    height_unit: 'CM',
    timezone: 'America/Los_Angeles',
    language: 'en',
    reminder_log_weight_enabled: true,
    reminder_log_food_enabled: true,
    haptics_enabled: true
};

function createAuth(overrides: Partial<AuthContextType> = {}): AuthContextType {
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
        isLoading: false,
        ...overrides
    };
}

function deferredMutation() {
    let resolve!: () => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function renderSettings() {
    return render(
        <MemoryRouter>
            <Settings />
        </MemoryRouter>
    );
}

describe('Settings unit preference mutations', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: vi.fn(() => ({ matches: false }))
        });
    });

    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('optimistically selects a new unit and reports a successful save', async () => {
        const mutation = deferredMutation();
        const updateUnitPreferences = vi.fn(() => mutation.promise);
        testState.auth = createAuth({ updateUnitPreferences });
        const interaction = userEvent.setup();
        renderSettings();

        const poundsButton = screen.getByRole('button', { name: 'units.lbAria' });
        expect(poundsButton.getAttribute('aria-pressed')).toBe('false');

        await interaction.click(poundsButton);

        expect(updateUnitPreferences).toHaveBeenCalledWith({ weight_unit: 'LB' });
        expect(poundsButton.getAttribute('aria-pressed')).toBe('true');

        await act(async () => mutation.resolve());

        expect(await screen.findByText('status.changesSaved')).not.toBeNull();
        expect(poundsButton.getAttribute('aria-pressed')).toBe('true');
    });

    it('rolls the optimistic unit selection back and reports a failed save', async () => {
        const mutation = deferredMutation();
        const updateUnitPreferences = vi.fn(() => mutation.promise);
        testState.auth = createAuth({ updateUnitPreferences });
        const interaction = userEvent.setup();
        renderSettings();

        const kilogramsButton = screen.getByRole('button', { name: 'units.kgAria' });
        const poundsButton = screen.getByRole('button', { name: 'units.lbAria' });
        await interaction.click(poundsButton);

        expect(poundsButton.getAttribute('aria-pressed')).toBe('true');

        await act(async () => mutation.reject(new Error('save failed')));

        expect(await screen.findByText('status.failedToSaveChanges')).not.toBeNull();
        expect(kilogramsButton.getAttribute('aria-pressed')).toBe('true');
        expect(poundsButton.getAttribute('aria-pressed')).toBe('false');
    });
});
