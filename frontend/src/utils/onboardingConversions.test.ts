import { describe, expect, it } from 'vitest'

import {
  convertCmToFeetInches,
  convertFeetInchesToCm,
  convertHeightCmStringToFeetInches,
  convertHeightFeetInchesStringsToCm,
  convertWeight,
  convertWeightInputString,
  formatNumber,
  formatWeeklyWeightChange,
  inferGoalModeFromWeights,
  parseFiniteNumber,
} from './onboardingConversions'

describe('onboarding conversion utilities', () => {
  it('parses and formats numeric input without erasing partial invalid input', () => {
    expect(parseFiniteNumber(' 170.5 ')).toBe(170.5)
    expect(parseFiniteNumber('')).toBeNull()
    expect(parseFiniteNumber('170 lb')).toBeNull()
    expect(formatNumber(170, 1)).toBe('170')
    expect(formatNumber(170.25, 2)).toBe('170.25')
  })

  it('converts height units with rounding that preserves valid feet and inches', () => {
    expect(convertCmToFeetInches(182.88)).toEqual({ feet: 6, inches: 0 })
    expect(convertFeetInchesToCm(5, 11)).toBe(180.3)
    expect(convertHeightCmStringToFeetInches('180.3')).toEqual({ feet: '5', inches: '11' })
    expect(convertHeightFeetInchesStringsToCm('5', '11')).toBe('180.3')
    expect(convertHeightFeetInchesStringsToCm('', '11')).toBe('')
  })

  it('converts weight units and keeps invalid input strings unchanged', () => {
    expect(convertWeight(100, 'KG', 'LB')).toBe(220.5)
    expect(convertWeight(220.5, 'LB', 'KG')).toBe(100)
    expect(convertWeightInputString('100', 'KG', 'LB')).toBe('220.5')
    expect(convertWeightInputString('100 lb', 'LB', 'KG')).toBe('100 lb')
  })

  it('formats weekly weight change using the calorie model constants', () => {
    expect(formatWeeklyWeightChange({ goalMode: 'lose', dailyCaloriesAbs: 500, weightUnit: 'LB' })).toBe(
      'About 1 lb/week'
    )
    expect(formatWeeklyWeightChange({ goalMode: 'gain', dailyCaloriesAbs: 770, weightUnit: 'KG' })).toBe(
      'About +0.7 kg/week'
    )
  })

  it('infers goal mode from rounded weight values', () => {
    expect(inferGoalModeFromWeights(180, 170)).toBe('lose')
    expect(inferGoalModeFromWeights(170, 180)).toBe('gain')
    expect(inferGoalModeFromWeights(170.04, 170.03)).toBe('maintain')
    expect(inferGoalModeFromWeights(null, 170)).toBeNull()
    expect(inferGoalModeFromWeights(0, 170)).toBeNull()
  })
})
