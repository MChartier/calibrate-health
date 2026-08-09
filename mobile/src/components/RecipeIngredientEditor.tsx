import React, { useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { MyFoodSummary } from '@calibrate/api-client';
import { SERVING_INPUT_INCREMENT } from '../config/inputPrecision';
import { formatCalories } from '../utils/format';
import type { RecipeIngredientDraft } from '../utils/myFoodEditing';
import { type AppTheme, useAppTheme } from '../theme';
import { AppIconButton } from './AppIconButton';
import { AppText } from './AppText';
import { RecipeIngredientSelector } from './RecipeIngredientSelector';

type RecipeIngredientEditorProps = {
    enabled: boolean;
    ingredients: RecipeIngredientDraft[];
    onChange: React.Dispatch<React.SetStateAction<RecipeIngredientDraft[]>>;
};

/** Owns scalable ingredient selection while preserving the recipe editor's row controls. */
export const RecipeIngredientEditor: React.FC<RecipeIngredientEditorProps> = ({
    enabled,
    ingredients,
    onChange
}) => {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const nextKey = useRef(0);

    function addIngredient(myFood: MyFoodSummary) {
        onChange((current) => {
            nextKey.current += 1;
            return [...current, {
                key: `new-${myFood.id}-${nextKey.current}`,
                source: 'MY_FOOD',
                myFood,
                servings: 1
            }];
        });
    }

    function adjustServings(index: number, delta: number) {
        onChange((current) => current.map((ingredient, currentIndex) => {
            if (currentIndex !== index || ingredient.source !== 'MY_FOOD') return ingredient;
            return {
                ...ingredient,
                servings: Math.max(
                    SERVING_INPUT_INCREMENT,
                    Math.round((ingredient.servings + delta) / SERVING_INPUT_INCREMENT) * SERVING_INPUT_INCREMENT
                )
            };
        }));
    }

    const mergeLibraryItems = useCallback((items: MyFoodSummary[]) => {
        const itemsById = new Map(items.map((item) => [item.id, item]));
        onChange((current) => {
            let changed = false;
            const merged = current.map((ingredient) => {
                if (ingredient.source !== 'MY_FOOD') return ingredient;
                const currentSummary = itemsById.get(ingredient.myFood.id);
                if (!currentSummary || currentSummary === ingredient.myFood) return ingredient;
                changed = true;
                return { ...ingredient, myFood: currentSummary };
            });
            return changed ? merged : current;
        });
    }, [onChange]);

    return (
        <View style={styles.root}>
            <AppText variant="label">Ingredients</AppText>
            <RecipeIngredientSelector
                enabled={enabled}
                onAddIngredient={addIngredient}
                onLibraryItems={mergeLibraryItems}
            />
            {ingredients.map((ingredient, index) => {
                const name = ingredient.source === 'MY_FOOD' ? ingredient.myFood.name : ingredient.name;
                const calories = ingredient.source === 'MY_FOOD'
                    ? ingredient.myFood.calories_per_serving * ingredient.servings
                    : ingredient.caloriesTotal;
                return (
                    <View key={ingredient.key} style={styles.ingredientRow}>
                        <View style={styles.ingredientText}>
                            <AppText variant="body" numberOfLines={1}>{name}</AppText>
                            <AppText variant="caption">{formatCalories(calories)}</AppText>
                        </View>
                        {ingredient.source === 'MY_FOOD' && (
                            <View style={styles.stepper}>
                                <AppIconButton
                                    icon="remove"
                                    iconSize={16}
                                    accessibilityLabel={`Decrease ${name} servings`}
                                    variant="surface"
                                    onPress={() => adjustServings(index, -SERVING_INPUT_INCREMENT)}
                                />
                                <AppText variant="label">{ingredient.servings}x</AppText>
                                <AppIconButton
                                    icon="add"
                                    iconSize={16}
                                    accessibilityLabel={`Increase ${name} servings`}
                                    variant="surface"
                                    onPress={() => adjustServings(index, SERVING_INPUT_INCREMENT)}
                                />
                            </View>
                        )}
                        <AppIconButton
                            icon="close"
                            accessibilityLabel={`Remove ${name}`}
                            iconColor={theme.colors.danger}
                            onPress={() => onChange((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                        />
                    </View>
                );
            })}
        </View>
    );
};

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        root: {
            gap: theme.spacing.md
        },
        ingredientRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surfaceContainer,
            padding: theme.spacing.md
        },
        ingredientText: {
            flex: 1,
            minWidth: 0,
            gap: theme.spacing.xs
        },
        stepper: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs
        }
    });
}
