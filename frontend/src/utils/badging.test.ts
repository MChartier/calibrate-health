import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearAppBadge, isBadgingSupported, setAppBadge } from './badging'

const originalNavigator = globalThis.navigator

function setNavigator(value: Partial<Navigator>): void {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value,
  })
}

describe('badging utilities', () => {
  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    })
  })

  it('detects when both badge methods are available', () => {
    setNavigator({
      setAppBadge: vi.fn(),
      clearAppBadge: vi.fn(),
    } as Partial<Navigator>)

    expect(isBadgingSupported()).toBe(true)
  })

  it('returns false when badge methods are unavailable', async () => {
    setNavigator({} as Partial<Navigator>)

    expect(isBadgingSupported()).toBe(false)
    await expect(setAppBadge(3)).resolves.toBe(false)
    await expect(clearAppBadge()).resolves.toBe(false)
  })

  it('sets and clears the badge through the platform API', async () => {
    const setAppBadgeMock = vi.fn().mockResolvedValue(undefined)
    const clearAppBadgeMock = vi.fn().mockResolvedValue(undefined)
    setNavigator({
      setAppBadge: setAppBadgeMock,
      clearAppBadge: clearAppBadgeMock,
    } as Partial<Navigator>)

    await expect(setAppBadge(5)).resolves.toBe(true)
    await expect(clearAppBadge()).resolves.toBe(true)
    expect(setAppBadgeMock).toHaveBeenCalledWith(5)
    expect(clearAppBadgeMock).toHaveBeenCalledOnce()
  })
})
