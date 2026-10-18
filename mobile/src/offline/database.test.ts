const mockVersion = jest.fn();
const mockInitialize = jest.fn();
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => ({ getFirstAsync: mockVersion, execAsync: mockInitialize }) }));

beforeEach(() => { jest.resetModules(); jest.clearAllMocks(); });

it.each([0, 1])('opens known schema version %s', async version => {
    mockVersion.mockResolvedValue({ user_version: version });
    const { openOutboxDatabase } = require('./database') as typeof import('./database');
    await openOutboxDatabase();
    expect(mockInitialize).toHaveBeenCalledTimes(1);
});

it.each([2, -1, undefined])('does not overwrite unknown schema version %s', async version => {
    mockVersion.mockResolvedValue(version === undefined ? null : { user_version: version });
    const { openOutboxDatabase } = require('./database') as typeof import('./database');
    await expect(openOutboxDatabase()).rejects.toThrow('Unknown offline database version');
    expect(mockInitialize).not.toHaveBeenCalled();
});

it('preserves a database that cannot be read and allows a later retry', async () => {
    mockVersion.mockRejectedValueOnce(new Error('unreadable')).mockResolvedValue({ user_version: 1 });
    const { openOutboxDatabase } = require('./database') as typeof import('./database');
    await expect(openOutboxDatabase()).rejects.toThrow('unreadable');
    expect(mockInitialize).not.toHaveBeenCalled();
    await openOutboxDatabase();
    expect(mockInitialize).toHaveBeenCalledTimes(1);
});
