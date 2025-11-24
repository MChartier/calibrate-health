import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000',
  withCredentials: true,
});

let isRefreshing = false;
let refreshPromise: Promise<void> | null = null;

async function refreshTokens() {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshPromise = api.post('/auth/refresh').then(() => undefined).finally(() => {
      isRefreshing = false;
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (resp) => resp,
  async (error) => {
    const { response, config } = error;
    const originalRequest = config as any;
    if (response && response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        await refreshTokens();
        return api(originalRequest);
      } catch (err) {
        return Promise.reject(err);
      }
    }
    return Promise.reject(error);
  }
);

export { api };
