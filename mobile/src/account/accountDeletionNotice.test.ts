const mockStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
        setItem: jest.fn(async (key: string, value: string) => { mockStorage.set(key, value); }),
        removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); })
    }
}));

import {
    accountDeletionCleanupGuidance,
    assertAccountDeletionCleanupAcknowledged,
    clearAccountDeletionCleanupNotice,
    readAccountDeletionCleanupNotice,
    writeAccountDeletionCleanupNotice,
    type AccountDeletionCleanupNotice
} from './accountDeletionNotice';

const notice: AccountDeletionCleanupNotice = {
    version: 1,
    watchCleanupRequired: true,
    appDataCleanupRequired: true,
    credentialCleanupRequired: false
};

describe('account deletion cleanup notice', () => {
    beforeEach(() => mockStorage.clear());

    it('survives a fresh read and remains until explicit acknowledgement', async () => {
        await writeAccountDeletionCleanupNotice(notice);
        expect(await readAccountDeletionCleanupNotice()).toEqual(notice);
        expect(await readAccountDeletionCleanupNotice()).toEqual(notice);

        await clearAccountDeletionCleanupNotice();
        expect(await readAccountDeletionCleanupNotice()).toBeNull();
    });

    it('gives both watch disconnect and Android app-data recovery steps', () => {
        const message = accountDeletionCleanupGuidance(notice);
        expect(message).toContain('Disconnect this watch');
        expect(message).toContain('clear Calibrate app data');
        expect(message).toContain('Before signing in again');
    });

    it('blocks every new authentication path until cleanup is acknowledged', () => {
        expect(() => assertAccountDeletionCleanupAcknowledged(notice)).toThrow('before continuing');
        expect(() => assertAccountDeletionCleanupAcknowledged(null)).not.toThrow();
    });
});
