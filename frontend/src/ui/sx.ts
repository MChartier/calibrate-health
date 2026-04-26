import type { SxProps, Theme } from '@mui/material/styles';

/**
 * Merge optional `sx` fragments while preserving MUI's array/function/object forms.
 */
export function mergeSx(...values: Array<SxProps<Theme> | false | null | undefined>): SxProps<Theme> {
    const merged: unknown[] = [];

    for (const value of values) {
        if (!value) continue;
        if (Array.isArray(value)) {
            merged.push(...value);
            continue;
        }
        merged.push(value);
    }

    return merged as SxProps<Theme>;
}
