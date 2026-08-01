/**
 * Cross-platform visual identity for Calibrate.
 *
 * Platform layers translate these semantic roles into MUI or React Native
 * component themes. Keeping raw component styling out of this module lets the
 * web and native apps share a brand without forcing identical layouts.
 */
export const calibrateDesignTokens = {
    brand: {
        ink: '#1F2937',
        green: '#2E7D32',
        greenDark: '#1B5E20',
        amber: '#F59E0B'
    },
    schemes: {
        light: {
            background: '#F6F8F4',
            surface: '#FFFFFF',
            surfaceContainerLow: '#F9FBF7',
            surfaceContainer: '#EEF3EA',
            surfaceContainerHigh: '#E5ECE1',
            surfacePressed: '#DCE7D7',
            onBackground: '#182019',
            onSurface: '#1F2937',
            onSurfaceVariant: '#526057',
            outline: '#7D8B7D',
            outlineVariant: '#CDD7C9',
            primary: '#2E7D32',
            onPrimary: '#FFFFFF',
            primaryContainer: '#D8EFD6',
            onPrimaryContainer: '#17491B',
            info: '#2457A7',
            onInfo: '#FFFFFF',
            infoContainer: '#E5EEFF',
            onInfoContainer: '#123B75',
            success: '#2E7D32',
            onSuccess: '#FFFFFF',
            successContainer: '#D8EFD6',
            onSuccessContainer: '#17491B',
            warning: '#B45309',
            onWarning: '#FFFFFF',
            warningAccent: '#F59E0B',
            warningContainer: '#FFF1D6',
            onWarningContainer: '#713A00',
            danger: '#BA1A1A',
            onDanger: '#FFFFFF',
            dangerContainer: '#FFDAD6',
            onDangerContainer: '#93000A',
            scrim: 'rgba(11, 18, 12, 0.48)',
            ripple: 'rgba(46, 125, 50, 0.16)'
        },
        dark: {
            background: '#0E1510',
            surface: '#151D17',
            surfaceContainerLow: '#18211A',
            surfaceContainer: '#1D2820',
            surfaceContainerHigh: '#27342A',
            surfacePressed: '#344538',
            onBackground: '#E3EAE1',
            onSurface: '#E3EAE1',
            onSurfaceVariant: '#BCCABC',
            outline: '#899789',
            outlineVariant: '#3D4A3E',
            primary: '#8DD990',
            onPrimary: '#00390A',
            primaryContainer: '#14521C',
            onPrimaryContainer: '#A8F5A8',
            info: '#ADC7FF',
            onInfo: '#002E69',
            infoContainer: '#173F75',
            onInfoContainer: '#D8E2FF',
            success: '#8DD990',
            onSuccess: '#00390A',
            successContainer: '#14521C',
            onSuccessContainer: '#A8F5A8',
            warning: '#FFB95C',
            onWarning: '#432B00',
            warningAccent: '#FFB95C',
            warningContainer: '#633F00',
            onWarningContainer: '#FFDEA6',
            danger: '#FF5F56',
            onDanger: '#210101',
            dangerContainer: '#5C1717',
            onDangerContainer: '#FFE2DE',
            scrim: 'rgba(0, 0, 0, 0.64)',
            ripple: 'rgba(141, 217, 144, 0.20)'
        }
    },
    shape: {
        small: 8,
        medium: 12,
        large: 16,
        extraLarge: 24,
        sheet: 28,
        pill: 999
    },
    spacing: {
        extraSmall: 4,
        small: 8,
        medium: 12,
        large: 16,
        extraLarge: 24,
        jumbo: 32
    },
    interaction: {
        minimumTouchTarget: 48
    },
    motion: {
        quick: 120,
        standard: 220
    }
} as const;

export type CalibrateColorScheme = keyof typeof calibrateDesignTokens.schemes;
export type CalibrateSemanticColors = typeof calibrateDesignTokens.schemes.light | typeof calibrateDesignTokens.schemes.dark;
