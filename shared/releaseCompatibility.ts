const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export const CLIENT_SERVER_RELEASE_STATUSES = {
    COMPATIBLE: 'compatible',
    CLIENT_BEHIND: 'client_behind',
    SERVER_BEHIND: 'server_behind',
    INVALID: 'invalid'
} as const;

export type ClientServerReleaseStatus =
    (typeof CLIENT_SERVER_RELEASE_STATUSES)[keyof typeof CLIENT_SERVER_RELEASE_STATUSES];

export type ClientServerReleaseMismatch = {
    clientVersion: string;
    serverVersion: string;
    status: Exclude<ClientServerReleaseStatus, 'compatible'>;
};

type ReleaseLine = readonly [major: string, minor: string];

function parseReleaseLine(version: unknown): ReleaseLine | null {
    if (typeof version !== 'string') return null;
    const match = version.match(SEMVER_PATTERN);
    if (!match) return null;
    return [match[1], match[2]];
}

function compareNumericIdentifier(left: string, right: string): number {
    if (left.length !== right.length) return left.length < right.length ? -1 : 1;
    if (left === right) return 0;
    return left < right ? -1 : 1;
}

function versionLabel(version: unknown): string {
    if (typeof version !== 'string') return 'unknown';
    if (!parseReleaseLine(version) || version.length > 64) return 'invalid';
    return version;
}

/** Compare the server contract bundled into a client with the deployed server release line. */
export function compareClientServerReleaseLines(
    clientVersion: unknown,
    serverVersion: unknown
): ClientServerReleaseStatus {
    const client = parseReleaseLine(clientVersion);
    const server = parseReleaseLine(serverVersion);
    if (!client || !server) return CLIENT_SERVER_RELEASE_STATUSES.INVALID;
    if (client[0] === server[0] && client[1] === server[1]) {
        return CLIENT_SERVER_RELEASE_STATUSES.COMPATIBLE;
    }
    const majorComparison = compareNumericIdentifier(client[0], server[0]);
    const minorComparison = compareNumericIdentifier(client[1], server[1]);
    if (majorComparison < 0 || (majorComparison === 0 && minorComparison < 0)) {
        return CLIENT_SERVER_RELEASE_STATUSES.CLIENT_BEHIND;
    }
    return CLIENT_SERVER_RELEASE_STATUSES.SERVER_BEHIND;
}

export function getClientServerReleaseMismatch(
    clientVersion: unknown,
    serverVersion: unknown
): ClientServerReleaseMismatch | null {
    const status = compareClientServerReleaseLines(clientVersion, serverVersion);
    if (status === CLIENT_SERVER_RELEASE_STATUSES.COMPATIBLE) return null;
    return {
        clientVersion: versionLabel(clientVersion),
        serverVersion: versionLabel(serverVersion),
        status
    };
}

export function formatReleaseLine(version: unknown): string | null {
    const releaseLine = parseReleaseLine(version);
    return releaseLine ? `${releaseLine[0]}.${releaseLine[1]}.x` : null;
}
