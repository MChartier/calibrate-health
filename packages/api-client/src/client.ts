import type {
    AccountExport,
    ActivityDaysResponse,
    BrowserAuthRequest,
    BrowserAuthResponse,
    BrowserPushSubscriptionPayload,
    ClientConfigResponse,
    CreateMyFoodPayload,
    FoodLogCreatePayload,
    FoodLogDay,
    FoodLogEntry,
    FoodLogUpdatePayload,
    FoodSearchResponse,
    GoalEntry,
    HealthConnectSyncPayload,
    HealthConnectSyncResponse,
    InAppNotificationsResponse,
    LoseItImportSummary,
    MetricEntry,
    MobileAuthRequest,
    MobileAuthResponse,
    MobileSessionSummary,
    WearPairingCredentialRequest,
    WearPairingCredentialResponse,
    WearPairingExchangeRequest,
    WearMobileAuthResponse,
    WatchMutationRequest,
    WatchMutationResponse,
    WatchSnapshotFetchResult,
    CreateRecipePayload,
    MyFoodDetail,
    MyFoodSummary,
    MobileRefreshResponse,
    NativePushSubscriptionPayload,
    RecentFoodsResponse,
    SyncChangesResponse,
    TrendMetricsResponse,
    UpdateMyFoodPayload,
    UserClientPayload,
    UserProfileResponse
} from './types';
import {
    NATIVE_CLIENT_HEADERS,
    isClientUpgradeRequirement,
    type ClientUpgradeRequirement,
    type NativeClientIdentity
} from '@calibrate/shared/clientCompatibility';

export type ApiClientOptions = {
    baseUrl: string;
    /** Native identity is attached to every request so a self-host can enforce release floors continuously. */
    clientIdentity?: NativeClientIdentity;
    onClientUpgradeRequired?: (requirement: ClientUpgradeRequirement) => void | Promise<void>;
    getAccessToken?: () => string | null | Promise<string | null>;
    /** Refresh native credentials after a protected request returns 401. */
    refreshAccessToken?: () => boolean | Promise<boolean>;
    onUnauthorized?: () => void | Promise<void>;
    fetchImpl?: typeof fetch;
    requestTimeoutMs?: number;
    /** Browser clients opt in explicitly when the API uses an HttpOnly cookie session. */
    requestCredentials?: RequestCredentials;
};

/** React Native uploads identify a local URI, while browsers must submit a real Blob/File. */
export type LoseItImportFile = { uri: string; name: string; type: string } | Blob;

const isNativeLoseItImportFile = (file: LoseItImportFile): file is { uri: string; name: string; type: string } =>
    'uri' in file;

export class ApiError extends Error {
    readonly status: number;
    readonly body: unknown;

    constructor(message: string, status: number, body: unknown) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.body = body;
    }
}

