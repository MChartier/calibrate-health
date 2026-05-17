import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MyFoodSummary } from '@calibrate/api-client';
import { AppButton } from '../src/components/AppButton';
import { AppCard } from '../src/components/AppCard';
import { AppChip } from '../src/components/AppChip';
import { AppText } from '../src/components/AppText';
import { NumberStepperField } from '../src/components/NumberStepperField';
import { Screen } from '../src/components/Screen';
import { SectionHeader } from '../src/components/SectionHeader';
import { TextField } from '../src/components/TextField';
import { useAuth } from '../src/auth/AuthContext';
import { formatCalories } from '../src/utils/format';
import { colors, radius, spacing } from '../src/theme';

type RecipeIngredientDraft = {
    myFood: MyFoodSummary;
    servings: number;
};

export default function MyFoodsScreen() {
    const { api } = useAuth();
    const queryClient = useQueryClient();
    const myFoodsQuery = useQuery({ queryKey: ['mobile-my-foods'], queryFn: () => api.getMyFoods() });
    const [foodName, setFoodName] = useState('');
    const [servingQuantity, setServingQuantity] = useState('1');
    const [servingUnit, setServingUnit] = useState('serving');
    const [caloriesPerServing, setCaloriesPerServing] = useState('');
    const [recipeName, setRecipeName] = useState('');
    const [recipeYield, setRecipeYield] = useState('1');
    const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredientDraft[]>([]);

    const savedFoods = useMemo(
        () => (myFoodsQuery.data ?? []).filter((item) => item.type === 'FOOD'),
        [myFoodsQuery.data]
    );

    const createFood = useMutation({
        mutationFn: () =>
            api.createMyFood({
                name: foodName.trim(),
                serving_size_quantity: Number(servingQuantity),
                serving_unit_label: servingUnit.trim(),
                calories_per_serving: Number(caloriesPerServing)
            }),
        onSuccess: async () => {
            setFoodName('');
            setServingQuantity('1');
            setServingUnit('serving');
            setCaloriesPerServing('');
            await queryClient.invalidateQueries({ queryKey: ['mobile-my-foods'] });
        }
    });

    const createRecipe = useMutation({
        mutationFn: () =>
            api.createRecipe({
                name: recipeName.trim(),
                serving_size_quantity: 1,
                serving_unit_label: 'serving',
                yield_servings: Number(recipeYield),
                ingredients: recipeIngredients.map((ingredient, index) => ({
                    source: 'MY_FOOD',
                    sort_order: index + 1,
                    my_food_id: ingredient.myFood.id,
                    quantity_servings: ingredient.servings
                }))
            }),
        onSuccess: async () => {
            setRecipeName('');
            setRecipeYield('1');
            setRecipeIngredients([]);
            await queryClient.invalidateQueries({ queryKey: ['mobile-my-foods'] });
        }
    });

    const canCreateFood = foodName.trim().length > 0 &&
        Number(servingQuantity) > 0 &&
        servingUnit.trim().length > 0 &&
        Number(caloriesPerServing) >= 0;
    const canCreateRecipe = recipeName.trim().length > 0 && Number(recipeYield) > 0 && recipeIngredients.length > 0;

    function addRecipeIngredient(myFood: MyFoodSummary) {
        setRecipeIngredients((current) => [...current, { myFood, servings: 1 }]);
    }

    function adjustRecipeIngredientServings(index: number, delta: number) {
        setRecipeIngredients((current) =>
            current.map((ingredient, currentIndex) => {
                if (currentIndex !== index) return ingredient;
                return {
                    ...ingredient,
                    servings: Math.max(0.5, ingredient.servings + delta)
                };
            })
        );
    }

    return (
        <Screen>
            <SectionHeader title="My Foods" description="Saved foods and recipes for fast logging." />

            <AppCard>
                <SectionHeader title="Saved library" description={`${myFoodsQuery.data?.length ?? 0} foods and recipes.`} />
                {(myFoodsQuery.data ?? []).map((item) => (
                    <View key={item.id} style={styles.libraryRow}>
                        <View style={styles.libraryText}>
                            <AppText variant="body">{item.name}</AppText>
                            <AppText variant="caption">
                                {item.type === 'RECIPE' ? 'Recipe' : 'Food'} | {formatCalories(item.calories_per_serving)} per {item.serving_size_quantity} {item.serving_unit_label}
                            </AppText>
                        </View>
                        <AppText variant="label">{item.type}</AppText>
                    </View>
                ))}
                {(myFoodsQuery.data ?? []).length === 0 && <AppText variant="muted">No saved foods yet.</AppText>}
            </AppCard>

            <AppCard>
                <SectionHeader title="New food" description="Create a reusable food with calories per serving." />
                <TextField label="Name" value={foodName} onChangeText={setFoodName} />
                <View style={styles.row}>
                    <NumberStepperField label="Serving" value={servingQuantity} onChangeText={setServingQuantity} step={0.5} min={0.5} containerStyle={styles.field} />
                    <TextField label="Unit" value={servingUnit} onChangeText={setServingUnit} containerStyle={styles.field} />
                </View>
                <NumberStepperField label="Calories per serving" value={caloriesPerServing} onChangeText={setCaloriesPerServing} step={25} min={0} suffix="kcal" />
                {createFood.error && <AppText style={styles.error}>{createFood.error.message}</AppText>}
                <AppButton
                    title={createFood.isPending ? 'Saving...' : 'Save food'}
                    disabled={!canCreateFood || createFood.isPending}
                    leftIcon={<Ionicons name="add" size={18} color="#ffffff" />}
                    onPress={() => createFood.mutate()}
                />
            </AppCard>

            <AppCard>
                <SectionHeader title="Recipe builder" description="Combine saved foods into a reusable recipe snapshot." />
                <TextField label="Recipe name" value={recipeName} onChangeText={setRecipeName} />
                <NumberStepperField label="Yield servings" value={recipeYield} onChangeText={setRecipeYield} step={1} min={1} />
                <AppText variant="label">Add ingredients</AppText>
                <View style={styles.chips}>
                    {savedFoods.slice(0, 12).map((item) => (
                        <AppChip key={item.id} label={item.name} onPress={() => addRecipeIngredient(item)} />
                    ))}
                </View>
                {recipeIngredients.map((ingredient, index) => (
                    <View key={`${ingredient.myFood.id}-${index}`} style={styles.ingredientRow}>
                        <View style={styles.libraryText}>
                            <AppText variant="body">{ingredient.myFood.name}</AppText>
                            <AppText variant="caption">{formatCalories(ingredient.myFood.calories_per_serving * ingredient.servings)}</AppText>
                        </View>
                        <View style={styles.stepper}>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Decrease ${ingredient.myFood.name} servings`}
                                onPress={() => adjustRecipeIngredientServings(index, -0.5)}
                                style={styles.stepperButton}
                            >
                                <Ionicons name="remove" size={16} color={colors.text} />
                            </Pressable>
                            <AppText variant="label">{ingredient.servings}x</AppText>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Increase ${ingredient.myFood.name} servings`}
                                onPress={() => adjustRecipeIngredientServings(index, 0.5)}
                                style={styles.stepperButton}
                            >
                                <Ionicons name="add" size={16} color={colors.text} />
                            </Pressable>
                        </View>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${ingredient.myFood.name}`}
                            onPress={() => setRecipeIngredients((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                            style={styles.removeButton}
                        >
                            <Ionicons name="close" size={18} color={colors.danger} />
                        </Pressable>
                    </View>
                ))}
                {createRecipe.error && <AppText style={styles.error}>{createRecipe.error.message}</AppText>}
                <AppButton
                    title={createRecipe.isPending ? 'Saving...' : 'Save recipe'}
                    disabled={!canCreateRecipe || createRecipe.isPending}
                    leftIcon={<Ionicons name="restaurant-outline" size={18} color="#ffffff" />}
                    onPress={() => createRecipe.mutate()}
                />
            </AppCard>
        </Screen>
    );
}

const styles = StyleSheet.create({
    libraryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        borderTopColor: colors.border,
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingTop: spacing.md
    },
    libraryText: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs
    },
    row: {
        flexDirection: 'row',
        gap: spacing.md
    },
    field: {
        flex: 1
    },
    chips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm
    },
    ingredientRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceAlt,
        padding: spacing.md
    },
    stepper: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs
    },
    stepperButton: {
        width: 32,
        height: 32,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface
    },
    removeButton: {
        width: 36,
        height: 36,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface
    },
    error: {
        color: colors.danger
    }
});
