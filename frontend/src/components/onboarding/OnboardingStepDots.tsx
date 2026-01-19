import React from 'react';
import { Box, Typography } from '@mui/material';
import type { OnboardingStep } from './types';

/**
 * Compact onboarding progress indicator (dots + labels).
 */
export type OnboardingStepDotsProps = {
    steps: OnboardingStep[];
    activeStepIndex: number;
};

const DOT_SIZE_ACTIVE_PX = 16; // Controls the active step dot size (kept readable on small phones).
const DOT_SIZE_INACTIVE_PX = 14; // Controls inactive/complete dot size.

/**
 * Compact progress indicator for onboarding.
 *
 * This keeps expectations clear without the height of a full Stepper.
 */
const OnboardingStepDots: React.FC<OnboardingStepDotsProps> = ({ steps, activeStepIndex }) => {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', gap: 1 }}>
            {steps.map((step, index) => {
                const isComplete = index < activeStepIndex;
                const isActive = index === activeStepIndex;

                return (
                    <React.Fragment key={step.key}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                            <Box
                                sx={(theme) => ({
                                    width: isActive ? DOT_SIZE_ACTIVE_PX : DOT_SIZE_INACTIVE_PX,
                                    height: isActive ? DOT_SIZE_ACTIVE_PX : DOT_SIZE_INACTIVE_PX,
                                    borderRadius: '50%',
                                    border: `2px solid ${isComplete || isActive ? theme.palette.primary.main : theme.palette.divider}`,
                                    backgroundColor: isComplete || isActive ? theme.palette.primary.main : 'transparent',
                                    transition: theme.transitions.create(['transform', 'background-color', 'border-color'], {
                                        duration: theme.transitions.duration.shortest
                                    }),
                                    transform: isActive ? 'scale(1.05)' : 'scale(1)'
                                })}
                            />
                            <Typography
                                variant="body2"
                                sx={{
                                    fontWeight: isActive ? 800 : 700,
                                    color: isComplete || isActive ? 'text.primary' : 'text.secondary',
                                    whiteSpace: 'normal',
                                    lineHeight: 1.15
                                }}
                            >
                                {step.label}
                            </Typography>
                        </Box>
                    </React.Fragment>
                );
            })}
        </Box>
    );
};

export default OnboardingStepDots;
