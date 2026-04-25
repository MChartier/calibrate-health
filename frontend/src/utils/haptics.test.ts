import { afterEach, describe, expect, it, vi } from 'vitest'

import { haptic, setHapticsEnabled, supportsHaptics } from './haptics'

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

describe('haptics utilities', () => {
  afterEach(() => {
    setHapticsEnabled(true)
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    })
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    })
  })

  it('reports haptic support from the Vibration API', () => {
    setNavigator({ vibrate: vi.fn() } as Partial<Navigator>)

    expect(supportsHaptics()).toBe(true)
  })

  it('does not vibrate when disabled or reduced motion is requested', () => {
    const vibrate = vi.fn()
    setNavigator({ vibrate } as Partial<Navigator>)
    setWindow({
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    } as Partial<Window>)

    haptic.tap()
    expect(vibrate).not.toHaveBeenCalled()

    setWindow({
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    } as Partial<Window>)
    setHapticsEnabled(false)
    haptic.success()
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('sends the intended vibration patterns when allowed', () => {
    const vibrate = vi.fn()
    setNavigator({ vibrate } as Partial<Navigator>)
    setWindow({
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    } as Partial<Window>)

    haptic.tap()
    haptic.warning()

    expect(vibrate).toHaveBeenNthCalledWith(1, 10)
    expect(vibrate).toHaveBeenNthCalledWith(2, [20, 40, 20])
  })
})
