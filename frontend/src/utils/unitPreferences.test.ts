import { describe, expect, it } from 'vitest'

import { getDefaultHeightUnitForWeightUnit, getDefaultUnitPreferencesForLocale } from './unitPreferences'

describe('unit preference utilities', () => {
  it('defaults imperial units for locales in imperial-leaning regions', () => {
    expect(getDefaultUnitPreferencesForLocale('en-US')).toEqual({ weightUnit: 'LB', heightUnit: 'FT_IN' })
    expect(getDefaultUnitPreferencesForLocale('en_LR')).toEqual({ weightUnit: 'LB', heightUnit: 'FT_IN' })
  })

  it('defaults metric units for other locales or missing locale data', () => {
    expect(getDefaultUnitPreferencesForLocale('fr-FR')).toEqual({ weightUnit: 'KG', heightUnit: 'CM' })
    expect(getDefaultUnitPreferencesForLocale(null)).toEqual({ weightUnit: 'KG', heightUnit: 'CM' })
  })

  it('infers a matching default height unit from weight unit', () => {
    expect(getDefaultHeightUnitForWeightUnit('LB')).toBe('FT_IN')
    expect(getDefaultHeightUnitForWeightUnit('KG')).toBe('CM')
  })
})
