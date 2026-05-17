import React, { useMemo } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { colors, radius, spacing } from '../theme';
import { AppText } from './AppText';

type WeightTrendPoint = {
    date: string;
    weight: number;
};

type WeightTrendMiniProps = ViewProps & {
    points: WeightTrendPoint[];
};

const CHART_WIDTH = 320;
const CHART_HEIGHT = 92;
const CHART_PADDING = 12;

/**
 * Lightweight native SVG trend preview for recent weigh-ins.
 */
export const WeightTrendMini: React.FC<WeightTrendMiniProps> = ({ points, style, ...props }) => {
    const chart = useMemo(() => {
        const chronologicalPoints = points
            .slice(0, 14)
            .filter((point) => Number.isFinite(point.weight))
            .reverse();

        if (chronologicalPoints.length === 0) {
            return null;
        }

        const weights = chronologicalPoints.map((point) => point.weight);
        const minWeight = Math.min(...weights);
        const maxWeight = Math.max(...weights);
        const range = maxWeight - minWeight || 1;
        const drawableWidth = CHART_WIDTH - CHART_PADDING * 2;
        const drawableHeight = CHART_HEIGHT - CHART_PADDING * 2;
        const lastIndex = Math.max(chronologicalPoints.length - 1, 1);
        const coordinates = chronologicalPoints.map((point, index) => {
            const x = CHART_PADDING + (drawableWidth * index) / lastIndex;
            const y = CHART_PADDING + drawableHeight - ((point.weight - minWeight) / range) * drawableHeight;
            return { x, y };
        });
        const path = coordinates
            .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
            .join(' ');

        return {
            coordinates,
            path
        };
    }, [points]);

    if (!chart) {
        return (
            <View {...props} style={[styles.empty, style]}>
                <AppText variant="muted">Log a weigh-in to start a trend.</AppText>
            </View>
        );
    }

    const lastPoint = chart.coordinates[chart.coordinates.length - 1];

    return (
        <View {...props} style={[styles.root, style]}>
            <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
                <Line
                    x1={CHART_PADDING}
                    y1={CHART_HEIGHT - CHART_PADDING}
                    x2={CHART_WIDTH - CHART_PADDING}
                    y2={CHART_HEIGHT - CHART_PADDING}
                    stroke={colors.border}
                    strokeWidth={1}
                />
                {chart.coordinates.length > 1 && (
                    <Path d={chart.path} stroke={colors.primary} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                )}
                <Circle cx={lastPoint.x} cy={lastPoint.y} r={5} fill={colors.primaryDark} />
            </Svg>
        </View>
    );
};

const styles = StyleSheet.create({
    root: {
        borderRadius: radius.md,
        backgroundColor: colors.surfaceAlt,
        padding: spacing.sm
    },
    empty: {
        minHeight: CHART_HEIGHT,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.lg
    }
});
