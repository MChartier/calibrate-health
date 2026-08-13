import { StyleSheet, View } from 'react-native';
import { Link, type Href } from 'expo-router';
import { useAuth } from '../../auth/AuthContext';
import { AppCard } from '../AppCard';
import { AppText } from '../AppText';
import { CalibrateLogo } from '../CalibrateLogo';
import { Screen } from '../Screen';
import type { PublicLegalSection } from '../../legal/publicLegalContent';
import { radius, spacing, useAppTheme } from '../../theme';

type PublicLegalLink = {
    href: string;
    label: string;
};

type PublicLegalPageProps = {
    title: string;
    lastUpdated?: string;
    intro: string[];
    sections: PublicLegalSection[];
    links: PublicLegalLink[];
    actions?: React.ReactNode;
};

/** Public legal content keeps its own trust shell and gives signed-in users a clear return to Settings. */
export function PublicLegalPage({ title, lastUpdated, intro, sections, links, actions }: PublicLegalPageProps) {
    const { user } = useAuth();
    const { colors } = useAppTheme();
    const inApp = Boolean(user);

    return (
        <Screen
            testID={inApp ? 'legal-in-app-shell' : 'legal-public-shell'}
            safeTop
            style={styles.screen}
        >
            <View style={[styles.brandBar, { borderBottomColor: colors.outlineVariant }]}>
                <View style={styles.brandIdentity}>
                    <CalibrateLogo size={36} />
                    <AppText variant="label" style={{ color: colors.primary }}>Calibrate Health</AppText>
                </View>
                <Link
                    href={(inApp ? '/settings' : '/') as Href}
                    style={StyleSheet.flatten([styles.homeLink, { color: colors.primary }])}
                >
                    {inApp ? 'Back to Settings' : 'Calibrate home'}
                </Link>
            </View>

            <AppCard testID="legal-page">
                <View style={styles.content}>
                    <View style={styles.section}>
                        <AppText
                            nativeID="route-focus-title"
                            accessibilityRole="header"
                            aria-level={1}
                            variant="title"
                        >
                            {title}
                        </AppText>
                        {lastUpdated && <AppText variant="label">Last updated: {lastUpdated}</AppText>}
                        {intro.map((paragraph) => (
                            <AppText key={paragraph}>{paragraph}</AppText>
                        ))}
                    </View>

                    {actions}

                    {sections.map((section) => (
                        <View
                            key={section.title}
                            style={[styles.section, styles.dividedSection, { borderTopColor: colors.outlineVariant }]}
                        >
                            <AppText accessibilityRole="header" aria-level={2} variant="subtitle">{section.title}</AppText>
                            {section.paragraphs?.map((paragraph) => (
                                <AppText key={paragraph}>{paragraph}</AppText>
                            ))}
                            {section.bullets?.map((bullet) => (
                                <View key={bullet} style={styles.bulletRow}>
                                    <AppText accessibilityElementsHidden importantForAccessibility="no">-</AppText>
                                    <AppText style={styles.bulletCopy}>{bullet}</AppText>
                                </View>
                            ))}
                        </View>
                    ))}

                    <View style={[styles.links, styles.dividedSection, { borderTopColor: colors.outlineVariant }]}>
                        {links.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href as Href}
                                style={StyleSheet.flatten([
                                    styles.link,
                                    { borderColor: colors.outline, color: colors.primary }
                                ])}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </View>
                </View>
            </AppCard>
        </Screen>
    );
}

const styles = StyleSheet.create({
    screen: {
        width: '100%',
        maxWidth: 920,
        alignSelf: 'center'
    },
    brandBar: {
        minHeight: 56,
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        paddingBottom: spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth
    },
    brandIdentity: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm
    },
    homeLink: {
        minHeight: 48,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        textAlign: 'center',
        fontWeight: '800'
    },
    content: {
        gap: spacing.lg
    },
    section: {
        gap: spacing.sm
    },
    dividedSection: {
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingTop: spacing.lg
    },
    bulletRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.sm,
        paddingLeft: spacing.sm
    },
    bulletCopy: {
        flex: 1
    },
    links: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm
    },
    link: {
        minHeight: 48,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        textAlign: 'center',
        fontWeight: '800'
    }
});
