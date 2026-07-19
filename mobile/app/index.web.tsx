import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Link, Redirect } from 'expo-router';
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
        return <Redirect href="/(tabs)/today" />;
    }

    return (
        <Screen safeTop style={styles.screen}>
            <AuthBrand description="Track food, weight, activity, and goals with data stored on your Calibrate server." />
            <AppCard>
                <AppText variant="subtitle">Your health history stays portable.</AppText>
                <AppText variant="muted">
                    Choose the hosted service or connect to a compatible self-hosted Calibrate server.
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
                        href="/privacy"
                        style={StyleSheet.flatten([styles.textLink, { color: colors.primary }])}
                    >
                        Privacy policy
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
