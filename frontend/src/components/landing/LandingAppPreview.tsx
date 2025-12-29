import React from 'react';
import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import { alpha, type Theme } from '@mui/material/styles';
import { Gauge } from '@mui/x-charts/Gauge';
import SectionHeader from '../../ui/SectionHeader';

const GAUGE_WIDTH_PX = 200; // Matches the in-app log summary gauge for a familiar silhouette.
const GAUGE_HEIGHT_PX = 140; // Matches the in-app log summary gauge for a familiar silhouette.
const GAUGE_START_ANGLE = -90;
const GAUGE_END_ANGLE = 90;
const GAUGE_INNER_RADIUS = '70%';
const GAUGE_OUTER_RADIUS = '90%';

type ModeAlpha = { light: number; dark: number };

const GOAL_PROGRESS_TRACK_ALPHA: ModeAlpha = { light: 0.08, dark: 0.14 }; // Mirrors GoalTrackerCard track styling.

/**
 * Resolve a mode-specific alpha value so translucent surfaces stay consistent in light/dark mode.
 */
function resolveModeAlpha(theme: Theme, alphaByMode: ModeAlpha): number {
    return theme.palette.mode === 'dark' ? alphaByMode.dark : alphaByMode.light;
}

/**
 * LandingMockLogSummaryCard
 *
 * Static (no-auth) preview of the in-app log summary card, used on the marketing landing page.
 */
function LandingMockLogSummaryCard() {
    const totalCalories = 1420;
    const dailyTarget = 1900;
    const remaining = dailyTarget - totalCalories;

    return (
        <Card sx={{ width: '100%' }}>
            <CardContent>
                <Typography variant="h6" gutterBottom>
                    Today&apos;s Log
                </Typography>

                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        flexDirection: { xs: 'column', sm: 'row' }
                    }}
                >
                    <Gauge
                        width={GAUGE_WIDTH_PX}
                        height={GAUGE_HEIGHT_PX}
                        startAngle={GAUGE_START_ANGLE}
                        endAngle={GAUGE_END_ANGLE}
                        value={totalCalories}
                        valueMin={0}
                        valueMax={dailyTarget}
                        innerRadius={GAUGE_INNER_RADIUS}
                        outerRadius={GAUGE_OUTER_RADIUS}
                        text={() => ''}
                        sx={{
                            '& .MuiGauge-referenceArc': {
                                fill: (theme) => theme.palette.grey[300]
                            },
                            '& .MuiGauge-valueArc': {
                                fill: (theme) => theme.palette.primary.main
                            }
                        }}
                    />

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
                        <Typography variant="subtitle1">Calories remaining</Typography>
                        <Typography variant="h5">{remaining.toLocaleString()} Calories</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Logged: {totalCalories.toLocaleString()} Calories of {dailyTarget.toLocaleString()} Calories target
                        </Typography>
                        <Typography variant="body2" color="primary">
                            View / edit today&apos;s log
                        </Typography>
                    </Box>
                </Box>
            </CardContent>
        </Card>
    );
}

/**
 * LandingMockGoalTrackerCard
 *
 * Static (no-auth) preview of the in-app goal tracker card, used on the marketing landing page.
 */
function LandingMockGoalTrackerCard() {
    const startWeight = 192.0;
    const targetWeight = 170.0;
    const currentWeight = 176.4;
    const progressPercent = 71;

    return (
        <Card sx={{ width: '100%' }}>
            <CardContent>
                <SectionHeader title="Goal tracker" sx={{ mb: 1.5 }} />

                <Box>
                    <Stack spacing={0.5} sx={{ mb: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                            Started: Aug 12, 2025
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Projected target date: Oct 18, 2025
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            Projection uses your selected deficit and a steady-rate model.
                        </Typography>
                    </Stack>

                    <Typography variant="body2" color="text.secondary">
                        Start: {startWeight.toFixed(1)} lb · Target: {targetWeight.toFixed(1)} lb
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 0.5 }}>
                        Current: {currentWeight.toFixed(1)} lb
                    </Typography>

                    <Box sx={{ mt: 1.5 }}>
                        <Box sx={{ position: 'relative' }}>
                            <Box
                                sx={{
                                    position: 'absolute',
                                    left: `${progressPercent}%`,
                                    top: -6,
                                    transform: 'translateX(-50%)'
                                }}
                            >
                                <Box
                                    sx={{
                                        width: 14,
                                        height: 14,
                                        borderRadius: '50%',
                                        backgroundColor: 'background.paper',
                                        border: (theme) => `2px solid ${theme.palette.primary.main}`
                                    }}
                                    aria-label="Current progress marker"
                                />
                            </Box>
                            <Box
                                sx={{
                                    height: 10,
                                    borderRadius: 999,
                                    backgroundColor: (theme) =>
                                        alpha(theme.palette.text.primary, resolveModeAlpha(theme, GOAL_PROGRESS_TRACK_ALPHA)),
                                    overflow: 'hidden'
                                }}
                            >
                                <Box
                                    sx={{
                                        height: '100%',
                                        width: `${progressPercent}%`,
                                        backgroundColor: 'primary.main'
                                    }}
                                />
                            </Box>
                        </Box>

                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                            {progressPercent}% toward goal
                        </Typography>
                    </Box>

                    <Typography variant="body2" color="primary" sx={{ mt: 1.25 }}>
                        View goals and details
                    </Typography>
                </Box>
            </CardContent>
        </Card>
    );
}

/**
 * LandingAppPreview
 *
 * Compact stack of mocked-out, authentic-looking cards that represent the in-app experience.
 */
const LandingAppPreview: React.FC = () => {
    return (
        <Stack spacing={2} sx={{ width: '100%' }}>
            <LandingMockLogSummaryCard />
            <LandingMockGoalTrackerCard />
        </Stack>
    );
};

export default LandingAppPreview;
