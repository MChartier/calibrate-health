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
    CreateRecipePayload,
    MyFoodDetail,
    MyFoodSummary,
    MobileRefreshResponse,
    NativePushSubscriptionPayload,
    RecentFoodsResponse,
    TrendMetricsResponse,
    UserClientPayload,
    UserProfileResponse
} from './types';

export type ApiClientOptions = {
    baseUrl: string;
    getAccessToken?: () => string | null | Promise<string | null>;
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

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const buildUrl = (baseUrl: string, path: string): string => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
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
    private readonly onUnauthorized?: ApiClientOptions['onUnauthorized'];
    private readonly fetchImpl: typeof fetch;
    private readonly requestTimeoutMs: number;

    constructor(options: ApiClientOptions) {
        this.baseUrl = options.baseUrl;
        this.getAccessToken = options.getAccessToken;
        this.onUnauthorized = options.onUnauthorized;
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    }

    private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
        const headers = new Headers(options.headers);
        if (options.json !== undefined) {
            headers.set('content-type', 'application/json');
        }

        if (options.auth !== false && this.getAccessToken) {
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
                ...options,
                headers,
                signal: timeoutController.signal,
                body: options.json !== undefined ? JSON.stringify(options.json) : options.body
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
        const body = text.length > 0 ? JSON.parse(text) : null;

        if (!response.ok) {
            if (response.status === 401) {
                await this.onUnauthorized?.();
            }
            throw new ApiError(getErrorMessage(body, `Request failed with status ${response.status}`), response.status, body);
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
            json: refreshToken ? { refresh_token: refreshToken } : {}
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

    addMetric(payload: { weight: number; date: string }): Promise<MetricEntry> {
        return this.request<MetricEntry>('/api/metrics', {
            method: 'POST',
            json: payload
        });
    }

    deleteMetric(id: number): Promise<{ message: string }> {
        return this.request<{ message: string }>(`/api/metrics/${encodeURIComponent(String(id))}`, {
            method: 'DELETE'
        });
    }

    getFoodLog(date: string): Promise<FoodLogEntry[]> {
        return this.request<FoodLogEntry[]>(`/api/food?date=${encodeURIComponent(date)}`);
    }

    createFoodLog(payload: FoodLogCreatePayload): Promise<FoodLogEntry> {
        return this.request<FoodLogEntry>('/api/food', {
            method: 'POST',
            json: payload
        });
    }

    deleteFoodLog(id: number): Promise<{ message: string }> {
        return this.request<{ message: string }>(`/api/food/${encodeURIComponent(String(id))}`, {
            method: 'DELETE'
        });
    }

    updateFoodLog(id: number, payload: FoodLogUpdatePayload): Promise<FoodLogEntry> {
        return this.request<FoodLogEntry>(`/api/food/${encodeURIComponent(String(id))}`, {
            method: 'PATCH',
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

    updateFoodDay(payload: { date: string; is_complete: boolean }): Promise<FoodLogDay> {
        return this.request<FoodLogDay>('/api/food-days', {
            method: 'PATCH',
            json: payload
        });
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
