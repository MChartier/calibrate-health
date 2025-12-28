import React, { useEffect, useMemo, useState } from 'react';
import { Autocomplete, TextField } from '@mui/material';
import { useTimezoneSelect, type ITimezoneOption } from 'react-timezone-select';

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
 * Format the current time in the supplied time zone. Returns null when the time zone is missing/invalid.
 */
function getCurrentTimeLabel(timeZone: string, now: Date): string | null {
    const trimmed = timeZone.trim();
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
}

/**
 * Concatenate a user-provided helper message with a "current time there" suffix.
 */
function buildHelperLine(helperText: string | undefined, currentTimeLabel: string | null): string | undefined {
    const parts = [];
    if (helperText) parts.push(helperText);
    if (currentTimeLabel) parts.push(`Current time there: ${currentTimeLabel}`);
    return parts.length > 0 ? parts.join(' ') : undefined;
}

/**
 * TimeZonePicker
 *
 * Uses `react-timezone-select` for a sane timezone list + labels, but renders with MUI so it
 * looks/behaves like the rest of our form controls (portal dropdown, consistent theming).
 */
const TimeZonePicker: React.FC<Props> = ({ value, onChange, label = 'Timezone', helperText, disabled }) => {
    const [now, setNow] = useState<Date>(() => new Date());
    const { options } = useTimezoneSelect({ labelStyle: 'original', displayValue: 'UTC' });

    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(interval);
    }, []);

    const currentTimeLabel = useMemo(() => getCurrentTimeLabel(value, now), [now, value]);
    const helperLine = useMemo(() => buildHelperLine(helperText, currentTimeLabel), [currentTimeLabel, helperText]);

    const selectedOption = useMemo<ITimezoneOption | undefined>(() => {
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        return options.find((option) => option.value === trimmed) ?? { value: trimmed, label: trimmed };
    }, [options, value]);

    return (
        <Autocomplete
            options={options}
            value={selectedOption}
            onChange={(_, next) => {
                if (next) onChange(next.value);
            }}
            getOptionLabel={(option) => option.label}
            isOptionEqualToValue={(option, selected) => option.value === selected.value}
            disableClearable
            disabled={disabled}
            fullWidth
            disablePortal={false}
            sx={{
                // Match MUI <Select /> cursor affordance on desktop (avoid I-beam text cursor).
                '& .MuiInputBase-root': { cursor: 'pointer' },
                '& .MuiInputBase-root input': { cursor: 'pointer' },
                '& .MuiAutocomplete-endAdornment': { cursor: 'pointer' }
            }}
            renderInput={(params) => <TextField {...params} label={label} helperText={helperLine} />}
        />
    );
};

export default TimeZonePicker;
