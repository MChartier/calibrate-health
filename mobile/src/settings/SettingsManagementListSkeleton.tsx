import { StyleSheet, View } from 'react-native';
import { SkeletonBlock } from '../components/SkeletonBlock';
import { spacing } from '../theme';

type SettingsManagementListSkeletonProps = {
    label: string;
};

/** Preserve management-list shape while account access data loads. */
export function SettingsManagementListSkeleton({ label }: SettingsManagementListSkeletonProps) {
    return (
        <View accessibilityLabel={label} style={styles.list}>
            {[0, 1].map((row) => (
                <View key={row} style={styles.row}>
                    <View style={styles.copy}>
                        <SkeletonBlock width="58%" height={18} />
                        <SkeletonBlock width="76%" height={14} />
                    </View>
                    <SkeletonBlock width={72} height={36} />
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    list: {
        gap: spacing.md
    },
    row: {
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md
    },
    copy: {
        flex: 1,
        gap: spacing.sm
    }
});
