import React from 'react';
import { Box, Button, Paper, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';

export type OnboardingSummaryRowProps = {
    label: string;
    value: string;
    onEdit?: () => void;
    /** When true, briefly emphasize this row (used for "just confirmed" answers). */
    highlight?: boolean;
};

const SUMMARY_ROW_PADDING_X = 2; // Horizontal padding for each completed-answer row.
const SUMMARY_ROW_PADDING_Y = 1; // Vertical padding for each completed-answer row.
const SUMMARY_ROW_LABEL_LETTER_SPACING = 0.4; // Keeps labels readable without feeling shouty.
const SUMMARY_ROW_BORDER_RADIUS_PX = 4; // Standard-ish MUI radius so these read as rows, not chips/pills.

/**
 * OnboardingSummaryRow renders a compact, readable "completed answer" line item.
 *
 * This is used by the guided onboarding flow: answers are confirmed in the footer, then
 * shown here as static text so users can scan what they've entered so far.
 */
const OnboardingSummaryRow: React.FC<OnboardingSummaryRowProps> = ({ label, value, onEdit, highlight = false }) => {
    return (
        <Paper
            variant="outlined"
            sx={(theme) => ({
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 2,
                px: SUMMARY_ROW_PADDING_X,
                py: SUMMARY_ROW_PADDING_Y,
                borderRadius: SUMMARY_ROW_BORDER_RADIUS_PX,
                borderColor: highlight ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.55 : 0.35) : theme.palette.divider,
                backgroundColor: highlight ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.16 : 0.08) : undefined,
                transition: theme.transitions.create(['background-color', 'border-color'], {
                    duration: theme.transitions.duration.short
                })
            })}
        >
            <Box sx={{ minWidth: 0 }}>
                <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontWeight: 700, letterSpacing: SUMMARY_ROW_LABEL_LETTER_SPACING, textTransform: 'uppercase' }}
                >
                    {label}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>
                    {value}
                </Typography>
            </Box>

            {onEdit && (
                <Button variant="text" size="small" onClick={onEdit} sx={{ flexShrink: 0 }}>
                    Edit
                </Button>
            )}
        </Paper>
    );
};

export default OnboardingSummaryRow;
