import React from 'react';
import { Button, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import AppPage from '../ui/AppPage';
import AppCard from '../ui/AppCard';
import SectionHeader from '../ui/SectionHeader';
import { useI18n } from '../i18n/useI18n';
import { CALIBRATE_REPO_URL } from '../constants/links';

const ABOUT_ACTION_SPACING = 1; // Spacing between the About page action buttons.

/**
 * About
 *
 * Provide app context and direct links to legal + source resources for signed-in users.
 */
const About: React.FC = () => {
    const theme = useTheme();
    const { t } = useI18n();
    const sectionGap = theme.custom.layout.page.sectionGap;

    return (
        <AppPage maxWidth="content">
            <Stack spacing={sectionGap} useFlexGap>
                <AppCard>
                    <Stack spacing={2} useFlexGap>
                        <SectionHeader title={t('nav.about')} subtitle={t('about.subtitle')} />

                        <Stack spacing={1} useFlexGap>
                            <Typography variant="body1">
                                calibrate is a calorie and weight-tracking tool for logging food, weight, and progress trends.
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                It is not a medical service and does not provide medical advice.
                            </Typography>
                        </Stack>

                        <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            spacing={ABOUT_ACTION_SPACING}
                            useFlexGap
                            sx={{ alignItems: 'flex-start' }}
                        >
                            <Button component={RouterLink} to="/privacy" variant="outlined">
                                {t('legal.privacyPolicy')}
                            </Button>
                            <Button component="a" href={CALIBRATE_REPO_URL} target="_blank" rel="noreferrer" variant="text">
                                {t('nav.github')}
                            </Button>
                        </Stack>
                    </Stack>
                </AppCard>
            </Stack>
        </AppPage>
    );
};

export default About;
