import type { ServerConnectionResult } from '../config/server';

type ConfirmServerSwitchOptions = {
    candidate: string;
    currentServerUrl: string;
    testConnection: (candidate: string) => Promise<ServerConnectionResult>;
    clearCurrentSession: () => Promise<void>;
    persistServerUrl: (serverUrl: string) => Promise<void>;
};

/**
 * Confirm the candidate before mutating server-scoped credentials or persisted settings.
 *
 * This ordering is the safety invariant for switching away from a working self-hosted instance.
 */
export async function confirmServerSwitch(options: ConfirmServerSwitchOptions): Promise<ServerConnectionResult> {
    const connection = await options.testConnection(options.candidate);
    if (!connection.ok) return connection;

    if (connection.url !== options.currentServerUrl) {
        await options.clearCurrentSession();
    }
    await options.persistServerUrl(connection.url);
    return connection;
}
