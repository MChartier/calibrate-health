import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { radius, spacing, useAppTheme } from '../theme';
import { isOptionalConnectionStep, type OnboardingStep } from './steps';

type OnboardingProgressProps = {
    steps: OnboardingStep[];
    activeIndex: number;
};

const PROGRESS_TRACK_HEIGHT = 8; // Keeps the bar legible without competing with the current-step label.

/** Compact continuous progress indicator for the focused onboarding sequence. */
export const OnboardingProgress: React.FC<OnboardingProgressProps> = ({
    steps,
    activeIndex
}) => {
    const { colors } = useAppTheme();
    const activeStep = steps[activeIndex];
    const isOptional = activeStep ? isOptionalConnectionStep(activeStep.key) : false;
    const totalSteps = Math.max(steps.length, 1);
    const currentStep = Math.min(Math.max(activeIndex + 1, 1), totalSteps);
    const progressPercent = (currentStep / totalSteps) * 100;
    const progressText = `Step ${currentStep} of ${totalSteps}`;

    return (
        <View style={styles.root}>
            <View style={styles.summary}>
                <AppText variant="label">{progressText}</AppText>
                {isOptional && (
                    <View style={[styles.optionalPill, { backgroundColor: colors.primaryContainer }]}>
                        <AppText variant="caption" style={[styles.optionalText, { color: colors.onPrimaryContainer }]}>Optional connection</AppText>
                    </View>
                )}
            </View>
            <View
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel="Onboarding progress"
                accessibilityValue={{
                    min: 1,
                    max: totalSteps,
                    now: currentStep,
                    text: progressText
                }}
                style={[styles.track, { backgroundColor: colors.outlineVariant }]}
            >
                <View
                    style={[
                        styles.fill,
                        {
                            backgroundColor: colors.primary,
                            width: `${progressPercent}%`
                        }
                    ]}
                />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    root: {
        gap: spacing.xs
    },
    summary: {
        minHeight: 24,
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm
    },
    optionalPill: {
        borderRadius: radius.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs
    },
    optionalText: {
        fontWeight: '800'
    },
    track: {
        width: '100%',
        height: PROGRESS_TRACK_HEIGHT,
        borderRadius: radius.pill,
        overflow: 'hidden'
    },
    fill: {
        height: '100%',
        borderRadius: radius.pill
    }
});
