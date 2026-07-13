// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContextType, User } from '../context/authContext';
import ProfilePhotoCard from './ProfilePhotoCard';

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

vi.mock('../ui/AppCard', () => ({
    default: ({ children }: React.PropsWithChildren) => <section>{children}</section>
}));

vi.mock('./ProfilePhotoCropDialog', () => ({
    default: ({
        open,
        imageUrl,
        onCancel,
        onConfirm
    }: {
        open: boolean;
        imageUrl: string | null;
        onCancel: () => void;
        onConfirm: (dataUrl: string) => Promise<void>;
    }) =>
        open ? (
            <div role="dialog" aria-label="crop photo">
                <span>{imageUrl}</span>
                <button type="button" onClick={onCancel}>
                    cancel crop
                </button>
                <button type="button" onClick={() => void onConfirm('data:image/jpeg;base64,cropped')}>
                    confirm crop
                </button>
            </div>
        ) : null
}));

const userWithoutPhoto: User = {
    id: 1,
    email: 'profile@example.test',
    created_at: '2026-07-12T00:00:00.000Z',
    weight_unit: 'KG',
    height_unit: 'CM',
    timezone: 'America/Los_Angeles',
    language: 'en',
    reminder_log_weight_enabled: true,
    reminder_log_food_enabled: true,
    haptics_enabled: true,
    profile_image_url: null
};

function createAuth(overrides: Partial<AuthContextType> = {}): AuthContextType {
    return {
        user: userWithoutPhoto,
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

describe('ProfilePhotoCard interactions', () => {
    const createObjectURL = vi.fn(() => 'blob:profile-photo');
    const revokeObjectURL = vi.fn();

    beforeEach(() => {
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: createObjectURL
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            value: revokeObjectURL
        });
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    it('rejects a non-image upload before opening the crop flow', async () => {
        testState.auth = createAuth();
        const interaction = userEvent.setup({ applyAccept: false });
        render(<ProfilePhotoCard />);

        const fileInput = screen.getByLabelText('profilePhoto.addPhoto');
        await interaction.upload(fileInput, new File(['not an image'], 'notes.txt', { type: 'text/plain' }));

        expect(await screen.findByText('profilePhoto.error.chooseImage')).not.toBeNull();
        expect(screen.queryByRole('dialog', { name: 'crop photo' })).toBeNull();
        expect(createObjectURL).not.toHaveBeenCalled();
    });

    it('opens the crop flow for a valid image and releases its object URL on cancel', async () => {
        testState.auth = createAuth();
        const interaction = userEvent.setup();
        render(<ProfilePhotoCard />);

        const file = new File(['image bytes'], 'avatar.png', { type: 'image/png' });
        await interaction.upload(screen.getByLabelText('profilePhoto.addPhoto'), file);

        expect(createObjectURL).toHaveBeenCalledWith(file);
        expect(screen.getByRole('dialog', { name: 'crop photo' }).textContent).toContain('blob:profile-photo');

        await interaction.click(screen.getByRole('button', { name: 'cancel crop' }));

        expect(screen.queryByRole('dialog', { name: 'crop photo' })).toBeNull();
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:profile-photo');
    });

    it('persists the cropped image, reports success, and closes the crop flow', async () => {
        const mutation = deferredMutation();
        const updateProfileImage = vi.fn(() => mutation.promise);
        testState.auth = createAuth({ updateProfileImage });
        const interaction = userEvent.setup();
        render(<ProfilePhotoCard />);

        await interaction.upload(
            screen.getByLabelText('profilePhoto.addPhoto'),
            new File(['image bytes'], 'avatar.jpg', { type: 'image/jpeg' })
        );
        await interaction.click(screen.getByRole('button', { name: 'confirm crop' }));

        expect(updateProfileImage).toHaveBeenCalledWith('data:image/jpeg;base64,cropped');
        expect(screen.getByRole('dialog', { name: 'crop photo' })).not.toBeNull();

        await act(async () => mutation.resolve());

        expect(await screen.findByText('profilePhoto.success.updated')).not.toBeNull();
        expect(screen.queryByRole('dialog', { name: 'crop photo' })).toBeNull();
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:profile-photo');
    });

    it('disables removal while saving and surfaces a failed mutation', async () => {
        const mutation = deferredMutation();
        const updateProfileImage = vi.fn(() => mutation.promise);
        testState.auth = createAuth({
            user: {
                ...userWithoutPhoto,
                profile_image_url: 'data:image/jpeg;base64,current'
            },
            updateProfileImage
        });
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const interaction = userEvent.setup();
        render(<ProfilePhotoCard />);

        const removeButton = screen.getByRole('button', { name: 'profilePhoto.remove' }) as HTMLButtonElement;
        await interaction.click(removeButton);

        expect(updateProfileImage).toHaveBeenCalledWith(null);
        expect(removeButton.disabled).toBe(true);

        await act(async () => mutation.reject(new Error('remove failed')));

        expect(await screen.findByText('profilePhoto.error.removeFailed')).not.toBeNull();
        expect(removeButton.disabled).toBe(false);
    });
});