type RequestOptions = RequestInit & {
    auth?: boolean;
    json?: unknown;
    acceptNotModified?: boolean;
    responseMetadata?: boolean;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 15000;
const CLIENT_OPERATION_ID_HEADER = 'x-client-operation-id';

/** Attach an operation identifier only when the caller is opting into idempotent replay. */
const buildOperationHeaders = (operationId?: string): HeadersInit | undefined =>
    operationId ? { [CLIENT_OPERATION_ID_HEADER]: operationId } : undefined;

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const buildUrl = (baseUrl: string, path: string): string => {
    const requestedPath = path.startsWith('/') ? path : `/${path}`;
    // Keep method declarations readable while ensuring all shared API calls use the stable v1 mount.
    const normalizedPath = requestedPath.startsWith('/api/')
        ? `/api/v1/${requestedPath.slice('/api/'.length)}`
        : requestedPath;
    return `${trimTrailingSlash(baseUrl)}${normalizedPath}`;
};

const getErrorMessage = (body: unknown, fallback: string): string => {
    if (body && typeof body === 'object' && 'message' in body) {
        const message = (body as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim().length > 0) {
            return message;
        }
    }

    return fallback;
};

/**
 * Typed fetch wrapper for the Calibrate HTTP API.
 */
export class CalibrateApiClient {
    private readonly baseUrl: string;
    private readonly getAccessToken?: ApiClientOptions['getAccessToken'];
    private readonly clientIdentity?: NativeClientIdentity;
    private readonly onClientUpgradeRequired?: ApiClientOptions['onClientUpgradeRequired'];
    private readonly refreshAccessToken?: ApiClientOptions['refreshAccessToken'];
    private readonly onUnauthorized?: ApiClientOptions['onUnauthorized'];
    private readonly fetchImpl: typeof fetch;
    private readonly requestTimeoutMs: number;
    private readonly requestCredentials?: RequestCredentials;
    private refreshPromise: Promise<boolean> | null = null;

    constructor(options: ApiClientOptions) {
        this.baseUrl = options.baseUrl;
        this.clientIdentity = options.clientIdentity;
        this.onClientUpgradeRequired = options.onClientUpgradeRequired;
        this.getAccessToken = options.getAccessToken;
        this.refreshAccessToken = options.refreshAccessToken;
        this.onUnauthorized = options.onUnauthorized;
        // Preserve the browser global as fetch's receiver; some web hosts reject detached Window.fetch calls.
        this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
        this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        this.requestCredentials = options.requestCredentials;
    }

    /** Share one refresh across concurrent 401 responses to avoid rotating the same token twice. */
    private async refreshAccessTokenOnce(): Promise<boolean> {
        if (!this.refreshAccessToken) return false;

        if (!this.refreshPromise) {
            this.refreshPromise = Promise.resolve(this.refreshAccessToken())
                .finally(() => {
                    this.refreshPromise = null;
                });
        }

        return this.refreshPromise;
    }

    private async request<T>(path: string, options: RequestOptions = {}, allowRefresh = true): Promise<T> {
        const {
            auth = true,
            json,
            acceptNotModified = false,
            responseMetadata = false,
            ...fetchOptions
        } = options;
        const headers = new Headers(options.headers);
        if (this.clientIdentity) {
            // Constructor-owned identity wins over per-request headers so feature code cannot spoof another client.
            headers.set(NATIVE_CLIENT_HEADERS.PLATFORM, this.clientIdentity.platform);
            headers.set(NATIVE_CLIENT_HEADERS.VERSION, this.clientIdentity.version);
        }
        if (json !== undefined) {
            headers.set('content-type', 'application/json');
        }

        if (auth && this.getAccessToken) {
            const token = await this.getAccessToken();
            if (token) {
                headers.set('authorization', `Bearer ${token}`);
            }
        }

        const timeoutController = new AbortController();
        let timedOut = false;
        const timeoutId = setTimeout(() => {
            timedOut = true;
            timeoutController.abort();
        }, this.requestTimeoutMs);
        const callerSignal = options.signal;
        const abortFromCaller = () => timeoutController.abort();
        callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
        if (callerSignal?.aborted) {
            // An abort event that fired before listener registration must still cancel this request.
            abortFromCaller();
        }

        let response: Response;
        try {
            response = await this.fetchImpl(buildUrl(this.baseUrl, path), {
                ...fetchOptions,
                credentials: fetchOptions.credentials ?? this.requestCredentials,
                headers,
                signal: timeoutController.signal,
                body: json !== undefined ? JSON.stringify(json) : options.body
            });
        } catch (error) {
            if (timedOut) {
                throw new Error(`Request timed out while connecting to ${this.baseUrl}. Check the server URL and network access.`);
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
            callerSignal?.removeEventListener('abort', abortFromCaller);
        }

        const text = await response.text();
        let body: unknown = null;
        if (text.length > 0) {
            try {
                body = JSON.parse(text);
            } catch {
                // Reverse proxies and self-hosted gateways can return plain text or HTML failures.
                body = text;
            }
        }

        if (response.status === 304 && acceptNotModified) {
            return {
                body: null,
                etag: response.headers.get('etag'),
                notModified: true
            } as T;
        }

        if (!response.ok) {
            if (response.status === 426 && isClientUpgradeRequirement(body)) {
                await this.onClientUpgradeRequired?.(body);
            }
            if (response.status === 401 && auth && allowRefresh && this.refreshAccessToken) {
                const refreshed = await this.refreshAccessTokenOnce();
                if (refreshed) {
                    return this.request<T>(path, options, false);
                }
            }
            if (response.status === 401 && auth) {
                await this.onUnauthorized?.();
            }
            throw new ApiError(getErrorMessage(body, `Request failed with status ${response.status}`), response.status, body);
        }

        if (response.status === 204) return undefined as T;
        if (responseMetadata) {
            return {
                body,
                etag: response.headers.get('etag'),
                notModified: false
            } as T;
        }
        return body as T;
    }

    private async requestForm<T>(path: string, formData: FormData): Promise<T> {
        return this.request<T>(path, {
            method: 'POST',
            body: formData
        });
    }

    getClientConfig(): Promise<ClientConfigResponse> {
        return this.request<ClientConfigResponse>('/api/client-config', { auth: false });
    }

    loginBrowser(payload: BrowserAuthRequest): Promise<BrowserAuthResponse> {
        return this.request<BrowserAuthResponse>('/auth/login', {
            method: 'POST',
            auth: false,
            json: payload
        });
    }

    registerBrowser(payload: BrowserAuthRequest): Promise<BrowserAuthResponse> {
        return this.request<BrowserAuthResponse>('/auth/register', {
            method: 'POST',
            auth: false,
            json: payload
        });
    }

    logoutBrowser(): Promise<{ message: string }> {
        return this.request<{ message: string }>('/auth/logout', {
            method: 'POST'
        });
    }

    loginMobile(payload: MobileAuthRequest): Promise<MobileAuthResponse> {
        return this.request<MobileAuthResponse>('/auth/mobile/login', {
            method: 'POST',
            auth: false,
            json: payload
        });
    }

    registerMobile(payload: MobileAuthRequest): Promise<MobileAuthResponse> {
        return this.request<MobileAuthResponse>('/auth/mobile/register', {
            method: 'POST',
            auth: false,
            json: payload
        });
    }

    refreshMobile<TResponse extends MobileRefreshResponse = MobileRefreshResponse>(refreshToken: string): Promise<TResponse> {
        return this.request<TResponse>('/auth/mobile/refresh', {
            method: 'POST',
            auth: false,
            json: { refresh_token: refreshToken }
        });
    }

    logoutMobile(refreshToken?: string): Promise<{ ok: true }> {
        return this.request<{ ok: true }>('/auth/mobile/logout', {
            method: 'POST',
            auth: false,
            json: refreshToken ? { refresh_token: refreshToken } : {}
        });
    }

    getMobileSessions(): Promise<{ sessions: MobileSessionSummary[] }> {
        return this.request<{ sessions: MobileSessionSummary[] }>('/auth/mobile/sessions');
    }

    revokeMobileSession(sessionId: number): Promise<{ ok: true; revoked: boolean }> {
        return this.request<{ ok: true; revoked: boolean }>(`/auth/mobile/sessions/${sessionId}`, {
            method: 'DELETE'
        });
    }

    revokeOtherMobileSessions(): Promise<{ ok: true; revoked: number }> {
        return this.request<{ ok: true; revoked: number }>('/auth/mobile/sessions/revoke-others', {
            method: 'POST'
        });
    }

    issueWearPairingCredential(payload: WearPairingCredentialRequest): Promise<WearPairingCredentialResponse> {
        return this.request<WearPairingCredentialResponse>('/auth/mobile/wear/pairing-credential', {
            method: 'POST',
            json: payload
        });
    }

    exchangeWearPairingCredential(payload: WearPairingExchangeRequest): Promise<WearMobileAuthResponse> {
        return this.request<WearMobileAuthResponse>('/auth/mobile/wear/pair', {
            method: 'POST',
            auth: false,
            json: payload
        });
    }

    getWatchSnapshot(ifNoneMatch?: string): Promise<WatchSnapshotFetchResult> {
        return this.request<WatchSnapshotFetchResult>('/api/watch', {
            headers: ifNoneMatch ? { 'if-none-match': ifNoneMatch } : undefined,
            acceptNotModified: true,
            responseMetadata: true
        });
    }

    executeWatchMutation(payload: WatchMutationRequest, operationId: string): Promise<WatchMutationResponse> {
        return this.request<WatchMutationResponse>('/api/watch/mutations', {
            method: 'POST',
            headers: buildOperationHeaders(operationId),
            json: payload
        });
    }

    getMe(): Promise<{ user: UserClientPayload }> {
        return this.request<{ user: UserClientPayload }>('/auth/me');
    }

    getUserProfile(): Promise<UserProfileResponse> {
        return this.request<UserProfileResponse>('/api/user/profile');
    }

    updateProfile(payload: Record<string, unknown>): Promise<{ user: UserClientPayload }> {
        return this.request<{ user: UserClientPayload }>('/api/user/profile', {
            method: 'PATCH',
            json: payload
        });
    }

    updatePreferences(payload: Record<string, unknown>, operationId?: string): Promise<{ user: UserClientPayload }> {
        return this.request<{ user: UserClientPayload }>('/api/user/preferences', {
            method: 'PATCH',
            headers: buildOperationHeaders(operationId),
            json: payload
        });
    }

    getGoals(): Promise<GoalEntry | null> {
        return this.request<GoalEntry | null>('/api/goals');
    }

    createGoal(payload: Record<string, unknown>, operationId?: string): Promise<GoalEntry> {
        return this.request<GoalEntry>('/api/goals', {
            method: 'POST',
            headers: buildOperationHeaders(operationId),
            json: payload
        });
    }

    getMetrics(): Promise<MetricEntry[]> {
        return this.request<MetricEntry[]>('/api/metrics');
    }

    getTrendMetrics(params: { range?: 'week' | 'month' | 'year' | 'all'; start?: string; end?: string } = {}): Promise<TrendMetricsResponse> {
        const query = new URLSearchParams();
        query.set('include_trend', 'true');
        if (params.range) query.set('range', params.range);
        if (params.start) query.set('start', params.start);
        if (params.end) query.set('end', params.end);
        return this.request<TrendMetricsResponse>(`/api/metrics?${query.toString()}`);
    }

    addMetric(payload: { weight: number; date: string }, operationId?: string): Promise<MetricEntry> {
        return this.request<MetricEntry>('/api/metrics', {
            method: 'POST',
            headers: buildOperationHeaders(operationId),
            json: payload
        });
    }

    deleteMetric(id: number, operationId?: string): Promise<void> {
        return this.request<void>(`/api/metrics/${encodeURIComponent(String(id))}`, {
            method: 'DELETE',
            headers: buildOperationHeaders(operationId)
        });
    }

    getFoodLog(date: string): Promise<FoodLogEntry[]> {
        return this.request<FoodLogEntry[]>(`/api/food?date=${encodeURIComponent(date)}`);
    }

    createFoodLog(payload: FoodLogCreatePayload, operationId?: string): Promise<FoodLogEntry> {
        return this.request<FoodLogEntry>('/api/food', {
            method: 'POST',
            headers: buildOperationHeaders(operationId),
            json: payload
        });
    }

    deleteFoodLog(id: number, operationId?: string): Promise<void> {
        return this.request<void>(`/api/food/${encodeURIComponent(String(id))}`, {
            method: 'DELETE',
            headers: buildOperationHeaders(operationId)
        });
    }

    updateFoodLog(id: number, payload: FoodLogUpdatePayload, operationId?: string): Promise<FoodLogEntry> {
        return this.request<FoodLogEntry>(`/api/food/${encodeURIComponent(String(id))}`, {
            method: 'PATCH',
            headers: buildOperationHeaders(operationId),
            json: payload
        });
    }

    searchFood(query: string, barcode?: string): Promise<FoodSearchResponse> {
        const params = new URLSearchParams();
        if (query.trim()) params.set('q', query.trim());
        if (barcode?.trim()) params.set('barcode', barcode.trim());
        return this.request<FoodSearchResponse>(`/api/food/search?${params.toString()}`);
    }

    getRecentFoods(params: { q?: string; limit?: number } = {}): Promise<RecentFoodsResponse> {
        const query = new URLSearchParams();
        if (params.q?.trim()) query.set('q', params.q.trim());
        if (typeof params.limit === 'number') query.set('limit', String(params.limit));
        const suffix = query.toString() ? `?${query.toString()}` : '';
        return this.request<RecentFoodsResponse>(`/api/food/recent${suffix}`);
    }

    getMyFoods(): Promise<MyFoodSummary[]> {
        return this.request<MyFoodSummary[]>('/api/my-foods');
    }

    getMyFood(id: number): Promise<MyFoodDetail> {
        return this.request<MyFoodDetail>(`/api/my-foods/${encodeURIComponent(String(id))}`);
    }

    setMyFoodPinned(id: number, isPinned: boolean): Promise<MyFoodSummary> {
        return this.request<MyFoodSummary>(`/api/my-foods/${encodeURIComponent(String(id))}/pin`, {
            method: 'PATCH',
            json: { is_pinned: isPinned }
        });
    }

    createMyFood(payload: CreateMyFoodPayload): Promise<MyFoodSummary> {
        return this.request<MyFoodSummary>('/api/my-foods/foods', {
            method: 'POST',
            json: payload
        });
    }

    createRecipe(payload: CreateRecipePayload): Promise<MyFoodSummary> {
        return this.request<MyFoodSummary>('/api/my-foods/recipes', {
            method: 'POST',
            json: payload
        });
    }

    updateMyFood(id: number, payload: UpdateMyFoodPayload): Promise<MyFoodSummary> {
        return this.request<MyFoodSummary>(`/api/my-foods/${encodeURIComponent(String(id))}`, {
            method: 'PATCH',
            json: payload
        });
    }

    deleteMyFood(id: number): Promise<void> {
        return this.request<void>(`/api/my-foods/${encodeURIComponent(String(id))}`, {
            method: 'DELETE'
        });
    }

    async previewLoseItImport(file: LoseItImportFile): Promise<LoseItImportSummary> {
        const formData = await this.createLoseItImportForm(file);
        return this.requestForm<LoseItImportSummary>('/api/imports/loseit/preview', formData);
    }

    async executeLoseItImport(file: LoseItImportFile): Promise<LoseItImportSummary> {
        const formData = await this.createLoseItImportForm(file);
        return this.requestForm<LoseItImportSummary>('/api/imports/loseit/execute', formData);
    }

    /** Convert the web DocumentPicker blob URL to a real browser Blob; native keeps its URI descriptor. */
    private async createLoseItImportForm(file: LoseItImportFile): Promise<FormData> {
        const formData = new FormData();
        if (!isNativeLoseItImportFile(file)) {
            const fileName = typeof File !== 'undefined' && file instanceof File ? file.name : 'loseit-export.zip';
            formData.append('file', file, fileName);
            return formData;
        }

        if (typeof window !== 'undefined') {
            const response = await this.fetchImpl(file.uri);
            if (!response.ok) {
                throw new Error('Unable to read the selected Lose It export in this browser.');
            }
            formData.append('file', await response.blob(), file.name);
            return formData;
        }

        formData.append('file', file as unknown as Blob);
        return formData;
    }

    getFoodDay(date: string): Promise<FoodLogDay> {
        return this.request<FoodLogDay>(`/api/food-days?date=${encodeURIComponent(date)}`);
    }

    updateFoodDay(payload: { date: string; is_complete: boolean }, operationId?: string): Promise<FoodLogDay> {
        return this.request<FoodLogDay>('/api/food-days', {
            method: 'PATCH',
            headers: buildOperationHeaders(operationId),
            json: payload
        });
    }

    getSyncChanges(after = '0', limit?: number): Promise<SyncChangesResponse> {
        const query = new URLSearchParams({ after });
        if (limit !== undefined) query.set('limit', String(limit));
        return this.request<SyncChangesResponse>(`/api/sync/changes?${query.toString()}`);
    }

    getActivityDays(params: { start?: string; end?: string } = {}): Promise<ActivityDaysResponse> {
        const query = new URLSearchParams();
        if (params.start) query.set('start', params.start);
        if (params.end) query.set('end', params.end);
        const suffix = query.toString() ? `?${query.toString()}` : '';
        return this.request<ActivityDaysResponse>(`/api/activity/days${suffix}`);
    }

    syncHealthConnect(
        payload: HealthConnectSyncPayload,
        operationId: string
    ): Promise<HealthConnectSyncResponse> {
        return this.request<HealthConnectSyncResponse>('/api/activity/health-connect/sync', {
            method: 'POST',
            headers: buildOperationHeaders(operationId),
            json: payload
        });
    }

    getInAppNotifications(): Promise<InAppNotificationsResponse> {
        return this.request<InAppNotificationsResponse>('/api/notifications/in-app');
    }

    getBrowserPushPublicKey(): Promise<{ publicKey: string }> {
        return this.request<{ publicKey: string }>('/api/notifications/public-key');
    }

    registerBrowserPushSubscription(payload: BrowserPushSubscriptionPayload): Promise<{ ok: true }> {
        return this.request<{ ok: true }>('/api/notifications/subscription', {
            method: 'POST',
            json: payload
        });
    }

    unregisterBrowserPushSubscription(endpoint: string): Promise<{ ok: true }> {
        return this.request<{ ok: true }>('/api/notifications/subscription', {
            method: 'DELETE',
            json: { endpoint }
        });
    }

    dismissInAppNotification(id: number): Promise<{ ok: true }> {
        return this.request<{ ok: true }>(`/api/notifications/in-app/${encodeURIComponent(String(id))}/dismiss`, {
            method: 'PATCH'
        });
    }

    markInAppNotificationRead(id: number): Promise<{ ok: true }> {
        return this.request<{ ok: true }>(`/api/notifications/in-app/${encodeURIComponent(String(id))}/read`, {
            method: 'PATCH'
        });
    }

    updateProfileImage(dataUrl: string): Promise<{ user: UserClientPayload }> {
        return this.request<{ user: UserClientPayload }>('/api/user/profile-image', {
            method: 'PUT',
            json: { data_url: dataUrl }
        });
    }

    deleteProfileImage(): Promise<{ user: UserClientPayload }> {
        return this.request<{ user: UserClientPayload }>('/api/user/profile-image', {
            method: 'DELETE'
        });
    }

    changePassword(payload: { current_password: string; new_password: string }): Promise<{ message: string }> {
        return this.request<{ message: string }>('/api/user/password', {
            method: 'PATCH',
            json: payload
        });
    }

    exportAccount(): Promise<AccountExport> {
        return this.request<AccountExport>('/api/user/account/export');
    }

    deleteAccount(currentPassword: string): Promise<void> {
        return this.request<void>('/api/user/account', {
            method: 'DELETE',
            json: { current_password: currentPassword }
        });
    }

    registerNativePushSubscription(payload: NativePushSubscriptionPayload): Promise<{ ok: true }> {
        return this.request<{ ok: true }>('/api/notifications/native-subscription', {
            method: 'POST',
            json: payload
        });
    }

    unregisterNativePushSubscription(payload: Partial<NativePushSubscriptionPayload>): Promise<{ ok: true }> {
        return this.request<{ ok: true }>('/api/notifications/native-subscription', {
            method: 'DELETE',
            json: payload
        });
    }
}
