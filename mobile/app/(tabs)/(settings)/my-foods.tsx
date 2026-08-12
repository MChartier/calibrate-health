import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MyFoodSummary } from '@calibrate/api-client';
import { AppButton } from '../../../src/components/AppButton';
import { AppText } from '../../../src/components/AppText';
import { BottomSheetModal } from '../../../src/components/BottomSheetModal';
import { NumberStepperField } from '../../../src/components/NumberStepperField';
import { RecipeIngredientEditor } from '../../../src/components/RecipeIngredientEditor';
import { TabScreen } from '../../../src/components/TabScreen';
import { TextField } from '../../../src/components/TextField';
import { useAuth } from '../../../src/auth/AuthContext';
import {
    SAVED_FOODS_LIBRARY_QUERY_KEY,
    SavedFoodsLibrary
} from '../../../src/savedFoods/SavedFoodsLibrary';
import {
    hydrateRecipeIngredientDrafts,
    serializeRecipeIngredientDrafts,
    type RecipeIngredientDraft
} from '../../../src/utils/myFoodEditing';
import { spacing, useAppTheme, type AppTheme } from '../../../src/theme';
import { SERVING_INPUT_INCREMENT } from '../../../src/config/inputPrecision';
import { getSafeActionErrorMessage } from '../../../src/errors/presentation';
import {
    getRecipeNameError,
    getSavedFoodNameError,
    RECIPE_NAME_REQUIRED_ERROR,
    SAVED_FOOD_NAME_REQUIRED_ERROR
} from '../../../src/utils/myFoodFormValidation';
import { confirmDiscardChanges } from '../../../src/components/confirmDiscardChanges';
import { confirmAction } from '../../../src/components/confirmAction';
import { FormErrorSummary, type FormErrorSummaryHandle } from '../../../src/components/FormErrorSummary';

type MyFoodSheet = 'food' | 'recipe' | null;

