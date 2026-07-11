import { ApiError, CalibrateApiClient } from '@calibrate/api-client';

const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
    });

describe('CalibrateApiClient mobile authentication recovery', () => {
    it('single-flights concurrent refreshes and retries each request once', async () => {
        let accessToken = 'expired-access';
        let refreshCount = 0;
        let initialRequestCount = 0;
        const waitingInitialRequests: Array<() => void> = [];

        const fetchImpl: typeof fetch = async (_input, init) => {
            const authorization = new Headers(init?.headers).get('authorization');
            if (authorization === 'Bearer expired-access') {
                initialRequestCount += 1;
                if (initialRequestCount < 2) {
                    await new Promise<void>((resolve) => waitingInitialRequests.push(resolve));
                } else {
                    waitingInitialRequests.splice(0).forEach((resolve) => resolve());
                }
                return jsonResponse({ message: 'expired' }, 401);
            }

            return jsonResponse({ user: { id: 1 } });
        };

        const client = new CalibrateApiClient({
            baseUrl: 'https://example.test',
            getAccessToken: () => accessToken,
            refreshAccessToken: async () => {
                refreshCount += 1;
                accessToken = 'fresh-access';
                return true;
            },
            fetchImpl
        });

        await Promise.all([client.getMe(), client.getUserProfile()]);

        expect(initialRequestCount).toBe(2);
        expect(refreshCount).toBe(1);
    });

    it('retries only once before clearing an unauthorized session', async () => {
        let requestCount = 0;
        let refreshCount = 0;
        let unauthorizedCount = 0;
        const client = new CalibrateApiClient({
            baseUrl: 'https://example.test',
            getAccessToken: () => 'rejected-access',
            refreshAccessToken: async () => {
                refreshCount += 1;
                return true;
            },
            onUnauthorized: async () => {
                unauthorizedCount += 1;
            },
            fetchImpl: async () => {
                requestCount += 1;
                return jsonResponse({ message: 'still rejected' }, 401);
            }
        });

        await expect(client.getMe()).rejects.toBeInstanceOf(ApiError);
        expect(requestCount).toBe(2);
        expect(refreshCount).toBe(1);
        expect(unauthorizedCount).toBe(1);
    });

    it('preserves the session when refresh is temporarily unavailable', async () => {
        let unauthorizedCount = 0;
        const client = new CalibrateApiClient({
            baseUrl: 'https://example.test',
            getAccessToken: () => 'expired-access',
            refreshAccessToken: async () => {
                throw new Error('refresh network unavailable');
            },
            onUnauthorized: async () => {
                unauthorizedCount += 1;
            },
            fetchImpl: async () => jsonResponse({ message: 'expired' }, 401)
        });

        await expect(client.getMe()).rejects.toThrow('refresh network unavailable');
        expect(unauthorizedCount).toBe(0);
    });

    it('logs out by refresh token without requiring a valid access token', async () => {
        let refreshCount = 0;
        let authorization: string | null = 'not-called';
        const client = new CalibrateApiClient({
            baseUrl: 'https://example.test',
            getAccessToken: () => 'expired-access',
            refreshAccessToken: async () => {
                refreshCount += 1;
                return true;
            },
            fetchImpl: async (_input, init) => {
                authorization = new Headers(init?.headers).get('authorization');
                return jsonResponse({ ok: true });
            }
        });

        await client.logoutMobile('refresh-token');

        expect(authorization).toBeNull();
        expect(refreshCount).toBe(0);
    });
});
