import React from 'react';
import { router } from 'expo-router';
import { PageHeader } from '../src/components/PageHeader';
import { Screen } from '../src/components/Screen';
import { WeightTrendCard } from '../src/components/WeightTrendCard';

export default function WeightTrendScreen() {
    return (
        <Screen safeTop>
            <PageHeader
                title="Trend details"
                description="Explore how your weight is changing over time."
                onBack={() => router.back()}
            />
            <WeightTrendCard
                title="Weight trend"
                description="Choose a range, then tap the chart to inspect a weigh-in."
            />
        </Screen>
    );
}
