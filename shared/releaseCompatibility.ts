const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export const CLIENT_SERVER_COMPATIBILITY_STATUSES = {
    COMPATIBLE: 'compatible',
    CLIENT_BEHIND: 'client_behind',
    SERVER_BEHIND: 'server_behind',
    INVALID: 'invalid'
} as const;

export type ClientServerCompatibilityStatus =
    (typeof CLIENT_SERVER_COMPATIBILITY_STATUSES)[keyof typeof CLIENT_SERVER_COMPATIBILITY_STATUSES];

export type ClientServerCompatibilityMismatch = {
    clientVersion: string;
    serverVersion: string;
    status: Exclude<ClientServerCompatibilityStatus, 'compatible'>;
};

type CompatibilityVersion = readonly [major: string, minor: string];

function parseCompatibilityVersion(version: unknown): CompatibilityVersion | null {
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
    if ((!parseCompatibilityVersion(version) && !parseServerRequirement(version)) || version.length > 128) return 'invalid';
    return version;
}

// Intentionally one explicit bounded range, avoiding ambiguous 0.x caret semantics.
export function parseServerRequirement(value: unknown): { minimum: string; maximumExclusive: string } | null {
    if (typeof value !== 'string') return null;
    const match = /^>=(\d+\.\d+\.\d+) <(\d+\.\d+\.\d+)$/.exec(value);
    if (!match || !SEMVER_PATTERN.test(match[1]) || !SEMVER_PATTERN.test(match[2])) return null;
    if (compareStableVersions(match[1], match[2]) >= 0) return null;
    return { minimum: match[1], maximumExclusive: match[2] };
}

function compareStableVersions(left: string, right: string): number {
    const a = left.split('.');
    const b = right.split('.');
    for (let i = 0; i < 3; i++) {
        const comparison = compareNumericIdentifier(a[i], b[i]);
        if (comparison !== 0) return comparison;
    }
    return 0;
}

export function serverRequirementMessage(mismatch: ClientServerCompatibilityMismatch): string {
    const requirement = parseServerRequirement(mismatch.clientVersion);
    if (!requirement) return 'This client has an invalid server requirement.';
    const detail = 'This Calibrate update requires server ' + requirement.minimum +
        ' or newer, below ' + requirement.maximumExclusive +
        '. The selected server is ' + mismatch.serverVersion + '.';
    if (mismatch.status === CLIENT_SERVER_COMPATIBILITY_STATUSES.SERVER_BEHIND) return detail + ' Update the server first.';
    if (mismatch.status === CLIENT_SERVER_COMPATIBILITY_STATUSES.CLIENT_BEHIND) return detail + ' Install a compatible Calibrate update.';
    return detail;
}
export function compareClientServerCompatibility(
    clientVersion: unknown,
    serverVersion: unknown
): ClientServerCompatibilityStatus {
    const requirement = parseServerRequirement(clientVersion);
    if (requirement) {
        // Prerelease servers are not admitted by a stable production requirement.
        if (typeof serverVersion !== 'string' || !SEMVER_PATTERN.test(serverVersion) || serverVersion.split('+')[0].includes('-')) {
            return CLIENT_SERVER_COMPATIBILITY_STATUSES.INVALID;
        }
        const stable = serverVersion.split('+')[0];
        if (compareStableVersions(stable, requirement.minimum) < 0) return CLIENT_SERVER_COMPATIBILITY_STATUSES.SERVER_BEHIND;
        if (compareStableVersions(stable, requirement.maximumExclusive) >= 0) return CLIENT_SERVER_COMPATIBILITY_STATUSES.CLIENT_BEHIND;
        return CLIENT_SERVER_COMPATIBILITY_STATUSES.COMPATIBLE;
    }
    // Retain the legacy major/minor contract for callers using a server version.
    const client = parseCompatibilityVersion(clientVersion);
    const server = parseCompatibilityVersion(serverVersion);
    if (!client || !server) return CLIENT_SERVER_COMPATIBILITY_STATUSES.INVALID;

    const majorComparison = compareNumericIdentifier(client[0], server[0]);
    if (majorComparison < 0) return CLIENT_SERVER_COMPATIBILITY_STATUSES.CLIENT_BEHIND;
    if (majorComparison > 0) return CLIENT_SERVER_COMPATIBILITY_STATUSES.SERVER_BEHIND;

    const minorComparison = compareNumericIdentifier(client[1], server[1]);
    if (minorComparison > 0) return CLIENT_SERVER_COMPATIBILITY_STATUSES.SERVER_BEHIND;
    return CLIENT_SERVER_COMPATIBILITY_STATUSES.COMPATIBLE;
}

export function getClientServerCompatibilityMismatch(
    clientVersion: unknown,
    serverVersion: unknown
): ClientServerCompatibilityMismatch | null {
    const status = compareClientServerCompatibility(clientVersion, serverVersion);
    if (status === CLIENT_SERVER_COMPATIBILITY_STATUSES.COMPATIBLE) return null;
    return {
        clientVersion: versionLabel(clientVersion),
        serverVersion: versionLabel(serverVersion),
        status
    };
}

export function formatMajorVersion(version: unknown): string | null {
    const parsedVersion = parseCompatibilityVersion(version);
    return parsedVersion ? `${parsedVersion[0]}.x` : null;
}

export function formatMinorVersion(version: unknown): string | null {
    const parsedVersion = parseCompatibilityVersion(version);
    return parsedVersion ? `${parsedVersion[0]}.${parsedVersion[1]}.x` : null;
}
