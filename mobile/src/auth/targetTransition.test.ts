import { prepareTarget, type BoundSession, type TargetTransitionStore } from './targetTransition';

const oldOrigin = 'https://previous.example';
const target = 'https://configured.example';
const original: BoundSession = { version: 1, origin: oldOrigin, accessToken: 'old-access', refreshToken: 'old-refresh' };
function fixture(binding: BoundSession | null = null) {
    let raw = binding ? JSON.stringify(binding) : null;
    const store: TargetTransitionStore = {
        readBinding: jest.fn(async () => raw),
        readLegacy: jest.fn(async () => original),
        inspectLocalState: jest.fn(async () => ({ hasState: true })),
        preserveSession: jest.fn(async () => undefined),
        commitBinding: jest.fn(async session => { raw = JSON.stringify(session); })
    };
    return store;
}

it('retains a known matching legacy session without moving or clearing scoped data', async () => {
    const store = fixture();
    await expect(prepareTarget(oldOrigin, store)).resolves.toEqual(original);
    expect(store.inspectLocalState).not.toHaveBeenCalled();
    expect(store.commitBinding).toHaveBeenCalledWith(original);
});

it.each([null, original])('a changed target starts signed out and preserves the previous credentials separately (%p)', async binding => {
    const store = fixture(binding);
    await expect(prepareTarget(target, store)).resolves.toEqual({ version: 1, origin: target, accessToken: null, refreshToken: null });
    expect(store.inspectLocalState).toHaveBeenCalledWith(oldOrigin);
    expect(store.preserveSession).toHaveBeenCalledWith(original);
});

it.each(['pending', 'failed', 'replaying', 'unreadable', 'unknown namespace'])('blocks %s local state without any credential writes', async reason => {
    const store = fixture();
    jest.mocked(store.inspectLocalState).mockRejectedValue(new Error(reason));
    await expect(prepareTarget(target, store)).rejects.toThrow(reason);
    expect(store.commitBinding).not.toHaveBeenCalled();
    expect(store.preserveSession).not.toHaveBeenCalled();
});

it.each(['https://user:secret@previous.example', 'previous.example', 'https://previous.example/path', 'not a URL'])('never guesses malformed legacy identity %s', async origin => {
    const store = fixture();
    jest.mocked(store.readLegacy).mockResolvedValue({ ...original, origin });
    await expect(prepareTarget(target, store)).rejects.toThrow();
    expect(store.commitBinding).not.toHaveBeenCalled();
});

it('blocks missing identity with credentials or retained local state, but permits an empty fresh install', async () => {
    const store = fixture();
    jest.mocked(store.readLegacy).mockResolvedValue({ ...original, origin: null });
    await expect(prepareTarget(target, store)).rejects.toThrow('cannot be identified');
    jest.mocked(store.readLegacy).mockResolvedValue({ origin: null, accessToken: null, refreshToken: null });
    await expect(prepareTarget(target, store)).rejects.toThrow('cannot be identified');
    jest.mocked(store.inspectLocalState).mockResolvedValue({ hasState: false });
    await expect(prepareTarget(target, store)).resolves.toMatchObject({ origin: target, refreshToken: null });
});

it.each(['readBinding', 'readLegacy', 'inspectLocalState', 'preserveSession', 'commitBinding'] as const)('fails closed when %s fails, then retries from the original binding', async operation => {
    const store = fixture();
    jest.mocked(store[operation]).mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(prepareTarget(target, store)).rejects.toThrow('storage unavailable');
    await expect(prepareTarget(target, store)).resolves.toMatchObject({ origin: target, accessToken: null });
});

it('resumes after a commit persisted but its acknowledgement was interrupted, without importing legacy tokens', async () => {
    const store = fixture();
    const commit = store.commitBinding;
    store.commitBinding = async session => { await commit(session); throw new Error('interrupted'); };
    await expect(prepareTarget(target, store)).rejects.toThrow('interrupted');
    await expect(prepareTarget(target, store)).resolves.toMatchObject({ origin: target, accessToken: null, refreshToken: null });
    expect(store.readLegacy).toHaveBeenCalledTimes(1);
});

it('a matching recovery build may open the original session when transition was blocked', async () => {
    const store = fixture(original);
    jest.mocked(store.inspectLocalState).mockRejectedValue(new Error('queued changes'));
    await expect(prepareTarget(target, store)).rejects.toThrow('queued changes');
    await expect(prepareTarget(oldOrigin, store)).resolves.toEqual(original);
});

it('unknown bound-state versions never fall back to unscoped legacy credentials', async () => {
    const store = fixture();
    jest.mocked(store.readBinding).mockResolvedValue('{"version":2}');
    await expect(prepareTarget(target, store)).rejects.toThrow();
    expect(store.readLegacy).not.toHaveBeenCalled();
    expect(store.commitBinding).not.toHaveBeenCalled();
});
