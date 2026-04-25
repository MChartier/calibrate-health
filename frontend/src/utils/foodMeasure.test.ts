import { describe, expect, it } from 'vitest'

import type { NormalizedFoodItem } from '../types/food'
import {
  formatMeasureLabelForDisplay,
  formatMeasureLabelWithQuantity,
  getMeasureCalories,
  getPreferredMeasure,
  getPreferredMeasureLabel,
} from './foodMeasure'

const baseItem: NormalizedFoodItem = {
  id: 'food-1',
  source: 'usda',
  description: 'Test food',
  availableMeasures: [
    { label: 'per 100g', gramWeight: 100 },
    { label: '1 cup', gramWeight: 240 },
  ],
  nutrientsPer100g: {
    calories: 50,
  },
}

describe('food measure utilities', () => {
  it('prefers practical measures over provider per-100g defaults', () => {
    expect(getPreferredMeasure(baseItem)).toEqual({ label: '1 cup', gramWeight: 240 })
    expect(getPreferredMeasureLabel(baseItem)).toBe('1 cup')
  })

  it('returns null when no weighted measures are available', () => {
    expect(getPreferredMeasure({ ...baseItem, availableMeasures: [{ label: 'serving' }] })).toBeNull()
  })

  it('normalizes measure labels and quantities for display', () => {
    expect(formatMeasureLabelForDisplay(' per serving ')).toBe('serving')
    expect(formatMeasureLabelWithQuantity('serving', 1)).toBe('1 serving')
    expect(formatMeasureLabelWithQuantity('1 cup', 1)).toBe('1 cup')
    expect(formatMeasureLabelWithQuantity('1 cup', 2)).toBe('2 x 1 cup')
    expect(formatMeasureLabelWithQuantity('serving', 0)).toBe('serving')
  })

  it('scales per-100g calories into the selected measure and quantity', () => {
    expect(getMeasureCalories(baseItem, { label: '1 cup', gramWeight: 240 }, 1.5)).toEqual({
      grams: 360,
      calories: 180,
    })
  })

  it('returns null when measure calories cannot be computed', () => {
    expect(getMeasureCalories({ ...baseItem, nutrientsPer100g: undefined }, { label: '1 cup', gramWeight: 240 })).toBeNull()
    expect(getMeasureCalories(baseItem, { label: '1 cup' })).toBeNull()
    expect(getMeasureCalories(baseItem, { label: '1 cup', gramWeight: 240 }, 0)).toBeNull()
  })
})
