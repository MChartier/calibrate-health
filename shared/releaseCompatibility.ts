const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export const CLIENT_SERVER_MAJOR_VERSION_STATUSES = {
    COMPATIBLE: 'compatible',
    CLIENT_BEHIND: 'client_behind',
    SERVER_BEHIND: 'server_behind',
    INVALID: 'invalid'
} as const;

export type ClientServerMajorVersionStatus =
    (typeof CLIENT_SERVER_MAJOR_VERSION_STATUSES)[keyof typeof CLIENT_SERVER_MAJOR_VERSION_STATUSES];

export type ClientServerMajorVersionMismatch = {
    clientVersion: string;
    serverVersion: string;
    status: Exclude<ClientServerMajorVersionStatus, 'compatible'>;
};

function parseMajorVersion(version: unknown): string | null {
    if (typeof version !== 'string') return null;
    const match = version.match(SEMVER_PATTERN);
    if (!match) return null;
    return match[1];
}

function compareNumericIdentifier(left: string, right: string): number {
    if (left.length !== right.length) return left.length < right.length ? -1 : 1;
    if (left === right) return 0;
    return left < right ? -1 : 1;
}

function versionLabel(version: unknown): string {
    if (typeof version !== 'string') return 'unknown';
    if (!parseMajorVersion(version) || version.length > 64) return 'invalid';
    return version;
}

/** Compare the client and server major versions that define their compatibility contract. */
export function compareClientServerMajorVersions(
    clientVersion: unknown,
    serverVersion: unknown
): ClientServerMajorVersionStatus {
    const clientMajor = parseMajorVersion(clientVersion);
    const serverMajor = parseMajorVersion(serverVersion);
    if (!clientMajor || !serverMajor) return CLIENT_SERVER_MAJOR_VERSION_STATUSES.INVALID;
    const majorComparison = compareNumericIdentifier(clientMajor, serverMajor);
    if (majorComparison === 0) return CLIENT_SERVER_MAJOR_VERSION_STATUSES.COMPATIBLE;
    if (majorComparison < 0) return CLIENT_SERVER_MAJOR_VERSION_STATUSES.CLIENT_BEHIND;
    return CLIENT_SERVER_MAJOR_VERSION_STATUSES.SERVER_BEHIND;
}

export function getClientServerMajorVersionMismatch(
    clientVersion: unknown,
    serverVersion: unknown
): ClientServerMajorVersionMismatch | null {
    const status = compareClientServerMajorVersions(clientVersion, serverVersion);
    if (status === CLIENT_SERVER_MAJOR_VERSION_STATUSES.COMPATIBLE) return null;
    return {
        clientVersion: versionLabel(clientVersion),
        serverVersion: versionLabel(serverVersion),
        status
    };
}

export function formatMajorVersion(version: unknown): string | null {
    const majorVersion = parseMajorVersion(version);
    return majorVersion ? `${majorVersion}.x` : null;
}
