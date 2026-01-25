import React from 'react';
import { Button, Stack, Typography } from '@mui/material';
import DescriptionIcon from '@mui/icons-material/DescriptionRounded';
import GitHubIcon from '@mui/icons-material/GitHub';
import { useTheme } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import AppPage from '../ui/AppPage';
import AppCard from '../ui/AppCard';
import SectionHeader from '../ui/SectionHeader';
import { useI18n } from '../i18n/useI18n';
import { CALIBRATE_REPO_URL } from '../constants/links';

const ABOUT_SECTION_SPACING = 2.5; // Vertical spacing between content blocks in About cards.
const ABOUT_PARAGRAPH_SPACING = 1.5; // Paragraph spacing for About copy blocks.
const ABOUT_LINK_SPACING = 1; // Spacing between About page link buttons.

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
                    <Stack spacing={ABOUT_SECTION_SPACING} useFlexGap>
                        <SectionHeader title={t('nav.about')} subtitle={t('about.subtitle')} />

                        <Stack spacing={ABOUT_PARAGRAPH_SPACING} useFlexGap>
                            <Typography variant="body1">
                                calibrate is a calorie and weight-tracking app for people who want to lose or manage weight.
                                Log meals, track weigh-ins, and see daily targets, trends, and goal projections.
                            </Typography>
                            <Typography variant="body1">
                                Built for daily use, calibrate focuses on fast logging and clear, transparent math that helps
                                you stay consistent on mobile or desktop.
                            </Typography>
                        </Stack>
                    </Stack>
                </AppCard>

                <AppCard>
                    <Stack spacing={ABOUT_SECTION_SPACING} useFlexGap>
                        <SectionHeader title="Mission and philosophy" />

                        <Stack spacing={ABOUT_PARAGRAPH_SPACING} useFlexGap>
                            <Typography variant="body1">
                                We believe health tracking should be accessible and transparent. calibrate is free, ad-free,
                                open-source, and self-hostable so you can keep control of your data.
                            </Typography>
                            <Typography variant="body1">
                                We are focused on building a trustworthy tool that respects your privacy while making it
                                easier to stay on track day after day.
                            </Typography>
                            <Typography variant="body1">
                                Calibrate Health is not a medical service and does not provide medical advice.
                            </Typography>
                        </Stack>
                    </Stack>
                </AppCard>

                <AppCard>
                    <Stack spacing={ABOUT_SECTION_SPACING} useFlexGap>
                        <SectionHeader title="Links" />

                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={ABOUT_LINK_SPACING} useFlexGap>
                            <Button
                                component={RouterLink}
                                to="/privacy"
                                variant="outlined"
                                startIcon={<DescriptionIcon />}
                            >
                                {t('legal.privacyPolicy')}
                            </Button>
                            <Button
                                component="a"
                                href={CALIBRATE_REPO_URL}
                                target="_blank"
                                rel="noreferrer"
                                variant="outlined"
                                startIcon={<GitHubIcon />}
                            >
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
