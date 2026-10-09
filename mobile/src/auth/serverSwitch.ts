import type { ServerConnectionResult } from '../config/server';

type AuthenticateAgainstConfirmedServerOptions<T> = {
    candidate: string;
    confirmServer: (candidate: string) => Promise<ServerConnectionResult>;
    authenticate: (confirmedServerUrl: string) => Promise<T>;
};

/**
 * Authenticate against the exact normalized origin that passed the server probe.
 *
 * React state updates do not refresh callbacks synchronously, so the credential
 * request must consume the confirmation result instead of a state-backed client.
 */
export async function authenticateAgainstConfirmedServer<T>(
    options: AuthenticateAgainstConfirmedServerOptions<T>
): Promise<T | null> {
    const connection = await options.confirmServer(options.candidate);
    if (!connection.ok) return null;

    return options.authenticate(connection.url);
}
