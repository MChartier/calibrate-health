import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MyFoodSummary } from '@calibrate/api-client';
import { AppButton } from '../src/components/AppButton';
import { AppCard } from '../src/components/AppCard';
import { AppChip } from '../src/components/AppChip';
import { AppText } from '../src/components/AppText';
import { BottomSheetModal } from '../src/components/BottomSheetModal';
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

type MyFoodSheet = 'food' | 'recipe' | null;

const SERVING_STEP = 0.1; // Saved food and recipe servings use the same precision as food logging.
const INGREDIENT_STEP = 0.1;

export default function MyFoodsScreen() {
    const { api } = useAuth();
    const queryClient = useQueryClient();
    const myFoodsQuery = useQuery({ queryKey: ['mobile-my-foods'], queryFn: () => api.getMyFoods() });
    const [activeSheet, setActiveSheet] = useState<MyFoodSheet>(null);
    const [foodName, setFoodName] = useState('');
    const [servingQuantity, setServingQuantity] = useState('1');
    const [servingUnit, setServingUnit] = useState('serving');
    const [caloriesPerServing, setCaloriesPerServing] = useState('');
    const [recipeName, setRecipeName] = useState('');
    const [recipeYield, setRecipeYield] = useState('1');
    const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredientDraft[]>([]);

    const allFoods = myFoodsQuery.data ?? [];
    const savedFoods = useMemo(
        () => allFoods.filter((item) => item.type === 'FOOD'),
        [allFoods]
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
            setActiveSheet(null);
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
            setActiveSheet(null);
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
                    servings: Math.max(SERVING_STEP, Math.round((ingredient.servings + delta) * 10) / 10)
                };
            })
        );
    }

    return (
        <Screen>
            <SectionHeader title="My Foods" description="Saved foods and recipes for fast logging." />

            <AppCard>
                <View style={styles.cardHeader}>
                    <View style={styles.headerText}>
                        <AppText variant="screenTitle">Saved library</AppText>
                        <AppText variant="caption">{allFoods.length} foods and recipes</AppText>
                    </View>
                    <View style={styles.headerActions}>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Create saved food"
                            onPress={() => setActiveSheet('food')}
                            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                        >
                            <Ionicons name="add" size={20} color={colors.primaryDark} />
                        </Pressable>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Create recipe"
                            onPress={() => setActiveSheet('recipe')}
                            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                        >
                            <Ionicons name="restaurant-outline" size={20} color={colors.primaryDark} />
                        </Pressable>
                    </View>
                </View>

                <View style={styles.libraryList}>
                    {allFoods.map((item) => (
                        <View key={item.id} style={styles.libraryRow}>
                            <View style={styles.libraryText}>
                                <AppText variant="body" numberOfLines={1}>{item.name}</AppText>
                                <AppText variant="caption" numberOfLines={1}>
                                    {formatCalories(item.calories_per_serving)} per {item.serving_size_quantity} {item.serving_unit_label}
                                </AppText>
                            </View>
                            <View style={styles.typePill}>
                                <AppText style={styles.typeText}>{item.type === 'RECIPE' ? 'Recipe' : 'Food'}</AppText>
                            </View>
                        </View>
                    ))}
                    {myFoodsQuery.isLoading && <AppText variant="muted">Loading saved foods...</AppText>}
                    {!myFoodsQuery.isLoading && allFoods.length === 0 && <AppText variant="muted">No saved foods yet.</AppText>}
                    {myFoodsQuery.error && <AppText style={styles.error}>{myFoodsQuery.error.message}</AppText>}
                </View>
            </AppCard>

            <BottomSheetModal visible={activeSheet === 'food'} onRequestClose={() => setActiveSheet(null)}>
                <SectionHeader title="New food" description="Create a reusable food with calories per serving." />
                <TextField label="Name" value={foodName} onChangeText={setFoodName} />
                <View style={styles.row}>
                    <NumberStepperField
                        label="Serving"
                        value={servingQuantity}
                        onChangeText={setServingQuantity}
                        step={SERVING_STEP}
                        min={SERVING_STEP}
                        containerStyle={styles.field}
                    />
                    <TextField label="Unit" value={servingUnit} onChangeText={setServingUnit} containerStyle={styles.field} />
                </View>
                <NumberStepperField
                    label="Calories per serving"
                    value={caloriesPerServing}
                    onChangeText={setCaloriesPerServing}
                    step={25}
                    min={0}
                    suffix="kcal"
                />
                {createFood.error && <AppText style={styles.error}>{createFood.error.message}</AppText>}
                <View style={styles.row}>
                    <AppButton
                        title="Cancel"
                        variant="secondary"
                        leftIcon={<Ionicons name="close" size={18} color={colors.text} />}
                        onPress={() => setActiveSheet(null)}
                        style={styles.field}
                    />
                    <AppButton
                        title={createFood.isPending ? 'Saving...' : 'Save food'}
                        disabled={!canCreateFood || createFood.isPending}
                        leftIcon={<Ionicons name="checkmark" size={18} color="#ffffff" />}
                        onPress={() => createFood.mutate()}
                        style={styles.field}
                    />
                </View>
            </BottomSheetModal>

            <BottomSheetModal visible={activeSheet === 'recipe'} onRequestClose={() => setActiveSheet(null)}>
                <SectionHeader title="Recipe builder" description="Combine saved foods into a reusable recipe." />
                <TextField label="Recipe name" value={recipeName} onChangeText={setRecipeName} />
                <NumberStepperField label="Yield servings" value={recipeYield} onChangeText={setRecipeYield} step={1} min={1} />
                <AppText variant="label">Ingredients</AppText>
                <View style={styles.chips}>
                    {savedFoods.slice(0, 12).map((item) => (
                        <AppChip key={item.id} label={item.name} onPress={() => addRecipeIngredient(item)} />
                    ))}
                </View>
                {savedFoods.length === 0 && <AppText variant="muted">Create a saved food first, then add it to a recipe.</AppText>}
                {recipeIngredients.map((ingredient, index) => (
                    <View key={`${ingredient.myFood.id}-${index}`} style={styles.ingredientRow}>
                        <View style={styles.libraryText}>
                            <AppText variant="body" numberOfLines={1}>{ingredient.myFood.name}</AppText>
                            <AppText variant="caption">{formatCalories(ingredient.myFood.calories_per_serving * ingredient.servings)}</AppText>
                        </View>
                        <View style={styles.stepper}>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Decrease ${ingredient.myFood.name} servings`}
                                onPress={() => adjustRecipeIngredientServings(index, -INGREDIENT_STEP)}
                                style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
                            >
                                <Ionicons name="remove" size={16} color={colors.text} />
                            </Pressable>
                            <AppText variant="label">{ingredient.servings}x</AppText>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Increase ${ingredient.myFood.name} servings`}
                                onPress={() => adjustRecipeIngredientServings(index, INGREDIENT_STEP)}
                                style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
                            >
                                <Ionicons name="add" size={16} color={colors.text} />
                            </Pressable>
                        </View>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${ingredient.myFood.name}`}
                            onPress={() => setRecipeIngredients((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                            style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
                        >
                            <Ionicons name="close" size={18} color={colors.danger} />
                        </Pressable>
                    </View>
                ))}
                {createRecipe.error && <AppText style={styles.error}>{createRecipe.error.message}</AppText>}
                <View style={styles.row}>
                    <AppButton
                        title="Cancel"
                        variant="secondary"
                        leftIcon={<Ionicons name="close" size={18} color={colors.text} />}
                        onPress={() => setActiveSheet(null)}
                        style={styles.field}
                    />
                    <AppButton
                        title={createRecipe.isPending ? 'Saving...' : 'Save recipe'}
                        disabled={!canCreateRecipe || createRecipe.isPending}
                        leftIcon={<Ionicons name="checkmark" size={18} color="#ffffff" />}
                        onPress={() => createRecipe.mutate()}
                        style={styles.field}
                    />
                </View>
            </BottomSheetModal>
        </Screen>
    );
}

const styles = StyleSheet.create({
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.md
    },
    headerText: {
        flex: 1,
        minWidth: 0,
        gap: spacing.xs
    },
    headerActions: {
        flexDirection: 'row',
        gap: spacing.sm
    },
    iconButton: {
        width: 42,
        height: 42,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primarySoft,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth
    },
    libraryList: {
        gap: spacing.sm
    },
    libraryRow: {
        minHeight: 58,
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
    typePill: {
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceAlt,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs
    },
    typeText: {
        color: colors.muted,
        fontSize: 12,
        fontWeight: '800'
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
    pressed: {
        backgroundColor: colors.surfacePressed
    },
    error: {
        color: colors.danger
    }
});
