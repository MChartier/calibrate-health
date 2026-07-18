import * as Crypto from 'expo-crypto';
import type { OutboxStore } from './outbox';
import {
    OUTBOX_MUTATION_STATES,
    parseMutationPayload,
    serializeMutationPayload,
    type NewQueuedMutation,
    type OutboxMutationState,
    type QueuedMutation
} from './queuedMutation';

const BROWSER_OUTBOX_DATABASE_NAME = 'calibrate-offline';
const BROWSER_OUTBOX_DATABASE_VERSION = 1;
const MUTATION_STORE = 'queued_mutations';
const NAMESPACE_INDEX = 'namespace';
const NAMESPACE_ID_INDEX = 'namespace_id';
const MAX_PERSISTED_ERROR_LENGTH = 2_000;
const BROWSER_STORAGE_ERROR = 'Browser offline storage is unavailable';

type StoredMutation = {
    sequence?: number;
    id: string;
    namespace: string;
    operation: string;
    payloadJson: string;
    state: OutboxMutationState;
    attemptCount: number;
    lastError: string | null;
    createdAt: number;
    updatedAt: number;
};

type OpenIndexedDbOptions = {
    factory?: IDBFactory | null;
    databaseName?: string;
};

function describeStorageError(error: unknown): string {
    if (error instanceof Error && error.message.trim()) return `${BROWSER_STORAGE_ERROR}: ${error.message}`;
    return `${BROWSER_STORAGE_ERROR}. Enable site storage and try again.`;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
    });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
        transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    });
}

function requireSequence(row: StoredMutation): number {
    if (typeof row.sequence !== 'number') throw new Error('Stored browser mutation has no sequence.');
    return row.sequence;
}

function mapStoredMutation(row: StoredMutation): QueuedMutation {
    return {
        sequence: requireSequence(row),
        id: row.id,
        namespace: row.namespace,
        operation: row.operation,
        payload: parseMutationPayload(row.payloadJson),
        state: row.state,
        attemptCount: row.attemptCount,
        lastError: row.lastError,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
    };
}

/** Open the browser-owned durable queue without loading a runtime IndexedDB polyfill. */
export function openIndexedDbOutboxDatabase(options: OpenIndexedDbOptions = {}): Promise<IDBDatabase> {
    const factory = options.factory === undefined ? globalThis.indexedDB : options.factory;
    if (!factory) return Promise.reject(new Error(`${BROWSER_STORAGE_ERROR}: IndexedDB is not supported.`));

    return new Promise((resolve, reject) => {
        let request: IDBOpenDBRequest;
        try {
            request = factory.open(options.databaseName ?? BROWSER_OUTBOX_DATABASE_NAME, BROWSER_OUTBOX_DATABASE_VERSION);
        } catch (error) {
            reject(new Error(describeStorageError(error)));
            return;
        }

        request.onupgradeneeded = () => {
            const database = request.result;
            if (database.objectStoreNames.contains(MUTATION_STORE)) return;
            const store = database.createObjectStore(MUTATION_STORE, { keyPath: 'sequence', autoIncrement: true });
            store.createIndex(NAMESPACE_INDEX, 'namespace', { unique: false });
            store.createIndex(NAMESPACE_ID_INDEX, ['namespace', 'id'], { unique: true });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error(describeStorageError(request.error)));
        request.onblocked = () => reject(new Error(`${BROWSER_STORAGE_ERROR}: another tab is blocking an upgrade.`));
    });
}

let browserDatabasePromise: Promise<IDBDatabase> | null = null;

/** Share one connection between authenticated browser namespaces. */
export function openBrowserOutboxDatabase(): Promise<IDBDatabase> {
    if (!browserDatabasePromise) {
        browserDatabasePromise = openIndexedDbOutboxDatabase().then((database) => {
            database.onversionchange = () => {
                database.close();
                browserDatabasePromise = null;
            };
            return database;
        }).catch((error) => {
            browserDatabasePromise = null;
            throw error;
        });
    }
    return browserDatabasePromise;
}

/** IndexedDB-backed queue for one normalized server-origin and authenticated user. */
export class IndexedDbOutbox implements OutboxStore {
    constructor(
        private readonly database: IDBDatabase,
        private readonly namespace: string,
        private readonly createId: () => string = Crypto.randomUUID,
        private readonly now: () => number = Date.now
    ) {}

    async enqueue(mutation: NewQueuedMutation): Promise<QueuedMutation> {
        const operation = mutation.operation.trim();
        if (!operation) throw new Error('Queued mutations require an operation name.');
        const timestamp = this.now();
        const row: StoredMutation = {
            id: mutation.id ?? this.createId(),
            namespace: this.namespace,
            operation,
            payloadJson: serializeMutationPayload(mutation.payload),
            state: OUTBOX_MUTATION_STATES.PENDING,
            attemptCount: 0,
            lastError: null,
            createdAt: timestamp,
            updatedAt: timestamp
        };
        const transaction = this.database.transaction(MUTATION_STORE, 'readwrite');
        const done = transactionDone(transaction);
        const sequence = await requestResult(transaction.objectStore(MUTATION_STORE).add(row));
        await done;
        row.sequence = Number(sequence);
        return mapStoredMutation(row);
    }

    async list(): Promise<QueuedMutation[]> {
        const transaction = this.database.transaction(MUTATION_STORE, 'readonly');
        const done = transactionDone(transaction);
        const rows = await requestResult<StoredMutation[]>(
            transaction.objectStore(MUTATION_STORE).index(NAMESPACE_INDEX).getAll(this.namespace)
        );
        await done;
        return rows.sort((left, right) => requireSequence(left) - requireSequence(right)).map(mapStoredMutation);
    }

