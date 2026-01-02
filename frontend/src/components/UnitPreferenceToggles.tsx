import React from 'react';
import { FormControl, FormLabel, Stack, ToggleButton, ToggleButtonGroup } from '@mui/material';
import type { HeightUnit, WeightUnit } from '../context/authContext';
import { useI18n } from '../i18n/useI18n';

type UnitPreferenceTogglesProps = {
    /** User-preferred weight unit used across the app (kg/lb). */
    weightUnit: WeightUnit;
    /** User-preferred height unit used across the app (cm or ft/in). */
    heightUnit: HeightUnit;
    /** Called when the user selects a new weight unit. */
    onWeightUnitChange: (next: WeightUnit) => void;
    /** Called when the user selects a new height unit. */
    onHeightUnitChange: (next: HeightUnit) => void;
    /** Disables the controls (useful while saving). */
    disabled?: boolean;
};

/**
 * UnitPreferenceToggles renders separate toggle controls for weight and height units.
 *
 * Treating them independently makes "mixed" combos possible (e.g. cm + lb) without needing a combined selector.
 */
const UnitPreferenceToggles: React.FC<UnitPreferenceTogglesProps> = ({
    weightUnit,
    heightUnit,
    onWeightUnitChange,
    onHeightUnitChange,
    disabled = false
}) => {
    const { t } = useI18n();

    return (
        <Stack spacing={2}>
            <FormControl component="fieldset" disabled={disabled}>
                <FormLabel component="legend">{t('units.weightUnits')}</FormLabel>
                <ToggleButtonGroup
                    value={weightUnit}
                    exclusive
                    onChange={(_, next: WeightUnit | null) => next && onWeightUnitChange(next)}
                    size="small"
                    color="primary"
                    disabled={disabled}
                    aria-label={t('units.weightUnits')}
                    sx={{ width: '100%' }}
                >
                    <ToggleButton value="KG" aria-label={t('units.kgAria')} sx={{ flex: 1 }}>
                        kg
                    </ToggleButton>
                    <ToggleButton value="LB" aria-label={t('units.lbAria')} sx={{ flex: 1 }}>
                        lb
                    </ToggleButton>
                </ToggleButtonGroup>
            </FormControl>

            <FormControl component="fieldset" disabled={disabled}>
                <FormLabel component="legend">{t('units.heightUnits')}</FormLabel>
                <ToggleButtonGroup
                    value={heightUnit}
                    exclusive
                    onChange={(_, next: HeightUnit | null) => next && onHeightUnitChange(next)}
                    size="small"
                    color="primary"
                    disabled={disabled}
                    aria-label={t('units.heightUnits')}
                    sx={{ width: '100%' }}
                >
                    <ToggleButton value="CM" aria-label={t('units.cmAria')} sx={{ flex: 1 }}>
                        cm
                    </ToggleButton>
                    <ToggleButton value="FT_IN" aria-label={t('units.ftInAria')} sx={{ flex: 1 }}>
                        ft / in
                    </ToggleButton>
                </ToggleButtonGroup>
            </FormControl>
        </Stack>
    );
};

export default UnitPreferenceToggles;
