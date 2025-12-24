import React, { useEffect, useMemo, useState } from 'react';
import { Box, FormHelperText, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import TimezoneSelect, { type ITimezoneOption } from 'react-timezone-select';

type Props = {
    /** Current IANA timezone identifier (e.g. "America/Los_Angeles"). */
    value: string;
    /** Called with the selected IANA timezone identifier. */
    onChange: (timeZone: string) => void;
    label?: string;
    helperText?: string;
    disabled?: boolean;
};

/**
 * TimeZonePicker
 *
 * Uses `react-timezone-select` to avoid maintaining our own timezone list/labels.
 * Shows the current time for the selected zone so users can sanity-check the choice.
 */
const TimeZonePicker: React.FC<Props> = ({ value, onChange, label = 'Timezone', helperText, disabled }) => {
    const theme = useTheme();
    const [now, setNow] = useState<Date>(() => new Date());

    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(interval);
    }, []);

    const currentTimeLabel = useMemo(() => {
        const trimmed = value.trim();
        if (!trimmed) return null;

        try {
            return new Intl.DateTimeFormat(undefined, {
                timeZone: trimmed,
                hour: '2-digit',
                minute: '2-digit'
            }).format(now);
        } catch {
            return null;
        }
    }, [now, value]);

    const helperLine = useMemo(() => {
        const parts = [];
        if (helperText) parts.push(helperText);
        if (currentTimeLabel) parts.push(`Current time there: ${currentTimeLabel}`);
        return parts.join(' ');
    }, [currentTimeLabel, helperText]);

    return (
        <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                {label}
            </Typography>

            <TimezoneSelect
                value={value}
                onChange={(option: ITimezoneOption) => onChange(option.value)}
                displayValue="UTC"
                labelStyle="original"
                isDisabled={disabled}
                styles={{
                    container: (base) => ({ ...base, width: '100%' }),
                    control: (base, state) => ({
                        ...base,
                        minHeight: 56,
                        backgroundColor: theme.palette.background.paper,
                        borderColor: state.isFocused ? theme.palette.primary.main : theme.palette.divider,
                        boxShadow: state.isFocused ? `0 0 0 2px ${alpha(theme.palette.primary.main, 0.2)}` : 'none',
                        ':hover': {
                            borderColor: state.isFocused ? theme.palette.primary.main : theme.palette.text.primary
                        }
                    }),
                    menu: (base) => ({ ...base, zIndex: 1300 }),
                    option: (base, state) => ({
                        ...base,
                        color: theme.palette.text.primary,
                        backgroundColor: state.isSelected
                            ? theme.palette.action.selected
                            : state.isFocused
                                ? theme.palette.action.hover
                                : base.backgroundColor
                    }),
                    singleValue: (base) => ({ ...base, color: theme.palette.text.primary }),
                    placeholder: (base) => ({ ...base, color: theme.palette.text.secondary }),
                    input: (base) => ({ ...base, color: theme.palette.text.primary })
                }}
            />

            {helperLine && <FormHelperText sx={{ mt: 0.75 }}>{helperLine}</FormHelperText>}
        </Box>
    );
};

export default TimeZonePicker;
