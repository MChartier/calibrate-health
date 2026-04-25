import { describe, expect, it } from 'vitest'

import {
  addDaysToIsoDate,
  clampIsoDate,
  formatDateToLocalDateString,
  formatIsoDateForDisplay,
  getBirthdayEmojiForIsoDate,
  getHolidayEmojiForIsoDate,
} from './date'

describe('date utilities', () => {
  it('formats local dates using the supplied timezone at calendar boundaries', () => {
    const utcDate = new Date('2026-01-01T07:30:00.000Z')

    expect(formatDateToLocalDateString(utcDate, 'America/Los_Angeles')).toBe('2025-12-31')
    expect(formatDateToLocalDateString(utcDate, 'UTC')).toBe('2026-01-01')
  })

  it('adds ISO date offsets with UTC math across DST boundaries', () => {
    expect(addDaysToIsoDate('2026-03-08', 1)).toBe('2026-03-09')
    expect(addDaysToIsoDate('2026-03-08', -1)).toBe('2026-03-07')
  })

  it('clamps date-only strings inside inclusive bounds', () => {
    const bounds = { min: '2026-01-10', max: '2026-01-20' }

    expect(clampIsoDate('2026-01-01', bounds)).toBe('2026-01-10')
    expect(clampIsoDate('2026-01-15', bounds)).toBe('2026-01-15')
    expect(clampIsoDate('2026-01-30', bounds)).toBe('2026-01-20')
  })

  it('keeps invalid date display input unchanged', () => {
    expect(formatIsoDateForDisplay('not-a-date')).toBe('not-a-date')
  })

  it('recognizes fixed and computed holiday decorations', () => {
    expect(getHolidayEmojiForIsoDate('2026-12-25')).toBe('\u{1F384}')
    expect(getHolidayEmojiForIsoDate('2026-11-26')).toBe('\u{1F983}')
    expect(getHolidayEmojiForIsoDate('2026-11-27')).toBeNull()
  })

  it('handles leap-day birthdays on leap and non-leap years', () => {
    expect(getBirthdayEmojiForIsoDate('2028-02-29', '1992-02-29')).toBe('\u{1F382}')
    expect(getBirthdayEmojiForIsoDate('2027-02-28', '1992-02-29')).toBe('\u{1F382}')
    expect(getBirthdayEmojiForIsoDate('2027-03-01', '1992-02-29')).toBeNull()
  })
})
