import React from 'react';
import { Box, Divider, Link, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
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
                        <Typography
                            variant="body2"
                            sx={{
                                color: "text.secondary",
                                mt: 0.75
                            }}>
                            <Box component="span" sx={{ fontWeight: 700 }}>
                                Last updated:
                            </Box>{' '}
                            July 11, 2026
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
                        <Typography
                            variant="body2"
                            sx={{
                                color: "text.secondary",
                                mt: 1
                            }}>
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
                                            <Typography variant="body2" sx={{
                                                fontWeight: 700
                                            }}>
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
                                            <Typography variant="body2" sx={{
                                                fontWeight: 700
                                            }}>
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
                                                <Typography component="li" variant="body2">
                                                    Optional profile photo used as your in-app avatar
                                                </Typography>
                                                <Typography component="li" variant="body2">
                                                    Language, unit, haptic, and reminder preferences
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <Box component="li">
                                            <Typography variant="body2" sx={{
                                                fontWeight: 700
                                            }}>
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
                                            <Typography variant="body2" sx={{
                                                fontWeight: 700
                                            }}>
                                                Imported data
                                            </Typography>
                                            <Box component="ul" sx={NESTED_LIST_SX}>
                                                <Typography component="li" variant="body2">
                                                    Food logs and weight entries imported via CSV (e.g., Lose It exports)
                                                </Typography>
                                            </Box>
                                        </Box>
                                    </Box>
                                    <Typography variant="body2" sx={{
                                        color: "text.secondary"
                                    }}>
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
                                        When you use the Service, we process limited technical information needed to
                                        authenticate requests, protect the Service, and diagnose failures, including:
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
                                            Session, device, and application information necessary for authentication
                                            and account security
                                        </Typography>
                                    </Box>
                                    <Typography variant="body2" sx={{
                                        color: "text.secondary"
                                    }}>
                                        Some of this information may appear in application, reverse-proxy, or security
                                        logs. We do not use it for advertising or behavioral profiling.
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
                                            FatSecret (when configured)
                                        </Typography>
                                        <Typography component="li" variant="body2">
                                            Open Food Facts
                                        </Typography>
                                        <Typography component="li" variant="body2">
                                            USDA FoodData Central (when enabled)
                                        </Typography>
                                    </Box>
                                    <Typography variant="body2" sx={{
                                        color: "text.secondary"
                                    }}>
                                        When you search for foods or scan barcodes, the search text, barcode, requested
                                        language, and serving context may be sent to the selected provider. Calibrate does
                                        not include your email address or account ID in those requests. The provider may
                                        still receive ordinary request metadata from the Calibrate server, such as its IP
                                        address.
                                    </Typography>
                                </Stack>
                            </Box>

                            <Box component="section">
                                <Typography variant="h6" component="h3">
                                    1.4 Sessions, Notifications, and Push Delivery
                                </Typography>
                                <Stack spacing={PARAGRAPH_SPACING} sx={{ mt: 1 }} useFlexGap>
                                    <Typography variant="body1">
                                        Calibrate stores the minimum records needed to keep you signed in and deliver
                                        notifications you enable:
                                    </Typography>
                                    <Box component="ul" sx={LIST_SX}>
                                        <Typography component="li" variant="body2">
                                            Browser session records linked to an HttpOnly session cookie
                                        </Typography>
                                        <Typography component="li" variant="body2">
                                            Hashed mobile access and refresh tokens, device identifiers, device labels,
                                            platform, expiration, and last-use timestamps
                                        </Typography>
                                        <Typography component="li" variant="body2">
                                            Browser push endpoints and encryption keys, or native push provider tokens,
                                            for devices where push is enabled
                                        </Typography>
                                        <Typography component="li" variant="body2">
                                            In-app reminder records and their read, dismissed, or resolved state
                                        </Typography>
                                    </Box>
                                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                                        Push delivery may send a device endpoint or token and reminder content to the
                                        applicable browser push service or Expo Push Service. You can disable or revoke
                                        push delivery for a device. Self-hosted operators decide whether to configure push.
                                    </Typography>
                                </Stack>
                            </Box>

                            <Box component="section">
                                <Typography variant="h6" component="h3">
                                    1.5 Android Health Connect
                                </Typography>
                                <Stack spacing={PARAGRAPH_SPACING} sx={{ mt: 1 }} useFlexGap>
                                    <Typography variant="body1">
                                        If you explicitly connect Health Connect in the Android app, Calibrate may read
                                        the data types you enable: steps, active calories burned, total calories burned,
                                        exercise sessions, and, only when separately enabled, weight.
                                    </Typography>
                                    <Typography variant="body2">
                                        Calibrate uses this information to show an observational activity history with
                                        source attribution and to reconcile changes or deletions from Health Connect. It
                                        does not write food or other records to Health Connect, use Health Connect data
                                        for advertising, or automatically change your calorie target based on imported
                                        activity.
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                                        Imported records and daily summaries are sent to the Calibrate server you chose,
                                        including a self-hosted server, and are included in account export and deletion.
                                        Changes tokens and permission state are associated with the Android installation
                                        to support incremental synchronization. You can pause synchronization, manage
                                        individual permissions in Health Connect, or disconnect at any time. Those controls
                                        stop future imports; Health Connect records already sent to the selected Calibrate
                                        server remain in activity history and exports until account deletion or operator
                                        cleanup. Samsung Health and wearable data may appear after a synchronization delay.
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
                                    Display Health Connect activity and optional weight data you choose to import
                                </Typography>
                                <Typography component="li" variant="body2">
                                    Store and retrieve your logged data
                                </Typography>
                                <Typography component="li" variant="body2">
                                    Authenticate users and maintain sessions
                                </Typography>
                                <Typography component="li" variant="body2">
                                    Deliver enabled in-app, browser, and native reminders
                                </Typography>
                                <Typography component="li" variant="body2">
                                    Prepare a portable account export or permanently delete an account on request
                                </Typography>
                                <Typography component="li" variant="body2">
                                    Diagnose bugs and maintain system reliability
                                </Typography>
                            </Box>
                            <Typography variant="body2" sx={{
                                color: "text.secondary"
                            }}>
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
                                The web client uses an HttpOnly session cookie for authentication and session security.
                                Browser storage may also retain app preferences and PWA state. The Android client stores
                                its server address and may keep pending food, weight, or completed-day changes in an
                                app-local SQLite queue until they are sent or discarded. When Health Connect is enabled,
                                the Android app also stores selected data types, pause state, and per-type changes tokens
                                needed for incremental synchronization. Authentication tokens are kept in the operating
                                system's secure credential storage.
                            </Typography>
                            <Typography variant="body2" sx={{
                                color: "text.secondary"
                            }}>
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
                                    Salted password hashes rather than stored plaintext passwords
                                </Typography>
                                <Typography component="li" variant="body2">
                                    Access-controlled databases
                                </Typography>
                                <Typography component="li" variant="body2">
                                    Hashed native authentication tokens on the server
                                </Typography>
                            </Box>
                            <Typography variant="body1">
                                Optional profile photos are resized and stored inline with the account record. They are
                                not uploaded to a separate hosted image service.
                            </Typography>
                            <Typography variant="body2" sx={{
                                color: "text.secondary"
                            }}>
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
                                <Typography component="li" variant="body2">
                                    Portable export and password-confirmed account deletion run against the instance's own
                                    database and do not depend on the hosted Calibrate service
                                </Typography>
                                <Typography component="li" variant="body2">
                                    The operator controls HTTPS, database access, logs, backups, push configuration, and
                                    retention outside the Calibrate application database
                                </Typography>
                            </Box>
                        </Stack>
                    </Box>

                    <Box component="section">
                        <Typography variant="h5" component="h2">
                            6. Data Retention
                        </Typography>
                        <Stack spacing={PARAGRAPH_SPACING} sx={{ mt: 1.5 }} useFlexGap>
                            <Typography variant="body1">
                                Account profile and tracking data remain in the active database while your account is
                                active, unless you edit or delete individual records sooner. Session records expire or are
                                removed when revoked. Push subscriptions remain until they are disabled, revoked, rejected
                                by the push provider, or the account is deleted.
                            </Typography>
                            <Typography variant="body1">
                                You may permanently delete your account after confirming your current password. Upon
                                deletion from the active database:
                            </Typography>
                            <Box component="ul" sx={LIST_SX}>
                                <Typography component="li" variant="body2">
                                    Profile data, inline avatar, goals, body metrics, food logs, completed-day state, My
                                    Foods and recipes, in-app notifications, and internal synchronization records are
                                    removed
                                </Typography>
                                <Typography component="li" variant="body2">
                                    Browser and mobile sessions are revoked, and browser/native push subscriptions are
                                    removed
                                </Typography>
                                <Typography component="li" variant="body2">
                                    Data outside the active database, such as operator-managed backups or security logs,
                                    follows the applicable operator retention schedule or legal requirements
                                </Typography>
                                <Typography component="li" variant="body2">
                                    Export files, shared copies, and app-local data on your devices remain under your
                                    control and may need to be removed separately, especially on a shared device
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
                            <Typography variant="body1">
                                While signed in, you can download a versioned JSON export containing your account profile,
                                preferences, optional avatar, goals, body metrics, food logs, completed-day state, My Foods,
                                recipes, in-app notification history, Health Connect source records, and daily activity
                                summaries. Password hashes, authentication tokens, session records, push endpoints and tokens,
                                and internal replay metadata are excluded for security.
                            </Typography>
                            <Typography variant="body2" sx={{ color: "text.secondary" }}>
                                Account deletion requires your current password and cannot be undone. These export and
                                deletion controls are available on self-hosted instances without contacting the hosted
                                service. If you need assistance with the hosted Service, contact us below; for a self-hosted
                                instance, contact its operator.
                            </Typography>
                            <Typography variant="body2">
                                See the public{' '}
                                <Link component={RouterLink} to="/account-deletion" underline="hover">
                                    account deletion instructions
                                </Link>{' '}
                                for the signed-in steps, hosted-service request path, timing, and retention details.
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
                            <Typography variant="body2" sx={{
                                color: "text.secondary"
                            }}>
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
                            <Typography variant="body2" sx={{
                                color: "text.secondary"
                            }}>
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
