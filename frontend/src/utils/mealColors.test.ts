import { createTheme } from '@mui/material/styles'
import { describe, expect, it } from 'vitest'

import { getMealPeriodAccentColor } from './mealColors'

describe('meal color utilities', () => {
  it('maps meal periods to deterministic theme-derived accent colors', () => {
    const theme = createTheme({
      palette: {
        mode: 'light',
        primary: { main: '#336699' },
        secondary: { main: '#cc5500' },
      },
    })

    const breakfast = getMealPeriodAccentColor(theme, 'BREAKFAST')
    const lunch = getMealPeriodAccentColor(theme, 'LUNCH')
    const dinner = getMealPeriodAccentColor(theme, 'DINNER')
    const morningSnack = getMealPeriodAccentColor(theme, 'MORNING_SNACK')
    const afternoonSnack = getMealPeriodAccentColor(theme, 'AFTERNOON_SNACK')
    const eveningSnack = getMealPeriodAccentColor(theme, 'EVENING_SNACK')

    expect(new Set([breakfast, lunch, dinner]).size).toBe(3)
    expect(new Set([morningSnack, afternoonSnack, eveningSnack]).size).toBe(3)
    expect(lunch).toBe(theme.palette.primary.main)
    expect(afternoonSnack).toBe(theme.palette.secondary.main)
  })

  it('falls back to primary for unknown meal period values', () => {
    const theme = createTheme({
      palette: {
        primary: { main: '#336699' },
      },
    })

    expect(getMealPeriodAccentColor(theme, 'UNKNOWN' as never)).toBe(theme.palette.primary.main)
  })
})
