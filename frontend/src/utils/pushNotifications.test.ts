import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveServiceWorkerRegistration, urlBase64ToUint8Array } from './pushNotifications'

const originalNavigator = globalThis.navigator
const originalWindow = globalThis.window

function setNavigator(value: Partial<Navigator>): void {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value,
  })
}

function setWindow(value: Partial<Window>): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value,
  })
}

describe('push notification utilities', () => {
  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    })
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    })
    vi.useRealTimers()
  })

  it('converts URL-safe base64 VAPID keys into bytes', () => {
    setWindow({ atob: (value: string) => Buffer.from(value, 'base64').toString('binary') } as Partial<Window>)

    expect(Array.from(urlBase64ToUint8Array('AQID-_-_'))).toEqual([1, 2, 3, 251, 255, 191])
  })

  it('returns null when service workers are unavailable', async () => {
    setNavigator({} as Partial<Navigator>)

    await expect(resolveServiceWorkerRegistration(1)).resolves.toBeNull()
  })

  it('uses the ready registration when it resolves before timeout', async () => {
    const registration = { active: {} } as ServiceWorkerRegistration
    setWindow({ setTimeout: globalThis.setTimeout } as Partial<Window>)
    setNavigator({
      serviceWorker: {
        ready: Promise.resolve(registration),
      },
    } as Partial<Navigator>)

    await expect(resolveServiceWorkerRegistration(10)).resolves.toBe(registration)
  })

  it('falls back to the best available registration after ready times out', async () => {
    vi.useFakeTimers()
    const waitingRegistration = { waiting: {} } as ServiceWorkerRegistration
    const installingRegistration = { installing: {} } as ServiceWorkerRegistration
    setWindow({ setTimeout: globalThis.setTimeout } as Partial<Window>)
    setNavigator({
      serviceWorker: {
        ready: new Promise(() => undefined),
        getRegistration: vi.fn().mockResolvedValue(null),
        getRegistrations: vi.fn().mockResolvedValue([installingRegistration, waitingRegistration]),
      },
    } as Partial<Navigator>)

    const resultPromise = resolveServiceWorkerRegistration(10)
    await vi.advanceTimersByTimeAsync(10)

    await expect(resultPromise).resolves.toBe(waitingRegistration)
  })
})
