import React from 'react';
import { Box } from '@mui/material';
import WeightTrend from '../components/WeightTrend';

const WEIGHT_HISTORY_ROUTE_MIN_HEIGHT = {
    xs: 'calc(100svh - 112px)',
    sm: 'calc(100svh - 128px)'
}; // Leaves room for the app bar and page gutters while letting the chart fill the remaining viewport.

/**
 * Dedicated weight-history route with a viewport-filling trend chart.
 */
const WeightHistory: React.FC = () => (
    <Box sx={{ minHeight: WEIGHT_HISTORY_ROUTE_MIN_HEIGHT, minWidth: 0, display: 'flex' }}>
        <WeightTrend fullScreen sx={{ flex: 1 }} />
    </Box>
);

export default WeightHistory;
