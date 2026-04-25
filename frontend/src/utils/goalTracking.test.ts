import { describe, expect, it } from 'vitest'

import {
  computeGoalProgress,
  computeGoalProjection,
  formatDailyCalorieChange,
  getGoalModeFromDailyDeficit,
  getMaintenanceTolerance,
  parseDateOnlyToLocalDate,
  roundWeight,
} from './goalTracking'

describe('goal tracking utilities', () => {
  it('parses date-only values as local calendar dates', () => {
    const parsed = parseDateOnlyToLocalDate('2026-04-24T00:00:00.000Z')

    expect(parsed?.getFullYear()).toBe(2026)
    expect(parsed?.getMonth()).toBe(3)
    expect(parsed?.getDate()).toBe(24)
    expect(parseDateOnlyToLocalDate('not-a-date')).toBeNull()
  })

  it('formats calorie deltas from the user perspective', () => {
    expect(formatDailyCalorieChange(500)).toBe('-500 kcal/day')
    expect(formatDailyCalorieChange(-250)).toBe('+250 kcal/day')
    expect(formatDailyCalorieChange(0)).toBe('0 kcal/day')
  })

  it('derives goal mode and maintenance tolerance from stored values', () => {
    expect(getGoalModeFromDailyDeficit(500)).toBe('lose')
    expect(getGoalModeFromDailyDeficit(-500)).toBe('gain')
    expect(getGoalModeFromDailyDeficit(0)).toBe('maintain')
    expect(getMaintenanceTolerance('lb')).toBe(1)
    expect(getMaintenanceTolerance('kg')).toBe(0.5)
  })

  it('rounds weight values to the storage/display precision', () => {
    expect(roundWeight(181.24)).toBe(181.2)
    expect(roundWeight(181.25)).toBe(181.3)
  })

  it('computes bounded progress and completion for loss and gain goals', () => {
    expect(computeGoalProgress({ startWeight: 200, targetWeight: 180, currentWeight: 190 })).toEqual({
      percent: 50,
      isComplete: false,
    })
    expect(computeGoalProgress({ startWeight: 200, targetWeight: 180, currentWeight: 179 })).toEqual({
      percent: 100,
      isComplete: true,
    })
    expect(computeGoalProgress({ startWeight: 150, targetWeight: 170, currentWeight: 165 })).toEqual({
      percent: 75,
      isComplete: false,
    })
  })

  it('projects a target date from the latest weigh-in when direction is valid', () => {
    const projection = computeGoalProjection({
      goalMode: 'lose',
      unitLabel: 'lb',
      startWeight: 200,
      targetWeight: 180,
      dailyDeficit: 500,
      goalCreatedAt: '2026-01-01T12:00:00.000Z',
      currentWeight: 190,
      currentWeightDate: '2026-01-10',
    })

    expect(projection.projectedDate?.getFullYear()).toBe(2026)
    expect(projection.projectedDate?.getMonth()).toBe(2)
    expect(projection.projectedDate?.getDate()).toBe(21)
    expect(projection.detail).toContain('-500 kcal/day')
    expect(projection.detail).toContain('latest weigh-in')
  })

  it('omits projections for maintenance or mismatched calorie direction', () => {
    const maintenance = computeGoalProjection({
      goalMode: 'maintain',
      unitLabel: 'lb',
      startWeight: 180,
      targetWeight: 180,
      dailyDeficit: 0,
      goalCreatedAt: '2026-01-01T12:00:00.000Z',
      currentWeight: 180,
      currentWeightDate: '2026-01-10',
    })
    const mismatched = computeGoalProjection({
      goalMode: 'lose',
      unitLabel: 'lb',
      startWeight: 180,
      targetWeight: 190,
      dailyDeficit: 500,
      goalCreatedAt: '2026-01-01T12:00:00.000Z',
      currentWeight: 180,
      currentWeightDate: '2026-01-10',
    })

    expect(maintenance.projectedDate).toBeNull()
    expect(maintenance.detail).toBe('No target date projection for maintenance goals.')
    expect(mismatched.projectedDate).toBeNull()
    expect(mismatched.detail).toContain('implies weight loss')
  })
})
