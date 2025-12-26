import React, { useMemo, useState } from 'react';
import type { PaletteMode } from '@mui/material';
import { Box, FormControlLabel, Grid, Paper, Stack, Switch, Typography } from '@mui/material';
import DesignStylePreview from '../design/DesignStylePreview';
import { DESIGN_STYLE_LABELS, type DesignStyleId } from '../design/designThemes';

type StylePreview = {
    id: DesignStyleId;
    blurb: string;
};

/**
 * DesignLab
 *
 * A dev-only page that renders the same "mini app" content under multiple theme variants.
 * This makes it easier to pick a direction before we commit to re-theming the whole product.
 */
const DesignLab: React.FC = () => {
    const [mode, setMode] = useState<PaletteMode>('light');

    const previews = useMemo<StylePreview[]>(
        () => [
            {
                id: 'quiet-wellness',
                blurb: 'Warm, calm, premium health vibes. Soft surfaces and gentle contrast.'
            },
            {
                id: 'athletic-data',
                blurb: 'Crisp, instrument-panel UI. High clarity, tabular numbers, sharp states.'
            },
            {
                id: 'citrus-ink',
                blurb: 'Bold ink + citrus highlights. Energetic, modern, a bit more opinionated.'
            }
        ],
        []
    );

    return (
        <Box sx={{ maxWidth: 1360, mx: 'auto', px: { xs: 2, md: 3 }, py: { xs: 3, md: 4 } }}>
            <Stack spacing={1.5} sx={{ mb: 3 }}>
                <Typography variant="h4">Design Lab</Typography>
                <Typography variant="body1" color="text.secondary">
                    Compare three theme directions side-by-side. Each preview uses only MUI theming APIs (palette/typography/components),
                    so whichever we choose should stay resilient to MUI upgrades.
                </Typography>

                <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={mode === 'dark'}
                                onChange={(event) => setMode(event.target.checked ? 'dark' : 'light')}
                            />
                        }
                        label={mode === 'dark' ? 'Previewing dark mode' : 'Previewing light mode'}
                    />
                    <Typography variant="body2" color="text.secondary">
                        Route: <code>/design</code> (dev only)
                    </Typography>
                </Paper>
            </Stack>

            <Grid container spacing={2} alignItems="stretch">
                {previews.map((preview) => (
                    <Grid key={preview.id} size={{ xs: 12, md: 4 }} sx={{ display: 'flex' }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, width: '100%' }}>
                            <Box>
                                <Typography variant="h6">{DESIGN_STYLE_LABELS[preview.id]}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {preview.blurb}
                                </Typography>
                            </Box>
                            <DesignStylePreview style={preview.id} mode={mode} />
                        </Box>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
};

export default DesignLab;

