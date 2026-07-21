import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MyFoodSummary } from '@calibrate/api-client';
import { AppButton } from '../src/components/AppButton';
import { AppCard } from '../src/components/AppCard';
import { AppChip } from '../src/components/AppChip';
import { AppIconButton } from '../src/components/AppIconButton';
import { AppText } from '../src/components/AppText';
import { BottomSheetModal } from '../src/components/BottomSheetModal';
import { NumberStepperField } from '../src/components/NumberStepperField';
import { PageHeader } from '../src/components/PageHeader';
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
import { radius, spacing, useAppTheme, type AppTheme } from '../src/theme';
import { SERVING_INPUT_INCREMENT } from '../src/config/inputPrecision';

type MyFoodSheet = 'food' | 'recipe' | null;

export default function MyFoodsScreen() {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
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
                    servings: Math.max(
                        SERVING_INPUT_INCREMENT,
                        Math.round((ingredient.servings + delta) / SERVING_INPUT_INCREMENT) * SERVING_INPUT_INCREMENT
                    )
                };
            })
        );
    }

    return (
        <Screen>
            <PageHeader
                title="My Foods"
                description="Saved foods and recipes for fast logging."
                onBack={() => router.back()}
            />

            <AppCard>
                <View style={styles.cardHeader}>
                    <View style={styles.headerText}>
                        <AppText accessibilityRole="header" aria-level={2} variant="subtitle">Saved library</AppText>
                        <AppText variant="caption">{allFoods.length} foods and recipes</AppText>
                    </View>
                    <View style={styles.headerActions}>
                        <AppIconButton
                            icon="add"
                            accessibilityLabel="Create saved food"
                            variant="container"
                            onPress={() => openNew('food')}
                        />
                        <AppIconButton
                            icon="restaurant-outline"
                            accessibilityLabel="Create recipe"
                            variant="container"
                            onPress={() => openNew('recipe')}
                        />
                    </View>
                </View>

                <View style={styles.libraryList}>
                    {allFoods.map((item) => (
                        <View key={item.id} style={styles.libraryRow}>
                            <View style={styles.libraryText}>
                                <AppText variant="body" numberOfLines={1}>{item.name}</AppText>
                                <AppText variant="caption" numberOfLines={1}>
                                    {item.type === 'RECIPE' ? 'Recipe' : 'Food'} | {formatCalories(item.calories_per_serving)} per {item.serving_size_quantity} {item.serving_unit_label}
                                </AppText>
                            </View>
                            <View style={styles.libraryActions}>
                                <AppIconButton
                                    icon="create-outline"
                                    accessibilityLabel={`Edit ${item.name}`}
                                    iconColor={theme.colors.onSurface}
                                    onPress={() => openEditor(item)}
                                />
                                <AppIconButton
                                    icon={item.is_pinned ? 'star' : 'star-outline'}
                                    accessibilityLabel={`${item.is_pinned ? 'Unpin' : 'Pin'} ${item.name}`}
                                    disabled={setPinned.isPending && setPinned.variables?.id === item.id}
                                    iconColor={item.is_pinned ? theme.colors.primary : theme.colors.onSurfaceVariant}
                                    onPress={() => setPinned.mutate(item)}
                                />
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
                        step={SERVING_INPUT_INCREMENT}
                        min={SERVING_INPUT_INCREMENT}
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
                        leftIcon={<Ionicons name="trash-outline" size={18} color={theme.colors.onDanger} />}
                        onPress={confirmDelete}
                    />
                )}
                <View style={styles.row}>
                    <AppButton
                        title="Cancel"
                        variant="secondary"
                        leftIcon={<Ionicons name="close" size={18} color={theme.colors.onSurface} />}
                        onPress={closeEditor}
                        style={styles.field}
                    />
                    <AppButton
                        title={saveFood.isPending ? 'Saving...' : 'Save food'}
                        disabled={!canSaveFood || saveFood.isPending || deleteItem.isPending}
                        leftIcon={<Ionicons name="checkmark" size={18} color={theme.colors.onPrimary} />}
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
                        step={SERVING_INPUT_INCREMENT}
                        min={SERVING_INPUT_INCREMENT}
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
                            <AppIconButton
                                icon="remove"
                                iconSize={16}
                                accessibilityLabel={`Decrease ${ingredient.myFood.name} servings`}
                                variant="surface"
                                onPress={() => adjustRecipeIngredientServings(index, -SERVING_INPUT_INCREMENT)}
                            />
                            <AppText variant="label">{ingredient.servings}x</AppText>
                            <AppIconButton
                                icon="add"
                                iconSize={16}
                                accessibilityLabel={`Increase ${ingredient.myFood.name} servings`}
                                variant="surface"
                                onPress={() => adjustRecipeIngredientServings(index, SERVING_INPUT_INCREMENT)}
                            />
                        </View>}
                        <AppIconButton
                            icon="close"
                            accessibilityLabel={`Remove ${ingredient.source === 'MY_FOOD' ? ingredient.myFood.name : ingredient.name}`}
                            iconColor={theme.colors.danger}
                            onPress={() => setRecipeIngredients((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                        />
                    </View>
                ))}
                {saveRecipe.error && <AppText style={styles.error}>{saveRecipe.error.message}</AppText>}
                {deleteItem.error && <AppText style={styles.error}>{deleteItem.error.message}</AppText>}
                {editingItem && (
                    <AppButton
                        title={deleteItem.isPending ? 'Deleting...' : 'Delete recipe'}
                        variant="danger"
                        disabled={deleteItem.isPending || saveRecipe.isPending}
                        leftIcon={<Ionicons name="trash-outline" size={18} color={theme.colors.onDanger} />}
                        onPress={confirmDelete}
                    />
                )}
                <View style={styles.row}>
                    <AppButton
                        title="Cancel"
                        variant="secondary"
                        leftIcon={<Ionicons name="close" size={18} color={theme.colors.onSurface} />}
                        onPress={closeEditor}
                        style={styles.field}
                    />
                    <AppButton
                        title={saveRecipe.isPending ? 'Saving...' : 'Save recipe'}
                        disabled={!canSaveRecipe || saveRecipe.isPending || deleteItem.isPending || loadRecipe.isPending}
                        leftIcon={<Ionicons name="checkmark" size={18} color={theme.colors.onPrimary} />}
                        onPress={() => saveRecipe.mutate()}
                        style={styles.field}
                    />
                </View>
            </BottomSheetModal>
        </Screen>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
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
    libraryList: {
        gap: spacing.sm
    },
    libraryRow: {
        minHeight: 58,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        borderTopColor: theme.colors.outlineVariant,
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
        backgroundColor: theme.colors.surfaceContainer,
        padding: spacing.md
    },
    stepper: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs
    },
    error: {
        color: theme.colors.danger
    }
});
