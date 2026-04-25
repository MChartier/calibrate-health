import { describe, expect, it } from 'vitest'

import { validateGoalWeights } from './goalValidation'

describe('goal validation utilities', () => {
  it('rejects invalid or non-positive weights before direction checks', () => {
    expect(validateGoalWeights({ goalMode: 'lose', startWeight: Number.NaN, targetWeight: 170 })).toBe(
      'Start weight must be a positive number.'
    )
    expect(validateGoalWeights({ goalMode: 'lose', startWeight: 180, targetWeight: 0 })).toBe(
      'Target weight must be a positive number.'
    )
  })

  it('enforces loss and gain direction after storage-precision rounding', () => {
    expect(validateGoalWeights({ goalMode: 'lose', startWeight: 180.04, targetWeight: 180.03 })).toBe(
      'For a weight loss goal, target weight must be less than your start weight.'
    )
    expect(validateGoalWeights({ goalMode: 'gain', startWeight: 180, targetWeight: 179 })).toBe(
      'For a weight gain goal, target weight must be greater than your start weight.'
    )
  })

  it('allows coherent loss, gain, and maintenance goals', () => {
    expect(validateGoalWeights({ goalMode: 'lose', startWeight: 180, targetWeight: 170 })).toBeNull()
    expect(validateGoalWeights({ goalMode: 'gain', startWeight: 170, targetWeight: 180 })).toBeNull()
    expect(validateGoalWeights({ goalMode: 'maintain', startWeight: 180, targetWeight: 180 })).toBeNull()
  })
})
