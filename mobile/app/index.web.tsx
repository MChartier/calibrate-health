import { StyleSheet, View } from 'react-native';
import { Link, Redirect, type Href } from 'expo-router';
import { CALIBRATE_PRODUCT_LINKS } from '@calibrate/shared/product';
import { AppCard } from '../src/components/AppCard';
import { AppText } from '../src/components/AppText';
import { AuthBrand } from '../src/components/auth/AuthBrand';
import { Screen } from '../src/components/Screen';
import { useAuth } from '../src/auth/AuthContext';
import { radius, spacing, useAppTheme } from '../src/theme';

/** Public browser entry point; native keeps its direct authentication redirect. */
export default function WebHomeRoute() {
    const { colors } = useAppTheme();
    const { user, isLoading } = useAuth();

    if (!isLoading && user) {
        return <Redirect href="/today" />;
    }

    return (
        <Screen safeTop style={styles.screen}>
            <AuthBrand description="Track food, weight, and progress against a personalized calorie target." />
            <AppCard>
                <AppText variant="subtitle">A clearer view of your progress.</AppText>
                <AppText variant="muted">
                    Create an account on Calibrate's hosted service, or sign in to one you already use.
                </AppText>
                <View style={styles.actions}>
                    <Link
                        href="/(auth)/login"
                        style={StyleSheet.flatten([
                            styles.primaryLink,
                            { backgroundColor: colors.primary, color: colors.onPrimary }
                        ])}
                    >
                        Sign in
                    </Link>
                    <Link
                        href="/(auth)/register"
                        style={StyleSheet.flatten([
                            styles.secondaryLink,
                            { borderColor: colors.outline, color: colors.primary }
                        ])}
                    >
                        Create account
                    </Link>
                </View>
                <View style={styles.legalLinks}>
                    <Link
                        href={CALIBRATE_PRODUCT_LINKS.privacy as Href}
                        style={StyleSheet.flatten([styles.textLink, { color: colors.primary }])}
                    >
                        Privacy policy
                    </Link>
                    <Link
                        href={CALIBRATE_PRODUCT_LINKS.terms as Href}
                        style={StyleSheet.flatten([styles.textLink, { color: colors.primary }])}
                    >
                        Terms of service
                    </Link>
                    <Link
                        href={CALIBRATE_PRODUCT_LINKS.support as Href}
                        style={StyleSheet.flatten([styles.textLink, { color: colors.primary }])}
                    >
                        Support
                    </Link>
                    <Link
                        href="/account-deletion"
                        style={StyleSheet.flatten([styles.textLink, { color: colors.primary }])}
                    >
                        Account deletion
                    </Link>
                </View>
            </AppCard>
        </Screen>
    );
}

const styles = StyleSheet.create({
    screen: {
        justifyContent: 'center',
        flexGrow: 1,
        maxWidth: 640,
        width: '100%',
        alignSelf: 'center'
    },
    actions: {
        gap: spacing.sm
    },
    primaryLink: {
        minHeight: 48,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        textAlign: 'center',
        fontWeight: '800'
    },
    secondaryLink: {
        minHeight: 48,
        borderRadius: radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        textAlign: 'center',
        fontWeight: '800'
    },
    legalLinks: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: spacing.md
    },
    textLink: {
        minHeight: 48,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        textAlign: 'center',
        fontWeight: '700'
    }
});
