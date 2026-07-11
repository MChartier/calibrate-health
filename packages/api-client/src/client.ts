import type {
    ClientConfigResponse,
    FoodLogCreatePayload,
    FoodLogDay,
    FoodLogEntry,
    FoodLogUpdatePayload,
    FoodSearchResponse,
    GoalEntry,
    InAppNotificationsResponse,
    LoseItImportSummary,
    MetricEntry,
    MobileAuthRequest,
    MobileAuthResponse,
    MobileSessionSummary,
    CreateRecipePayload,
    MyFoodDetail,
    MyFoodSummary,
    MobileRefreshResponse,
    NativePushSubscriptionPayload,
    RecentFoodsResponse,
    SyncChangesResponse,
    TrendMetricsResponse,
    UserClientPayload,
    UserProfileResponse
} from './types';

export type ApiClientOptions = {
    baseUrl: string;
    getAccessToken?: () => string | null | Promise<string | null>;
    /** Refresh native credentials after a protected request returns 401. */
    refreshAccessToken?: () => boolean | Promise<boolean>;
    onUnauthorized?: () => void | Promise<void>;
    fetchImpl?: typeof fetch;
    requestTimeoutMs?: number;
};

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
    private readonly refreshAccessToken?: ApiClientOptions['refreshAccessToken'];
    private readonly onUnauthorized?: ApiClientOptions['onUnauthorized'];
    private readonly fetchImpl: typeof fetch;
    private readonly requestTimeoutMs: number;
    private refreshPromise: Promise<boolean> | null = null;

    constructor(options: ApiClientOptions) {
        this.baseUrl = options.baseUrl;
        this.getAccessToken = options.getAccessToken;
        this.refreshAccessToken = options.refreshAccessToken;
        this.onUnauthorized = options.onUnauthorized;
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
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
        const { auth = true, json, ...fetchOptions } = options;
        const headers = new Headers(options.headers);
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

        let response: Response;
        try {
            response = await this.fetchImpl(buildUrl(this.baseUrl, path), {
                ...fetchOptions,
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

        if (!response.ok) {
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

    refreshMobile(refreshToken: string): Promise<MobileRefreshResponse> {
        return this.request<MobileRefreshResponse>('/auth/mobile/refresh', {
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

    updatePreferences(payload: Record<string, unknown>): Promise<{ user: UserClientPayload }> {
        return this.request<{ user: UserClientPayload }>('/api/user/preferences', {
            method: 'PATCH',
            json: payload
        });
    }

    getGoals(): Promise<GoalEntry | null> {
        return this.request<GoalEntry | null>('/api/goals');
    }

    createGoal(payload: Record<string, unknown>): Promise<GoalEntry> {
        return this.request<GoalEntry>('/api/goals', {
            method: 'POST',
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

    createMyFood(payload: Record<string, unknown>): Promise<MyFoodSummary> {
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

    previewLoseItImport(file: { uri: string; name: string; type: string }): Promise<LoseItImportSummary> {
        const formData = new FormData();
        formData.append('file', file as unknown as Blob);
        return this.requestForm<LoseItImportSummary>('/api/imports/loseit/preview', formData);
    }

    executeLoseItImport(file: { uri: string; name: string; type: string }): Promise<LoseItImportSummary> {
        const formData = new FormData();
        formData.append('file', file as unknown as Blob);
        return this.requestForm<LoseItImportSummary>('/api/imports/loseit/execute', formData);
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

    getInAppNotifications(): Promise<InAppNotificationsResponse> {
        return this.request<InAppNotificationsResponse>('/api/notifications/in-app');
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
