/**
 * Defines the about Expo Router screen.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, type Href } from 'expo-router';
import { CALIBRATE_PRODUCT_LINKS } from '@calibrate/shared/product';
import { AppCard } from '../../../src/components/AppCard';
import { AppText } from '../../../src/components/AppText';
import { CalibrateLogo } from '../../../src/components/CalibrateLogo';
import { TabScreen } from '../../../src/components/TabScreen';
import { interaction, radius, spacing, useAppTheme } from '../../../src/theme';

const PRODUCT_LINKS = [
    { label: 'Calibrate website', href: CALIBRATE_PRODUCT_LINKS.product },
    { label: 'Privacy policy', href: CALIBRATE_PRODUCT_LINKS.privacy },
    { label: 'Terms of service', href: CALIBRATE_PRODUCT_LINKS.terms },
    { label: 'Support', href: CALIBRATE_PRODUCT_LINKS.support },
    { label: 'Feedback', href: CALIBRATE_PRODUCT_LINKS.feedback },
    { label: 'Open-source licenses', href: CALIBRATE_PRODUCT_LINKS.licenses },
    { label: 'Release notes', href: CALIBRATE_PRODUCT_LINKS.releases }
] as const;

const PRODUCT_LINK_MIN_WIDTH = 200; // Keeps every wrapped destination readable as a distinct control.
const PRODUCT_LINK_PREFERRED_WIDTH = 220; // Forms a responsive multi-column link grid on wider screens.

/** Render the about screen interface. */
export default function AboutScreen() {
    const theme = useAppTheme();
    return (
        <TabScreen>
            <AppCard style={styles.brandCard}>
                <View style={[styles.logoSurface, { backgroundColor: theme.colors.primaryContainer }]}>
                    <CalibrateLogo size={52} />
                </View>
                <View style={styles.brandCopy}>
                    <AppText variant="title">About Calibrate</AppText>
                    <AppText variant="caption">Food, weight, and goal tracking built around clear daily progress.</AppText>
                </View>
            </AppCard>

            <AppCard>
                <AppText accessibilityRole="header" aria-level={2} variant="subtitle">Understand your progress</AppText>
                <AppText>
                    Calibrate helps you log food and weight, compare calories with a personalized target, and follow
                    your trend over time.
                </AppText>
                <AppText variant="caption">
                    Available in English on the web as an installable PWA and on Android and iOS, with a Wear OS
                    companion for Android.
                </AppText>
            </AppCard>

            <AppCard>
                <AppText accessibilityRole="header" aria-level={2} variant="subtitle">Your data, your choices</AppText>
                <AppText>
                    The service you sign in to stores the account data Calibrate needs to work. You can export a
                    portable copy or permanently delete your account from Settings.
                </AppText>
                <View style={styles.productLinks}>
                    {PRODUCT_LINKS.map((link) => (
                        <Link key={link.label} href={link.href as Href} asChild>
                            <Pressable
                                accessibilityRole="link"
                                accessibilityLabel={link.label}
                                style={({ pressed }) => [
                                    styles.productLink,
                                    {
                                        backgroundColor: pressed
                                            ? theme.colors.surfacePressed
                                            : theme.colors.surfaceContainerLow,
                                        borderColor: theme.colors.outline,
                                        borderWidth: theme.stroke.control
                                    }
                                ]}
                            >
                                <AppText style={[styles.productLinkText, { color: theme.colors.primary }]}>
                                    {link.label}
                                </AppText>
                                <Ionicons name="open-outline" size={18} color={theme.colors.primary} />
                            </Pressable>
                        </Link>
                    ))}
                </View>
            </AppCard>

        </TabScreen>
    );
}

const styles = StyleSheet.create({
    brandCard: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    logoSurface: {
        width: 72,
        height: 72,
        borderRadius: radius.lg,
        alignItems: 'center',
        justifyContent: 'center'
    },
    brandCopy: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs
    },
    productLinks: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.md
    },
    productLink: {
        width: 'auto',
        minWidth: PRODUCT_LINK_MIN_WIDTH,
        minHeight: interaction.minimumTouchTarget,
        flexBasis: PRODUCT_LINK_PREFERRED_WIDTH,
        flexGrow: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm
    },
    productLinkText: {
        fontWeight: '800'
    }
});