    claimNext(): Promise<QueuedMutation | null> {
        return new Promise((resolve, reject) => {
            const transaction = this.database.transaction(MUTATION_STORE, 'readwrite');
            const request = transaction.objectStore(MUTATION_STORE).index(NAMESPACE_INDEX).openCursor(this.namespace);
            let claimed: QueuedMutation | null = null;
            request.onsuccess = () => {
                const cursor = request.result;
                const row = cursor?.value as StoredMutation | undefined;
                // The oldest durable failure is a queue barrier until retry is explicit.
                if (!cursor || !row || row.state !== OUTBOX_MUTATION_STATES.PENDING) return;
                const updated: StoredMutation = {
                    ...row,
                    state: OUTBOX_MUTATION_STATES.REPLAYING,
                    attemptCount: row.attemptCount + 1,
                    lastError: null,
                    updatedAt: this.now()
                };
                const update = cursor.update(updated);
                update.onsuccess = () => { claimed = mapStoredMutation(updated); };
            };
            request.onerror = () => reject(request.error ?? new Error('Unable to claim a browser mutation.'));
            transaction.oncomplete = () => resolve(claimed);
            transaction.onabort = () => reject(transaction.error ?? new Error('Unable to claim a browser mutation.'));
            transaction.onerror = () => reject(transaction.error ?? new Error('Unable to claim a browser mutation.'));
        });
    }

    async complete(id: string): Promise<void> {
        const transaction = this.database.transaction(MUTATION_STORE, 'readwrite');
        const done = transactionDone(transaction);
        const store = transaction.objectStore(MUTATION_STORE);
        const row = await requestResult<StoredMutation | undefined>(store.index(NAMESPACE_ID_INDEX).get([this.namespace, id]));
        if (!row || row.state !== OUTBOX_MUTATION_STATES.REPLAYING) {
            await done;
            throw new Error(`Unable to complete queued mutation ${id}.`);
        }
        await requestResult(store.delete(requireSequence(row)));
        await done;
    }

    async fail(id: string, error: string): Promise<QueuedMutation> {
        const transaction = this.database.transaction(MUTATION_STORE, 'readwrite');
        const done = transactionDone(transaction);
        const store = transaction.objectStore(MUTATION_STORE);
        const row = await requestResult<StoredMutation | undefined>(store.index(NAMESPACE_ID_INDEX).get([this.namespace, id]));
        if (!row || row.state !== OUTBOX_MUTATION_STATES.REPLAYING) {
            await done;
            throw new Error(`Unable to persist failure for queued mutation ${id}.`);
        }
        const failed: StoredMutation = {
            ...row,
            state: OUTBOX_MUTATION_STATES.FAILED,
            lastError: error.slice(0, MAX_PERSISTED_ERROR_LENGTH),
            updatedAt: this.now()
        };
        await requestResult(store.put(failed));
        await done;
        return mapStoredMutation(failed);
    }

    recoverInterrupted(): Promise<void> {
        return this.updateNamespaceRows(
            (row) => row.state === OUTBOX_MUTATION_STATES.REPLAYING,
            (row) => ({ ...row, state: OUTBOX_MUTATION_STATES.PENDING, updatedAt: this.now() })
        );
    }

    async retryFailed(id?: string): Promise<void> {
        if (id) {
            const transaction = this.database.transaction(MUTATION_STORE, 'readwrite');
            const done = transactionDone(transaction);
            const store = transaction.objectStore(MUTATION_STORE);
            const row = await requestResult<StoredMutation | undefined>(store.index(NAMESPACE_ID_INDEX).get([this.namespace, id]));
            if (row?.state === OUTBOX_MUTATION_STATES.FAILED) {
                await requestResult(store.put({
                    ...row,
                    state: OUTBOX_MUTATION_STATES.PENDING,
                    lastError: null,
                    updatedAt: this.now()
                }));
            }
            await done;
            return;
        }
        await this.updateNamespaceRows(
            (row) => row.state === OUTBOX_MUTATION_STATES.FAILED,
            (row) => ({
                ...row,
                state: OUTBOX_MUTATION_STATES.PENDING,
                lastError: null,
                updatedAt: this.now()
            })
        );
    }

    clear(): Promise<void> {
        return this.updateNamespaceRows(() => true, () => null);
    }

    private updateNamespaceRows(
        matches: (row: StoredMutation) => boolean,
        update: (row: StoredMutation) => StoredMutation | null
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const transaction = this.database.transaction(MUTATION_STORE, 'readwrite');
            const request = transaction.objectStore(MUTATION_STORE).index(NAMESPACE_INDEX).openCursor(this.namespace);
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) return;
                const row = cursor.value as StoredMutation;
                if (!matches(row)) {
                    cursor.continue();
                    return;
                }
                const next = update(row);
                const mutationRequest = next ? cursor.update(next) : cursor.delete();
                mutationRequest.onsuccess = () => cursor.continue();
            };
            request.onerror = () => reject(request.error ?? new Error('Unable to update browser mutations.'));
            transaction.oncomplete = () => resolve();
            transaction.onabort = () => reject(transaction.error ?? new Error('Unable to update browser mutations.'));
            transaction.onerror = () => reject(transaction.error ?? new Error('Unable to update browser mutations.'));
        });
    }
}
