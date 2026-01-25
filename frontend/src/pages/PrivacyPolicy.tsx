import React from 'react';
import { Box, Divider, Link, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import AppPage from '../ui/AppPage';
import AppCard from '../ui/AppCard';
import { useI18n } from '../i18n/useI18n';
import { CALIBRATE_WEBSITE_URL } from '../constants/links';

const SUBSECTION_SPACING = 2; // Vertical spacing between subsections within a policy section.
const PARAGRAPH_SPACING = 1; // Spacing between paragraph blocks inside a subsection.
const LIST_ITEM_GAP = 0.5; // Dense spacing for bullet items to keep long lists compact.
const LIST_INDENT = 3; // Indent level for bullet lists relative to body text.
const NESTED_LIST_MARGIN_TOP = 0.5; // Offset for nested lists to separate them from headers.

const LIST_SX = { pl: LIST_INDENT, mt: 1, mb: 0, display: 'grid', gap: LIST_ITEM_GAP };
const NESTED_LIST_SX = { ...LIST_SX, mt: NESTED_LIST_MARGIN_TOP };

/**
 * PrivacyPolicy
 *
 * Render the Calibrate Health privacy policy with structured headings and lists.
 */
const PrivacyPolicy: React.FC = () => {
    const theme = useTheme();
    const { t } = useI18n();
    const sectionGap = theme.custom.layout.page.sectionGap;

    return (
        <AppPage maxWidth="content">
            <AppCard>
                <Stack spacing={sectionGap} divider={<Divider flexItem />} useFlexGap>
                    <Box>
                        <Typography variant="h3" component="h1">
                            {t('legal.privacyPolicy')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                            <Box component="span" sx={{ fontWeight: 700 }}>
                                Last updated:
                            </Box>{' '}
                            January 2026
                        </Typography>
                        <Typography variant="body1" sx={{ mt: 1.5 }}>
                            Calibrate Health ("Calibrate", "we", "us", or "our") respects your privacy. This Privacy Policy
                            explains what information we collect, how we use it, and the choices you have when you use the
                            Calibrate Health application, available at{' '}
                            <Link href={CALIBRATE_WEBSITE_URL} underline="hover">
                                {CALIBRATE_WEBSITE_URL}
                            </Link>{' '}
                            (the "Service").
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            Calibrate Health is a calorie and weight-tracking tool. It is not a medical service and does
                            not provide medical advice.
                        </Typography>
                    </Box>

                    <Box component="section">
                        <Typography variant="h5" component="h2">
                            1. Information We Collect
                        </Typography>

                        <Stack spacing={SUBSECTION_SPACING} sx={{ mt: 1.5 }} useFlexGap>
                            <Box component="section">
                                <Typography variant="h6" component="h3">
                                    1.1 Information You Provide
                                </Typography>
                                <Stack spacing={PARAGRAPH_SPACING} sx={{ mt: 1 }} useFlexGap>
                                    <Typography variant="body1">
                                        When you create an account or use the Service, you may provide:
                                    </Typography>
                                    <Box component="ul" sx={LIST_SX}>
                                        <Box component="li">
                                            <Typography variant="body2" fontWeight={700}>
                                                Account information
                                            </Typography>
                                            <Box component="ul" sx={NESTED_LIST_SX}>
                                                <Typography component="li" variant="body2">
                                                    Email address
                                                </Typography>
                                                <Typography component="li" variant="body2">
                                                    Encrypted password
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <Box component="li">
                                            <Typography variant="body2" fontWeight={700}>
                                                Profile information
                                            </Typography>
                                            <Box component="ul" sx={NESTED_LIST_SX}>
                                                <Typography component="li" variant="body2">
                                                    Date of birth or age
                                                </Typography>
                                                <Typography component="li" variant="body2">
                                                    Sex
                                                </Typography>
                                                <Typography component="li" variant="body2">
                                                    Height
                                                </Typography>
                                                <Typography component="li" variant="body2">
                                                    Time zone
                                                </Typography>
                                                <Typography component="li" variant="body2">
                                                    Unit preferences (imperial or metric)
                                                </Typography>
                                                <Typography component="li" variant="body2">
                                                    Activity level
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <Box component="li">
                                            <Typography variant="body2" fontWeight={700}>
                                                Health-related data you choose to enter
                                            </Typography>
                                            <Box component="ul" sx={NESTED_LIST_SX}>
                                                <Typography component="li" variant="body2">
                                                    Weight entries
                                                </Typography>
                                                <Typography component="li" variant="body2">
                                                    Food and calorie logs
                                                </Typography>
                                                <Typography component="li" variant="body2">
                                                    Custom foods, recipes, and meal entries
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <Box component="li">
                                            <Typography variant="body2" fontWeight={700}>
                                                Imported data
                                            </Typography>
                                            <Box component="ul" sx={NESTED_LIST_SX}>
                                                <Typography component="li" variant="body2">
                                                    Food logs and weight entries imported via CSV (e.g., Lose It exports)
                                                </Typography>
                                            </Box>
                                        </Box>
                                    </Box>
                                    <Typography variant="body2" color="text.secondary">
                                        All health-related data is entered voluntarily and is stored solely to provide the
                                        core functionality of the Service.
                                    </Typography>
                                </Stack>
                            </Box>

                            <Box component="section">
                                <Typography variant="h6" component="h3">
                                    1.2 Information Collected Automatically
                                </Typography>
                                <Stack spacing={PARAGRAPH_SPACING} sx={{ mt: 1 }} useFlexGap>
                                    <Typography variant="body1">
                                        When you use the Service, we automatically collect limited technical information,
                                        including:
                                    </Typography>
                                    <Box component="ul" sx={LIST_SX}>
                                        <Typography component="li" variant="body2">
                                            IP address
                                        </Typography>
                                        <Typography component="li" variant="body2">
                                            Browser type and version
                                        </Typography>
                                        <Typography component="li" variant="body2">
                                            Device type and operating system
                                        </Typography>
                                        <Typography component="li" variant="body2">
                                            Dates and times of access
                                        </Typography>
                                        <Typography component="li" variant="body2">
                                            Application usage necessary for authentication and session management
                                        </Typography>
                                    </Box>
                                    <Typography variant="body2" color="text.secondary">
                                        We do not use this data for advertising or behavioral profiling.
                                    </Typography>
                                </Stack>
                            </Box>

                            <Box component="section">
                                <Typography variant="h6" component="h3">
                                    1.3 Third-Party Food Data Providers
                                </Typography>
                                <Stack spacing={PARAGRAPH_SPACING} sx={{ mt: 1 }} useFlexGap>
                                    <Typography variant="body1">
                                        Calibrate may retrieve food and nutrition data from third-party providers such as:
                                    </Typography>
                                    <Box component="ul" sx={LIST_SX}>
                                        <Typography component="li" variant="body2">
                                            Open Food Facts
                                        </Typography>
                                        <Typography component="li" variant="body2">
                                            USDA FoodData Central (when enabled)
                                        </Typography>
                                    </Box>
                                    <Typography variant="body2" color="text.secondary">
                                        When you search for foods or scan barcodes, your query may be sent to these
                                        providers. Calibrate does not send personally identifiable information (such as your
                                        email address or account ID) to these services.
                                    </Typography>
                                </Stack>
                            </Box>
                        </Stack>
                    </Box>

                    <Box component="section">
                        <Typography variant="h5" component="h2">
                            2. How We Use Your Information
                        </Typography>
                        <Stack spacing={PARAGRAPH_SPACING} sx={{ mt: 1.5 }} useFlexGap>
                            <Typography variant="body1">
                                We use your information only to operate and improve the Service, including to:
                            </Typography>
                            <Box component="ul" sx={LIST_SX}>
                                <Typography component="li" variant="body2">
                                    Create and manage your account
                                </Typography>
                                <Typography component="li" variant="body2">
                                    Calculate calorie targets and projections
                                </Typography>
                                <Typography component="li" variant="body2">
                                    Display trends and visualizations
                                </Typography>
                                <Typography component="li" variant="body2">
                                    Store and retrieve your logged data
                                </Typography>
                                <Typography component="li" variant="body2">
                                    Authenticate users and maintain sessions
                                </Typography>
                                <Typography component="li" variant="body2">
                                    Diagnose bugs and maintain system reliability
                                </Typography>
                            </Box>
                            <Typography variant="body2" color="text.secondary">
                                We do not sell your data, rent it, or use it for targeted advertising.
                            </Typography>
                        </Stack>
                    </Box>

                    <Box component="section">
                        <Typography variant="h5" component="h2">
                            3. Cookies and Local Storage
                        </Typography>
                        <Stack spacing={PARAGRAPH_SPACING} sx={{ mt: 1.5 }} useFlexGap>
                            <Typography variant="body1">
                                Calibrate uses cookies and similar technologies strictly for:
                            </Typography>
                            <Box component="ul" sx={LIST_SX}>
                                <Typography component="li" variant="body2">
                                    Authentication
                                </Typography>
                                <Typography component="li" variant="body2">
                                    Session management
                                </Typography>
                                <Typography component="li" variant="body2">
                                    Security
                                </Typography>
                            </Box>
                            <Typography variant="body2" color="text.secondary">
                                We do not use third-party advertising cookies or tracking pixels.
                            </Typography>
                        </Stack>
                    </Box>

                    <Box component="section">
                        <Typography variant="h5" component="h2">
                            4. Data Storage and Security
                        </Typography>
                        <Stack spacing={PARAGRAPH_SPACING} sx={{ mt: 1.5 }} useFlexGap>
                            <Typography variant="body1">
                                Your data is stored securely using industry-standard practices, including:
                            </Typography>
                            <Box component="ul" sx={LIST_SX}>
                                <Typography component="li" variant="body2">
                                    Encrypted connections (HTTPS)
                                </Typography>
                                <Typography component="li" variant="body2">
                                    Encrypted passwords
                                </Typography>
                                <Typography component="li" variant="body2">
                                    Access-controlled databases
                                </Typography>
                            </Box>
                            <Typography variant="body2" color="text.secondary">
                                While no system can guarantee absolute security, we take reasonable measures to protect your
                                information against unauthorized access, loss, or misuse.
                            </Typography>
                        </Stack>
                    </Box>

                    <Box component="section">
                        <Typography variant="h5" component="h2">
                            5. Self-Hosted Instances
                        </Typography>
                        <Stack spacing={PARAGRAPH_SPACING} sx={{ mt: 1.5 }} useFlexGap>
                            <Typography variant="body1">Calibrate Health is open-source and may be self-hosted.</Typography>
                            <Typography variant="body1">If you run your own instance of Calibrate:</Typography>
                            <Box component="ul" sx={LIST_SX}>
                                <Typography component="li" variant="body2">
                                    You are fully responsible for the data stored in your deployment
                                </Typography>
                                <Typography component="li" variant="body2">
                                    This Privacy Policy applies only to the hosted service at {CALIBRATE_WEBSITE_URL}
                                </Typography>
                                <Typography component="li" variant="body2">
                                    We do not have access to data stored in self-hosted instances
                                </Typography>
                            </Box>
                        </Stack>
                    </Box>

                    <Box component="section">
                        <Typography variant="h5" component="h2">
                            6. Data Retention
                        </Typography>
                        <Stack spacing={PARAGRAPH_SPACING} sx={{ mt: 1.5 }} useFlexGap>
                            <Typography variant="body1">We retain your data for as long as your account remains active.</Typography>
                            <Typography variant="body1">You may delete your account at any time. Upon deletion:</Typography>
                            <Box component="ul" sx={LIST_SX}>
                                <Typography component="li" variant="body2">
                                    Your personal data will be permanently removed from our systems within a reasonable period,
                                    unless retention is required for legal or security purposes.
                                </Typography>
                            </Box>
                        </Stack>
                    </Box>

                    <Box component="section">
                        <Typography variant="h5" component="h2">
                            7. Your Rights and Choices
                        </Typography>
                        <Stack spacing={PARAGRAPH_SPACING} sx={{ mt: 1.5 }} useFlexGap>
                            <Typography variant="body1">Depending on your location, you may have the right to:</Typography>
                            <Box component="ul" sx={LIST_SX}>
                                <Typography component="li" variant="body2">
                                    Access your personal data
                                </Typography>
                                <Typography component="li" variant="body2">
                                    Correct inaccurate data
                                </Typography>
                                <Typography component="li" variant="body2">
                                    Delete your data
                                </Typography>
                                <Typography component="li" variant="body2">
                                    Export your data
                                </Typography>
                            </Box>
                            <Typography variant="body2" color="text.secondary">
                                You can exercise most of these rights directly within the Service. If you need assistance,
                                contact us using the information below.
                            </Typography>
                        </Stack>
                    </Box>

                    <Box component="section">
                        <Typography variant="h5" component="h2">
                            8. Children's Privacy
                        </Typography>
                        <Stack spacing={PARAGRAPH_SPACING} sx={{ mt: 1.5 }} useFlexGap>
                            <Typography variant="body1">
                                Calibrate Health is not intended for use by children under the age of 13.
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                We do not knowingly collect personal data from children. If you believe a child has provided
                                personal information, please contact us and we will delete it.
                            </Typography>
                        </Stack>
                    </Box>

                    <Box component="section">
                        <Typography variant="h5" component="h2">
                            9. Changes to This Policy
                        </Typography>
                        <Stack spacing={PARAGRAPH_SPACING} sx={{ mt: 1.5 }} useFlexGap>
                            <Typography variant="body1">We may update this Privacy Policy from time to time.</Typography>
                            <Typography variant="body2" color="text.secondary">
                                If we make material changes, we will notify users by updating the "Last updated" date and,
                                when appropriate, by providing notice within the Service.
                            </Typography>
                        </Stack>
                    </Box>

                    <Box component="section">
                        <Typography variant="h5" component="h2">
                            10. Contact Us
                        </Typography>
                        <Stack spacing={PARAGRAPH_SPACING} sx={{ mt: 1.5 }} useFlexGap>
                            <Typography variant="body1">
                                If you have questions or concerns about this Privacy Policy or your data, you can contact us at:
                            </Typography>
                            <Stack spacing={0.5} useFlexGap>
                                <Typography variant="body2">
                                    <Box component="span" sx={{ fontWeight: 700 }}>
                                        Email:
                                    </Box>{' '}
                                    <Link href="mailto:privacy@calibratehealth.app" underline="hover">
                                        privacy@calibratehealth.app
                                    </Link>
                                </Typography>
                                <Typography variant="body2">
                                    <Box component="span" sx={{ fontWeight: 700 }}>
                                        Website:
                                    </Box>{' '}
                                    <Link href={CALIBRATE_WEBSITE_URL} underline="hover">
                                        {CALIBRATE_WEBSITE_URL}
                                    </Link>
                                </Typography>
                            </Stack>
                        </Stack>
                    </Box>
                </Stack>
            </AppCard>
        </AppPage>
    );
};

export default PrivacyPolicy;
