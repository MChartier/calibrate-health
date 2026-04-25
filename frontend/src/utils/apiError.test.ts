import { describe, expect, it } from 'vitest'

import { getApiErrorMessage } from './apiError'

describe('API error utilities', () => {
  it('extracts trimmed backend validation messages from Axios errors', () => {
    const error = {
      isAxiosError: true,
      response: {
        data: {
          message: '  Email is already registered.  ',
        },
      },
    }

    expect(getApiErrorMessage(error)).toBe('Email is already registered.')
  })

  it('returns null for non-Axios errors or missing messages', () => {
    expect(getApiErrorMessage(new Error('plain error'))).toBeNull()
    expect(getApiErrorMessage({ isAxiosError: true, response: { data: { message: '   ' } } })).toBeNull()
    expect(getApiErrorMessage({ isAxiosError: true, response: { data: { message: 42 } } })).toBeNull()
  })
})