export default function MyFoodsScreen() {
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { api } = useAuth();
    const queryClient = useQueryClient();
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
    const [foodValidationError, setFoodValidationError] = useState<string | null>(null);
    const [recipeValidationError, setRecipeValidationError] = useState<string | null>(null);
    const foodErrorSummaryRef = useRef<FormErrorSummaryHandle>(null);
    const recipeErrorSummaryRef = useRef<FormErrorSummaryHandle>(null);

    useEffect(() => {
        if (foodValidationError && !getSavedFoodNameError(foodValidationError)) {
            foodErrorSummaryRef.current?.focus();
        }
    }, [foodValidationError]);

    useEffect(() => {
        if (recipeValidationError && !getRecipeNameError(recipeValidationError)) {
            recipeErrorSummaryRef.current?.focus();
        }
    }, [recipeValidationError]);

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
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['mobile-my-foods'] }),
                queryClient.invalidateQueries({ queryKey: SAVED_FOODS_LIBRARY_QUERY_KEY })
            ]);
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
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['mobile-my-foods'] }),
                queryClient.invalidateQueries({ queryKey: SAVED_FOODS_LIBRARY_QUERY_KEY })
            ]);
        }
    });

    const loadRecipe = useMutation({
        mutationFn: (item: MyFoodSummary) => api.getMyFood(item.id),
        onSuccess: (detail) => {
            setRecipeName(detail.name);
            setRecipeServingQuantity(String(detail.serving_size_quantity));
            setRecipeServingUnit(detail.serving_unit_label);
            setRecipeYield(String(detail.yield_servings ?? 1));
            setRecipeIngredients(hydrateRecipeIngredientDrafts(detail, []));
        }
    });

    const deleteItem = useMutation({
        mutationFn: (item: MyFoodSummary) => api.deleteMyFood(item.id),
        onSuccess: async (_result, item) => {
            queryClient.setQueryData<MyFoodSummary[]>(['mobile-my-foods'], (current = []) =>
                current.filter(({ id }) => id !== item.id)
            );
            closeEditor();
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['mobile-my-foods'] }),
                queryClient.invalidateQueries({ queryKey: SAVED_FOODS_LIBRARY_QUERY_KEY })
            ]);
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
    const foodDraftKey = JSON.stringify([foodName, servingQuantity, servingUnit, caloriesPerServing]);
    const foodDraftBaseline = editingItem?.type === 'FOOD'
        ? JSON.stringify([
              editingItem.name,
              String(editingItem.serving_size_quantity),
              editingItem.serving_unit_label,
              String(editingItem.calories_per_serving)
          ])
        : JSON.stringify(['', '1', 'serving', '']);
    const isFoodDraftDirty = activeSheet === 'food' && foodDraftKey !== foodDraftBaseline;
    const recipeDraftKey = JSON.stringify([
        recipeName,
        recipeServingQuantity,
        recipeServingUnit,
        recipeYield,
        serializeRecipeIngredientDrafts(recipeIngredients)
    ]);
    const loadedRecipeIngredients = loadRecipe.data
        ? hydrateRecipeIngredientDrafts(loadRecipe.data, [])
        : null;
    const recipeDraftBaseline = editingItem?.type === 'RECIPE'
        ? (loadRecipe.data && loadedRecipeIngredients
            ? JSON.stringify([
                  loadRecipe.data.name,
                  String(loadRecipe.data.serving_size_quantity),
                  loadRecipe.data.serving_unit_label,
                  String(loadRecipe.data.yield_servings ?? 1),
                  serializeRecipeIngredientDrafts(loadedRecipeIngredients)
              ])
            : null)
        : JSON.stringify(['', '1', 'serving', '1', []]);
    const isRecipeDraftDirty = activeSheet === 'recipe'
        && recipeDraftBaseline !== null
        && recipeDraftKey !== recipeDraftBaseline;
    const isEditorBusy = saveFood.isPending || saveRecipe.isPending || deleteItem.isPending || loadRecipe.isPending;

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
        setFoodValidationError(null);
        setRecipeValidationError(null);
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

    async function requestEditorClose() {
        const isDirty = activeSheet === 'food' ? isFoodDraftDirty : isRecipeDraftDirty;
        if (!isDirty || await confirmDiscardChanges()) closeEditor();
    }

    function handleSaveFood() {
        if (!foodName.trim()) {
            setFoodValidationError(SAVED_FOOD_NAME_REQUIRED_ERROR);
            return;
        }
        if (!canSaveFood) {
            setFoodValidationError('Enter a valid serving, unit, and calorie value.');
            return;
        }
        setFoodValidationError(null);
        saveFood.mutate();
    }

    function handleSaveRecipe() {
        if (!recipeName.trim()) {
            setRecipeValidationError(RECIPE_NAME_REQUIRED_ERROR);
            return;
        }
        if (!canSaveRecipe) {
            setRecipeValidationError('Add a valid serving, yield, and at least one ingredient.');
            return;
        }
        setRecipeValidationError(null);
        saveRecipe.mutate();
    }

    async function confirmDelete() {
        if (!editingItem) return;
        const shouldDelete = await confirmAction({
            title: `Delete ${editingItem.name}?`,
            message: 'Past food logs keep their saved names, calories, and serving snapshots. This library item cannot be restored.',
            cancelLabel: 'Cancel',
            confirmLabel: 'Delete',
            destructive: true
        });
        if (shouldDelete) deleteItem.mutate(editingItem);
    }
    return (
        <TabScreen>
            <SavedFoodsLibrary
                onCreateFood={() => openNew('food')}
                onCreateRecipe={() => openNew('recipe')}
                onEdit={openEditor}
            />

            <BottomSheetModal
                visible={activeSheet === 'food'}
                accessibilityLabel={editingItem ? 'Edit food' : 'New food'}
                title={editingItem ? 'Edit food' : 'New food'}
                description="Saved food edits do not rewrite existing food logs."
                showCloseButton
                dismissDisabled={isEditorBusy}
                isDirty={isFoodDraftDirty}
                confirmDismiss={confirmDiscardChanges}
                onRequestClose={closeEditor}
            >
                <TextField
                    label="Name"
                    value={foodName}
                    onChangeText={(value) => {
                        setFoodName(value);
                        setFoodValidationError(null);
                    }}
                    errorText={getSavedFoodNameError(foodValidationError)}
                    focusError={Boolean(getSavedFoodNameError(foodValidationError))}
                    required
                />
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
                {foodValidationError && !getSavedFoodNameError(foodValidationError) && (
                    <FormErrorSummary
                        ref={foodErrorSummaryRef}
                        message={foodValidationError}
                        style={styles.error}
                    />
                )}
                {saveFood.error && <AppText accessibilityRole="alert" style={styles.error}>{getSafeActionErrorMessage(saveFood.error, 'Unable to save this food.')}</AppText>}
                {deleteItem.error && <AppText style={styles.error}>{getSafeActionErrorMessage(deleteItem.error, 'Unable to delete this food.')}</AppText>}
                {editingItem && (
                    <AppButton
                        title={deleteItem.isPending ? 'Deleting...' : 'Delete food'}
                        variant="danger"
                        disabled={deleteItem.isPending || saveFood.isPending}
                        leftIcon={<Ionicons name="trash-outline" size={18} color={theme.colors.onDanger} />}
                        onPress={() => { void confirmDelete(); }}
                    />
                )}
                <View style={styles.row}>
                    <AppButton
                        title="Cancel"
                        variant="secondary"
                        leftIcon={<Ionicons name="close" size={18} color={theme.colors.onSurface} />}
                        onPress={() => { void requestEditorClose(); }}
                        style={styles.field}
                    />
                    <AppButton
                        title={saveFood.isPending ? 'Saving...' : 'Save food'}
                        disabled={saveFood.isPending || deleteItem.isPending}
                        leftIcon={<Ionicons name="checkmark" size={18} color={theme.colors.onPrimary} />}
                        onPress={handleSaveFood}
                        style={styles.field}
                    />
                </View>
            </BottomSheetModal>

            <BottomSheetModal
                visible={activeSheet === 'recipe'}
                accessibilityLabel={editingItem ? 'Edit recipe' : 'Recipe builder'}
                title={editingItem ? 'Edit recipe' : 'Recipe builder'}
                description="Recipe edits create new ingredient snapshots without changing past logs."
                size="wide"
                showCloseButton
                dismissDisabled={isEditorBusy}
                isDirty={isRecipeDraftDirty}
                confirmDismiss={confirmDiscardChanges}
                onRequestClose={closeEditor}
            >
                <TextField
                    label="Recipe name"
                    value={recipeName}
                    onChangeText={(value) => {
                        setRecipeName(value);
                        setRecipeValidationError(null);
                    }}
                    errorText={getRecipeNameError(recipeValidationError)}
                    focusError={Boolean(getRecipeNameError(recipeValidationError))}
                    required
                />
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
                {loadRecipe.error && <AppText style={styles.error}>{getSafeActionErrorMessage(loadRecipe.error, 'Unable to load this recipe.')}</AppText>}
                <RecipeIngredientEditor
                    enabled={activeSheet === 'recipe'}
                    ingredients={recipeIngredients}
                    onChange={setRecipeIngredients}
                />
                {recipeValidationError && !getRecipeNameError(recipeValidationError) && (
                    <FormErrorSummary
                        ref={recipeErrorSummaryRef}
                        message={recipeValidationError}
                        style={styles.error}
                    />
                )}
                {saveRecipe.error && <AppText accessibilityRole="alert" style={styles.error}>{getSafeActionErrorMessage(saveRecipe.error, 'Unable to save this recipe.')}</AppText>}
                {deleteItem.error && <AppText style={styles.error}>{getSafeActionErrorMessage(deleteItem.error, 'Unable to delete this recipe.')}</AppText>}
                {editingItem && (
                    <AppButton
                        title={deleteItem.isPending ? 'Deleting...' : 'Delete recipe'}
                        variant="danger"
                        disabled={deleteItem.isPending || saveRecipe.isPending}
                        leftIcon={<Ionicons name="trash-outline" size={18} color={theme.colors.onDanger} />}
                        onPress={() => { void confirmDelete(); }}
                    />
                )}
                <View style={styles.row}>
                    <AppButton
                        title="Cancel"
                        variant="secondary"
                        leftIcon={<Ionicons name="close" size={18} color={theme.colors.onSurface} />}
                        onPress={() => { void requestEditorClose(); }}
                        style={styles.field}
                    />
                    <AppButton
                        title={saveRecipe.isPending ? 'Saving...' : 'Save recipe'}
                        disabled={saveRecipe.isPending || deleteItem.isPending || loadRecipe.isPending}
                        leftIcon={<Ionicons name="checkmark" size={18} color={theme.colors.onPrimary} />}
                        onPress={handleSaveRecipe}
                        style={styles.field}
                    />
                </View>
            </BottomSheetModal>
        </TabScreen>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    row: {
        flexDirection: 'row',
        gap: spacing.md
    },
    field: {
        flex: 1
    },
    error: {
        color: theme.colors.danger
    }
});
