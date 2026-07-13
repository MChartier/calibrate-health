import { ApiError } from '@calibrate/api-client';
import { getSessionRestoreErrorMessage } from './authErrors';

describe('session restore error copy', () => {
    it('distinguishes an expired session from a temporarily unavailable server', () => {
        expect(getSessionRestoreErrorMessage(new ApiError('unauthorized', 401, null)))
            .toBe('Your saved session expired. Sign in again.');
        expect(getSessionRestoreErrorMessage(new TypeError('Network request failed')))
            .toContain('your session is still stored');
    });

    it('does not expose arbitrary implementation errors', () => {
        expect(getSessionRestoreErrorMessage(new Error('postgres password was bad')))
            .toBe('Unable to restore your saved session. Test the server connection or sign in again.');
    });
});
