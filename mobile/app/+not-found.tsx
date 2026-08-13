import { router, type Href } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useAuth } from '../src/auth/AuthContext';
import { AppButton } from '../src/components/AppButton';
import { AppCard } from '../src/components/AppCard';
import { AppText } from '../src/components/AppText';
import { LoadingState } from '../src/components/LoadingState';
import { PageHeader } from '../src/components/PageHeader';
import { Screen } from '../src/components/Screen';
import { canonicalPathForRoute } from '../src/navigation/routeRegistry';

export default function NotFoundScreen() {
    const { user, isLoading } = useAuth();

    if (isLoading) return <LoadingState label="Finding your way..." />;

    const signedIn = Boolean(user);
    const actionTitle = signedIn ? 'Go to Today' : 'Go to Calibrate home';
    const description = signedIn
        ? 'That page is not available. Return to Today and keep tracking.'
        : 'That page is not available. Return home to sign in or learn more.';

    return (
        <Screen safeTop style={styles.screen}>
            <PageHeader
                eyebrow="404"
                title="Page not found"
                description={description}
            />
            <AppCard>
                <AppText variant="card">The link may be outdated or the page may have moved.</AppText>
                <AppButton
                    title={actionTitle}
                    onPress={() => router.replace(canonicalPathForRoute(signedIn ? 'today' : 'root') as Href)}
                />
            </AppCard>
        </Screen>
    );
}

const styles = StyleSheet.create({
    screen: {
        justifyContent: 'center'
    }
});
