import { describe, expect, it } from 'vitest'

import { formatServingSnapshotLabel, pluralizeUnitLabel } from './servingDisplay'

describe('serving display utilities', () => {
  it('pluralizes free-form serving units without changing known measurements', () => {
    expect(pluralizeUnitLabel('slice', 2)).toBe('slices')
    expect(pluralizeUnitLabel('berry', 2)).toBe('berries')
    expect(pluralizeUnitLabel('bus', 2)).toBe('buses')
    expect(pluralizeUnitLabel('oz', 2)).toBe('oz')
    expect(pluralizeUnitLabel('per 100g', 2)).toBe('per 100g')
    expect(pluralizeUnitLabel('slice', 1)).toBe('slice')
  })

  it('formats serving snapshots with serving-size multipliers when present', () => {
    expect(formatServingSnapshotLabel({ servingsConsumed: 2, servingUnitLabel: 'slice' })).toBe('2 slices')
    expect(
      formatServingSnapshotLabel({
        servingsConsumed: 1.5,
        servingSizeQuantity: 30,
        servingUnitLabel: 'g',
      })
    ).toBe('1.5 x 30 g')
  })

  it('returns null when required serving snapshot fields are missing or invalid', () => {
    expect(formatServingSnapshotLabel({ servingsConsumed: null, servingUnitLabel: 'slice' })).toBeNull()
    expect(formatServingSnapshotLabel({ servingsConsumed: 0, servingUnitLabel: 'slice' })).toBeNull()
    expect(formatServingSnapshotLabel({ servingsConsumed: 1, servingUnitLabel: '' })).toBeNull()
  })
})
