import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
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
import { sortMyFoodsPinnedFirst } from '../src/utils/myFoods';
import {
    hydrateRecipeIngredientDrafts,
    serializeRecipeIngredientDrafts,
    type RecipeIngredientDraft
} from '../src/utils/myFoodEditing';
import { colors, radius, spacing } from '../src/theme';

type MyFoodSheet = 'food' | 'recipe' | null;

const SERVING_STEP = 0.1; // Saved food and recipe servings use the same precision as food logging.
const INGREDIENT_STEP = 0.1;

export default function MyFoodsScreen() {
    const { api } = useAuth();
    const queryClient = useQueryClient();
    const myFoodsQuery = useQuery({ queryKey: ['mobile-my-foods'], queryFn: () => api.getMyFoods() });
    const [activeSheet, setActiveSheet] = useState<MyFoodSheet>(null);
    const [editingItem, setEditingItem] = useState<MyFoodSummary | null>(null);
    const [foodName, setFoodName] = useState('');
    const [servingQuantity, setServingQuantity] = useState('1');
    const [servingUnit, setServingUnit] = useState('serving');
    const [caloriesPerServing, setCaloriesPerServing] = useState('');
    const [recipeName, setRecipeName] = useState('');
    const [recipeYield, setRecipeYield] = useState('1');
    const [recipeServingQuantity, setRecipeServingQuantity] = useState('1');
    const [recipeServingUnit, setRecipeServingUnit] = useState('serving');
    const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredientDraft[]>([]);

    const allFoods = myFoodsQuery.data ?? [];
    const savedFoods = useMemo(
        () => allFoods.filter((item) => item.type === 'FOOD'),
        [allFoods]
    );

    const saveFood = useMutation({
        mutationFn: () =>
            (editingItem ? api.updateMyFood(editingItem.id, {
                name: foodName.trim(),
                serving_size_quantity: Number(servingQuantity),
                serving_unit_label: servingUnit.trim(),
                calories_per_serving: Number(caloriesPerServing)
            }) : api.createMyFood({
                name: foodName.trim(),
                serving_size_quantity: Number(servingQuantity),
                serving_unit_label: servingUnit.trim(),
                calories_per_serving: Number(caloriesPerServing)
            })),
        onSuccess: async () => {
            closeEditor();
            await queryClient.invalidateQueries({ queryKey: ['mobile-my-foods'] });
        }
    });

    const saveRecipe = useMutation({
        mutationFn: () =>
            (editingItem ? api.updateMyFood(editingItem.id, {
                name: recipeName.trim(),
                serving_size_quantity: Number(recipeServingQuantity),
                serving_unit_label: recipeServingUnit.trim(),
                yield_servings: Number(recipeYield),
                ingredients: serializeRecipeIngredientDrafts(recipeIngredients)
            }) : api.createRecipe({
                name: recipeName.trim(),
                serving_size_quantity: Number(recipeServingQuantity),
                serving_unit_label: recipeServingUnit.trim(),
                yield_servings: Number(recipeYield),
                ingredients: serializeRecipeIngredientDrafts(recipeIngredients)
            })),
        onSuccess: async () => {
            closeEditor();
            await queryClient.invalidateQueries({ queryKey: ['mobile-my-foods'] });
        }
    });

    const loadRecipe = useMutation({
        mutationFn: (item: MyFoodSummary) => api.getMyFood(item.id),
        onSuccess: (detail) => {
            setRecipeName(detail.name);
            setRecipeServingQuantity(String(detail.serving_size_quantity));
            setRecipeServingUnit(detail.serving_unit_label);
            setRecipeYield(String(detail.yield_servings ?? 1));
            setRecipeIngredients(hydrateRecipeIngredientDrafts(detail, savedFoods));
        }
    });

    const deleteItem = useMutation({
        mutationFn: (item: MyFoodSummary) => api.deleteMyFood(item.id),
        onSuccess: async (_result, item) => {
            queryClient.setQueryData<MyFoodSummary[]>(['mobile-my-foods'], (current = []) =>
                current.filter(({ id }) => id !== item.id)
            );
            closeEditor();
            await queryClient.invalidateQueries({ queryKey: ['mobile-my-foods'] });
        }
    });

    const setPinned = useMutation({
        mutationFn: (item: MyFoodSummary) => api.setMyFoodPinned(item.id, !item.is_pinned),
        onSuccess: (updated) => {
            queryClient.setQueryData<MyFoodSummary[]>(['mobile-my-foods'], (current = []) =>
                sortMyFoodsPinnedFirst(current.map((item) => item.id === updated.id ? updated : item))
            );
        },
        onSettled: async () => {
            await queryClient.invalidateQueries({ queryKey: ['mobile-my-foods'] });
        }
    });

    const canSaveFood = foodName.trim().length > 0 &&
        Number(servingQuantity) > 0 &&
        servingUnit.trim().length > 0 &&
        Number(caloriesPerServing) >= 0;
    const canSaveRecipe = recipeName.trim().length > 0 &&
        Number(recipeServingQuantity) > 0 &&
        recipeServingUnit.trim().length > 0 &&
        Number(recipeYield) > 0 &&
        recipeIngredients.length > 0;

    function closeEditor() {
        setActiveSheet(null);
        setEditingItem(null);
        setFoodName('');
        setServingQuantity('1');
        setServingUnit('serving');
        setCaloriesPerServing('');
        setRecipeName('');
        setRecipeServingQuantity('1');
        setRecipeServingUnit('serving');
        setRecipeYield('1');
        setRecipeIngredients([]);
        saveFood.reset();
        saveRecipe.reset();
        loadRecipe.reset();
    }

    function openNew(sheet: Exclude<MyFoodSheet, null>) {
        closeEditor();
        setActiveSheet(sheet);
    }

    function openEditor(item: MyFoodSummary) {
        closeEditor();
        setEditingItem(item);
        setActiveSheet(item.type === 'FOOD' ? 'food' : 'recipe');
        if (item.type === 'FOOD') {
            setFoodName(item.name);
            setServingQuantity(String(item.serving_size_quantity));
            setServingUnit(item.serving_unit_label);
            setCaloriesPerServing(String(item.calories_per_serving));
        } else {
            loadRecipe.mutate(item);
        }
    }

    function confirmDelete() {
        if (!editingItem) return;
        Alert.alert(
            `Delete ${editingItem.name}?`,
            'Past food logs keep their saved names, calories, and serving snapshots. This library item cannot be restored.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteItem.mutate(editingItem) }
            ]
        );
    }

    function addRecipeIngredient(myFood: MyFoodSummary) {
        setRecipeIngredients((current) => [...current, {
            key: `new-${myFood.id}-${Date.now()}-${current.length}`,
            source: 'MY_FOOD',
            myFood,
            servings: 1
        }]);
    }

    function adjustRecipeIngredientServings(index: number, delta: number) {
        setRecipeIngredients((current) =>
            current.map((ingredient, currentIndex) => {
                if (currentIndex !== index) return ingredient;
                if (ingredient.source !== 'MY_FOOD') return ingredient;
                return {
                    ...ingredient,
                    servings: Math.max(SERVING_STEP, Math.round((ingredient.servings + delta) * 10) / 10)
                };
            })
        );
    }

    return (
        <Screen>
            <SectionHeader headingLevel={1} title="My Foods" description="Saved foods and recipes for fast logging." />

            <AppCard>
                <View style={styles.cardHeader}>
                    <View style={styles.headerText}>
                        <AppText accessibilityRole="header" aria-level={2} variant="screenTitle">Saved library</AppText>
                        <AppText variant="caption">{allFoods.length} foods and recipes</AppText>
                    </View>
                    <View style={styles.headerActions}>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Create saved food"
                            onPress={() => openNew('food')}
                            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                        >
                            <Ionicons name="add" size={20} color={colors.primaryDark} />
                        </Pressable>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Create recipe"
                            onPress={() => openNew('recipe')}
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
                            <View style={styles.libraryActions}>
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`Edit ${item.name}`}
                                    onPress={() => openEditor(item)}
                                    style={({ pressed }) => [styles.pinButton, pressed && styles.pressed]}
                                >
                                    <Ionicons name="create-outline" size={19} color={colors.text} />
                                </Pressable>
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`${item.is_pinned ? 'Unpin' : 'Pin'} ${item.name}`}
                                    disabled={setPinned.isPending && setPinned.variables?.id === item.id}
                                    onPress={() => setPinned.mutate(item)}
                                    style={({ pressed }) => [styles.pinButton, pressed && styles.pressed]}
                                >
                                    <Ionicons
                                        name={item.is_pinned ? 'star' : 'star-outline'}
                                        size={19}
                                        color={item.is_pinned ? colors.primary : colors.muted}
                                    />
                                </Pressable>
                                <View style={styles.typePill}>
                                    <AppText style={styles.typeText}>{item.type === 'RECIPE' ? 'Recipe' : 'Food'}</AppText>
                                </View>
                            </View>
                        </View>
                    ))}
                    {myFoodsQuery.isLoading && <AppText variant="muted">Loading saved foods...</AppText>}
                    {!myFoodsQuery.isLoading && allFoods.length === 0 && <AppText variant="muted">No saved foods yet.</AppText>}
                    {myFoodsQuery.error && <AppText style={styles.error}>{myFoodsQuery.error.message}</AppText>}
                    {setPinned.error && <AppText style={styles.error}>{setPinned.error.message}</AppText>}
                </View>
            </AppCard>

            <BottomSheetModal visible={activeSheet === 'food'} onRequestClose={closeEditor}>
                <SectionHeader
                    title={editingItem ? 'Edit food' : 'New food'}
                    description="Saved food edits do not rewrite existing food logs."
                />
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
                {saveFood.error && <AppText style={styles.error}>{saveFood.error.message}</AppText>}
                {deleteItem.error && <AppText style={styles.error}>{deleteItem.error.message}</AppText>}
                {editingItem && (
                    <AppButton
                        title={deleteItem.isPending ? 'Deleting...' : 'Delete food'}
                        variant="danger"
                        disabled={deleteItem.isPending || saveFood.isPending}
                        leftIcon={<Ionicons name="trash-outline" size={18} color="#ffffff" />}
                        onPress={confirmDelete}
                    />
                )}
                <View style={styles.row}>
                    <AppButton
                        title="Cancel"
                        variant="secondary"
                        leftIcon={<Ionicons name="close" size={18} color={colors.text} />}
                        onPress={closeEditor}
                        style={styles.field}
                    />
                    <AppButton
                        title={saveFood.isPending ? 'Saving...' : 'Save food'}
                        disabled={!canSaveFood || saveFood.isPending || deleteItem.isPending}
                        leftIcon={<Ionicons name="checkmark" size={18} color="#ffffff" />}
                        onPress={() => saveFood.mutate()}
                        style={styles.field}
                    />
                </View>
            </BottomSheetModal>

            <BottomSheetModal visible={activeSheet === 'recipe'} onRequestClose={closeEditor}>
                <SectionHeader
                    title={editingItem ? 'Edit recipe' : 'Recipe builder'}
                    description="Recipe edits create new ingredient snapshots without changing past logs."
                />
                <TextField label="Recipe name" value={recipeName} onChangeText={setRecipeName} />
                <View style={styles.row}>
                    <NumberStepperField
                        label="Serving"
                        value={recipeServingQuantity}
                        onChangeText={setRecipeServingQuantity}
                        step={SERVING_STEP}
                        min={SERVING_STEP}
                        containerStyle={styles.field}
                    />
                    <TextField
                        label="Unit"
                        value={recipeServingUnit}
                        onChangeText={setRecipeServingUnit}
                        containerStyle={styles.field}
                    />
                </View>
                <NumberStepperField label="Yield servings" value={recipeYield} onChangeText={setRecipeYield} step={1} min={1} />
                {loadRecipe.isPending && <AppText variant="muted">Loading recipe snapshots...</AppText>}
                {loadRecipe.error && <AppText style={styles.error}>{loadRecipe.error.message}</AppText>}
                <AppText variant="label">Ingredients</AppText>
                <View style={styles.chips}>
                    {savedFoods.slice(0, 12).map((item) => (
                        <AppChip key={item.id} label={item.name} onPress={() => addRecipeIngredient(item)} />
                    ))}
                </View>
                {savedFoods.length === 0 && <AppText variant="muted">Create a saved food first, then add it to a recipe.</AppText>}
                {recipeIngredients.map((ingredient, index) => (
                    <View key={ingredient.key} style={styles.ingredientRow}>
                        <View style={styles.libraryText}>
                            <AppText variant="body" numberOfLines={1}>
                                {ingredient.source === 'MY_FOOD' ? ingredient.myFood.name : ingredient.name}
                            </AppText>
                            <AppText variant="caption">
                                {formatCalories(ingredient.source === 'MY_FOOD'
                                    ? ingredient.myFood.calories_per_serving * ingredient.servings
                                    : ingredient.caloriesTotal)}
                            </AppText>
                        </View>
                        {ingredient.source === 'MY_FOOD' && <View style={styles.stepper}>
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
                        </View>}
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${ingredient.source === 'MY_FOOD' ? ingredient.myFood.name : ingredient.name}`}
                            onPress={() => setRecipeIngredients((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                            style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
                        >
                            <Ionicons name="close" size={18} color={colors.danger} />
                        </Pressable>
                    </View>
                ))}
                {saveRecipe.error && <AppText style={styles.error}>{saveRecipe.error.message}</AppText>}
                {deleteItem.error && <AppText style={styles.error}>{deleteItem.error.message}</AppText>}
                {editingItem && (
                    <AppButton
                        title={deleteItem.isPending ? 'Deleting...' : 'Delete recipe'}
                        variant="danger"
                        disabled={deleteItem.isPending || saveRecipe.isPending}
                        leftIcon={<Ionicons name="trash-outline" size={18} color="#ffffff" />}
                        onPress={confirmDelete}
                    />
                )}
                <View style={styles.row}>
                    <AppButton
                        title="Cancel"
                        variant="secondary"
                        leftIcon={<Ionicons name="close" size={18} color={colors.text} />}
                        onPress={closeEditor}
                        style={styles.field}
                    />
                    <AppButton
                        title={saveRecipe.isPending ? 'Saving...' : 'Save recipe'}
                        disabled={!canSaveRecipe || saveRecipe.isPending || deleteItem.isPending || loadRecipe.isPending}
                        leftIcon={<Ionicons name="checkmark" size={18} color="#ffffff" />}
                        onPress={() => saveRecipe.mutate()}
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
    libraryActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm
    },
    pinButton: {
        width: 38,
        height: 38,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceAlt
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
