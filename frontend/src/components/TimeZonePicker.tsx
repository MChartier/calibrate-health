import React, { useMemo, useState } from 'react';
import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import { createFilterOptions } from '@mui/material/Autocomplete';
import {
    buildTimeZoneOptions,
    formatTimeZoneLabel,
    formatTimeInZone,
    formatUtcOffset,
    getTimeZoneOffsetMinutes,
    type TimeZoneOption
} from '../utils/timezones';

type Props = {
    value: string;
    onChange: (timeZone: string) => void;
    label?: string;
    helperText?: string;
    disabled?: boolean;
};

const filterOptions = createFilterOptions<TimeZoneOption>({
    stringify: (option) => option.searchText
});

/**
 * TimeZonePicker
 *
 * User-facing timezone selection with:
 * - friendly labels
 * - UTC offset
 * - current time in the zone (so users can sanity-check their choice)
 */
const TimeZonePicker: React.FC<Props> = ({ value, onChange, label = 'Timezone', helperText, disabled }) => {
    const options = useMemo(() => {
        const built = buildTimeZoneOptions();
        if (!built.some((option) => option.value === value) && value.trim().length > 0) {
            const labelValue = formatTimeZoneLabel(value);
            built.unshift({ value, label: labelValue, searchText: `${labelValue} ${value}`.toLowerCase() });
        }
        return built;
    }, [value]);
    const [now, setNow] = useState<Date>(() => new Date());

    const selectedOption =
        options.find((option) => option.value === value) ??
        options.find((option) => option.value === 'UTC') ??
        options[0] ??
        null;

    return (
        <Autocomplete
            value={selectedOption}
            options={options}
            disabled={disabled}
            disableClearable
            onOpen={() => setNow(new Date())}
            onChange={(_, next) => {
                if (!next) return;
                onChange(next.value);
            }}
            getOptionLabel={(option) => option.label}
            isOptionEqualToValue={(option, candidate) => option.value === candidate.value}
            filterOptions={(candidateOptions, state) => {
                const filtered = filterOptions(candidateOptions, state);
                // Keep the listbox snappy; users can always type more to refine.
                return filtered.slice(0, 250);
            }}
            renderOption={(props, option) => {
                let offsetLabel = 'UTC±??:??';
                let timeLabel = '';
                try {
                    const offsetMinutes = getTimeZoneOffsetMinutes(option.value, now);
                    offsetLabel = formatUtcOffset(offsetMinutes);
                    timeLabel = formatTimeInZone(option.value, now);
                } catch {
                    offsetLabel = 'UTC';
                    timeLabel = '';
                }

                return (
                    <Box component="li" {...props} key={option.value} sx={{ alignItems: 'flex-start', py: 1 }}>
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {option.label}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                {offsetLabel}
                                {timeLabel ? ` · ${timeLabel}` : ''} · {option.value}
                            </Typography>
                        </Box>
                    </Box>
                );
            }}
            renderInput={(params) => (
                <TextField
                    {...params}
                    label={label}
                    helperText={helperText}
                    fullWidth
                />
            )}
        />
    );
};

export default TimeZonePicker;
