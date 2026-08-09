import { router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../src/auth/AuthContext';
import { AppButton } from '../src/components/AppButton';
import { AppCard } from '../src/components/AppCard';
import { AppText } from '../src/components/AppText';
import { LoadingState } from '../src/components/LoadingState';
import { PageHeader } from '../src/components/PageHeader';
import { Screen } from '../src/components/Screen';
import { canonicalPathForRoute } from '../src/navigation/routeRegistry';
import { spacing } from '../src/theme';

export default function NotFoundScreen() {
    const { user, isLoading } = useAuth();

    if (isLoading) return <LoadingState label="Finding your way..." />;

    const signedIn = Boolean(user);
    const primaryTitle = signedIn ? 'Go to Today' : 'Go to Calibrate home';
    const primaryRoute = signedIn ? 'today' : 'root';
    const secondaryTitle = signedIn ? 'Open Settings' : 'Sign in';
    const secondaryRoute = signedIn ? 'settings' : 'login';
    const description = signedIn
        ? 'That page is not available. Return to your daily tracking or account settings.'
        : 'That page is not available. Return home to learn more, create an account, or sign in.';

    return (
        <Screen testID="route-not-found" safeTop style={styles.screen}>
            <PageHeader
                testID="route-not-found-header"
                eyebrow="404"
                title="Page not found"
                description={description}
            />
            <AppCard testID="route-recovery-actions">
                <AppText variant="card">The address may be outdated, incomplete, or no longer available.</AppText>
                <View style={styles.actions}>
                    <AppButton
                        title={primaryTitle}
                        onPress={() => router.replace(canonicalPathForRoute(primaryRoute) as Href)}
                        style={styles.action}
                    />
                    <AppButton
                        title={secondaryTitle}
                        variant="secondary"
                        onPress={() => router.replace(canonicalPathForRoute(secondaryRoute) as Href)}
                        style={styles.action}
                    />
                </View>
            </AppCard>
        </Screen>
    );
}

const styles = StyleSheet.create({
    screen: {
        justifyContent: 'center'
    },
    actions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.md
    },
    action: {
        flex: 1
    }
});
