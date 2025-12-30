import React from 'react';
import { Box, Typography } from '@mui/material';

export type OnboardingQuestionHeaderProps = {
    prompt: string;
    progressLabel: string;
};

/**
 * OnboardingQuestionHeader
 *
 * A compact "prompt + x/n" header used in the fixed onboarding footer.
 *
 * We keep the progress hint minimal and scannable (no progress bar), since the onboarding already
 * has a separate two-step indicator and we want to avoid extra visual noise in the footer.
 */
const OnboardingQuestionHeader: React.FC<OnboardingQuestionHeaderProps> = ({ prompt, progressLabel }) => {
    return (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, flex: 1 }} aria-live="polite">
                {prompt}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, flexShrink: 0 }}>
                {progressLabel}
            </Typography>
        </Box>
    );
};

export default OnboardingQuestionHeader;
