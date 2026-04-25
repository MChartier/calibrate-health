import { describe, expect, it } from 'vitest'

import { getAvatarLabel } from './avatarLabel'

describe('avatar label utilities', () => {
  it('uses the uppercased first non-space email character', () => {
    expect(getAvatarLabel('  test@example.com')).toBe('T')
  })

  it('falls back when no email is available', () => {
    expect(getAvatarLabel()).toBe('?')
    expect(getAvatarLabel('   ')).toBe('?')
  })
})
