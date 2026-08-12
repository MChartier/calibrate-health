import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { SearchedFoodItem } from '../food/serving';
import { AppText } from '../components/AppText';
import { radius, spacing, useAppTheme } from '../theme';

type BarcodeResultListProps = {
    candidates: SearchedFoodItem[];
    disabled?: boolean;
    onChoose: (candidate: SearchedFoodItem) => void;
};

export function BarcodeResultList({ candidates, disabled = false, onChoose }: BarcodeResultListProps) {
    const theme = useAppTheme();

    return (
        <View style={styles.results}>
            {candidates.map((candidate) => (
                <Pressable
                    key={`${candidate.source ?? 'food'}:${candidate.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose ${candidate.name}`}
                    disabled={disabled}
                    onPress={() => onChoose(candidate)}
                    style={({ pressed }) => [
                        styles.resultRow,
                        {
                            minHeight: theme.interaction.minimumTouchTarget,
                            borderWidth: theme.stroke.control,
                            borderColor: theme.colors.outlineVariant,
                            backgroundColor: theme.colors.surfaceContainer
                        },
                        pressed && styles.pressed
                    ]}
                >
                    <View style={styles.resultText}>
                        <AppText variant="body" numberOfLines={2}>{candidate.name}</AppText>
                        <AppText variant="caption" numberOfLines={2}>
                            {candidate.brand
                                ?? `${candidate.measures.length} serving option${candidate.measures.length === 1 ? '' : 's'}`}
                        </AppText>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.onSurfaceVariant} />
                </Pressable>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    results: {
        gap: spacing.sm
    },
    resultRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        borderRadius: radius.md,
        padding: spacing.md
    },
    resultText: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs
    },
    pressed: {
        opacity: 0.82
    }
});
