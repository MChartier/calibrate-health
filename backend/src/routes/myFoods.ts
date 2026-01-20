import express from 'express';
import prisma from '../config/database';
import { parseNonNegativeNumber, parsePositiveInteger, parsePositiveNumber } from '../utils/requestParsing';
import { buildExternalIngredientSnapshotRow, parseMyFoodIngredientInput } from './myFoodsRecipeUtils';
import { createHttpError, isHttpError, normalizeMyFoodName, normalizeServingUnitLabel } from './myFoodsUtils';

/**
 * "My Foods" endpoints for user-defined foods and immutable recipe snapshots.
 *
 * Recipes store ingredient snapshots so future edits to source foods do not rewrite history.
 */
const router = express.Router();

/**
 * Ensure the session is authenticated before accessing "My Foods".
 */
const isAuthenticated = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: 'Not authenticated' });
};

router.use(isAuthenticated);

router.get('/', async (req, res) => {
    const user = req.user as any;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const type = typeof req.query.type === 'string' ? req.query.type.trim().toUpperCase() : undefined;

    const where: any = { user_id: user.id };
    if (q) {
        where.name = { contains: q, mode: 'insensitive' };
    }
    if (type === 'FOOD' || type === 'RECIPE') {
        where.type = type;
    }

    try {
        const items = await prisma.myFood.findMany({
            where,
            orderBy: [{ name: 'asc' }, { id: 'asc' }]
        });
        res.json(items);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/:id', async (req, res) => {
    const user = req.user as any;
    const id = parsePositiveInteger(req.params.id);
    if (id === null) {
        return res.status(400).json({ message: 'Invalid my food id' });
    }

    try {
        const item = await prisma.myFood.findFirst({
            where: { id, user_id: user.id },
            include: {
                recipe_ingredients: { orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] }
            }
        });

        if (!item) {
            return res.status(404).json({ message: 'My food not found' });
        }

        res.json(item);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/foods', async (req, res) => {
    const user = req.user as any;
    const name = normalizeMyFoodName(req.body?.name);
    if (!name) {
        return res.status(400).json({ message: 'Invalid name' });
    }

    const servingSizeQuantity = parsePositiveNumber(req.body?.serving_size_quantity);
    if (servingSizeQuantity === null) {
        return res.status(400).json({ message: 'Invalid serving size quantity' });
    }

    const servingUnitLabel = normalizeServingUnitLabel(req.body?.serving_unit_label);
    if (!servingUnitLabel) {
        return res.status(400).json({ message: 'Invalid serving unit label' });
    }

    const caloriesPerServing = parseNonNegativeNumber(req.body?.calories_per_serving);
    if (caloriesPerServing === null) {
        return res.status(400).json({ message: 'Invalid calories per serving' });
    }

    try {
        // Store as a reusable per-serving item that can be referenced in logs or recipes.
        const created = await prisma.myFood.create({
            data: {
                user_id: user.id,
                type: 'FOOD',
                name,
                serving_size_quantity: servingSizeQuantity,
                serving_unit_label: servingUnitLabel,
                calories_per_serving: caloriesPerServing
            }
        });
        res.json(created);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

type CreateRecipeIngredientInput =
    | {
          source: 'MY_FOOD';
          sort_order?: unknown;
          my_food_id: unknown;
          quantity_servings: unknown;
      }
    | {
          source: 'EXTERNAL';
          sort_order?: unknown;
          name: unknown;
          calories_total: unknown;
          external_source?: unknown;
          external_id?: unknown;
          brand?: unknown;
          locale?: unknown;
          barcode?: unknown;
          measure_label?: unknown;
          grams_per_measure?: unknown;
          measure_quantity?: unknown;
          grams_total?: unknown;
      };

/**
 * Create a recipe from ingredient snapshots. Recipes are stored as immutable snapshots (by design).
 */
router.post('/recipes', async (req, res) => {
    const user = req.user as any;
    const name = normalizeMyFoodName(req.body?.name);
    if (!name) {
        return res.status(400).json({ message: 'Invalid name' });
    }

    const servingSizeQuantity = parsePositiveNumber(req.body?.serving_size_quantity);
    if (servingSizeQuantity === null) {
        return res.status(400).json({ message: 'Invalid serving size quantity' });
    }

    const servingUnitLabel = normalizeServingUnitLabel(req.body?.serving_unit_label);
    if (!servingUnitLabel) {
        return res.status(400).json({ message: 'Invalid serving unit label' });
    }

    const yieldServings = parsePositiveNumber(req.body?.yield_servings);
    if (yieldServings === null) {
        return res.status(400).json({ message: 'Invalid yield servings' });
    }

    const ingredientsRaw = req.body?.ingredients;
    if (!Array.isArray(ingredientsRaw) || ingredientsRaw.length === 0) {
        return res.status(400).json({ message: 'Recipe must include at least one ingredient' });
    }

    const ingredients = ingredientsRaw as CreateRecipeIngredientInput[];

    try {
        // Snapshot ingredient data + recipe totals in a single transaction to keep them consistent.
        const created = await prisma.$transaction(async (tx) => {
            const ingredientRows: Array<{
                sort_order: number;
                source: 'MY_FOOD' | 'EXTERNAL';
                name_snapshot: string;
                calories_total_snapshot: number;
                source_my_food_id?: number | null;
                quantity_servings?: number | null;
                serving_size_quantity_snapshot?: number | null;
                serving_unit_label_snapshot?: string | null;
                calories_per_serving_snapshot?: number | null;
                external_source?: string | null;
                external_id?: string | null;
                brand_snapshot?: string | null;
                locale_snapshot?: string | null;
                barcode_snapshot?: string | null;
                measure_label_snapshot?: string | null;
                grams_per_measure_snapshot?: number | null;
                measure_quantity_snapshot?: number | null;
                grams_total_snapshot?: number | null;
            }> = [];

            for (let idx = 0; idx < ingredients.length; idx += 1) {
                const ingredient = ingredients[idx];
                const sortOrderRaw = ingredient && typeof ingredient === 'object' ? (ingredient as any).sort_order : undefined;
                const sortOrder = parsePositiveInteger(sortOrderRaw) ?? idx + 1;

                const source = (ingredient as any)?.source;
                if (source !== 'MY_FOOD' && source !== 'EXTERNAL') {
                    throw createHttpError(400, 'Invalid ingredient source');
                }

                if (source === 'MY_FOOD') {
                    const parsedIngredient = parseMyFoodIngredientInput(ingredient);
                    if (!parsedIngredient.ok) {
                        throw parsedIngredient.error;
                    }

                    const sourceFood = await tx.myFood.findFirst({
                        where: { id: parsedIngredient.value.myFoodId, user_id: user.id, type: 'FOOD' }
                    });
                    if (!sourceFood) {
                        throw createHttpError(404, 'Ingredient my food not found');
                    }

                    const caloriesTotal = parsedIngredient.value.quantityServings * sourceFood.calories_per_serving;

                    ingredientRows.push({
                        sort_order: sortOrder,
                        source,
                        name_snapshot: sourceFood.name,
                        calories_total_snapshot: caloriesTotal,
                        source_my_food_id: sourceFood.id,
                        quantity_servings: parsedIngredient.value.quantityServings,
                        serving_size_quantity_snapshot: sourceFood.serving_size_quantity,
                        serving_unit_label_snapshot: sourceFood.serving_unit_label,
                        calories_per_serving_snapshot: sourceFood.calories_per_serving
                    });
                    continue;
                }

                const externalSnapshot = buildExternalIngredientSnapshotRow(ingredient, sortOrder);
                if (!externalSnapshot.ok) {
                    throw externalSnapshot.error;
                }

                ingredientRows.push({
                    ...externalSnapshot.value,
                    source
                });
            }

            const recipeTotalCalories = ingredientRows.reduce((sum, row) => sum + row.calories_total_snapshot, 0);
            const caloriesPerServing = recipeTotalCalories / yieldServings;

            const recipe = await tx.myFood.create({
                data: {
                    user_id: user.id,
                    type: 'RECIPE',
                    name,
                    serving_size_quantity: servingSizeQuantity,
                    serving_unit_label: servingUnitLabel,
                    calories_per_serving: caloriesPerServing,
                    recipe_total_calories: recipeTotalCalories,
                    yield_servings: yieldServings
                }
            });

            await tx.recipeIngredient.createMany({
                data: ingredientRows.map((row) => ({
                    recipe_id: recipe.id,
                    sort_order: row.sort_order,
                    source: row.source,
                    name_snapshot: row.name_snapshot,
                    calories_total_snapshot: row.calories_total_snapshot,
                    source_my_food_id: row.source_my_food_id ?? null,
                    quantity_servings: row.quantity_servings ?? null,
                    serving_size_quantity_snapshot: row.serving_size_quantity_snapshot ?? null,
                    serving_unit_label_snapshot: row.serving_unit_label_snapshot ?? null,
                    calories_per_serving_snapshot: row.calories_per_serving_snapshot ?? null,
                    external_source: row.external_source ?? null,
                    external_id: row.external_id ?? null,
                    brand_snapshot: row.brand_snapshot ?? null,
                    locale_snapshot: row.locale_snapshot ?? null,
                    barcode_snapshot: row.barcode_snapshot ?? null,
                    measure_label_snapshot: row.measure_label_snapshot ?? null,
                    grams_per_measure_snapshot: row.grams_per_measure_snapshot ?? null,
                    measure_quantity_snapshot: row.measure_quantity_snapshot ?? null,
                    grams_total_snapshot: row.grams_total_snapshot ?? null
                }))
            });

            return recipe;
        });

        res.json(created);
    } catch (err) {
        console.error(err);
        if (isHttpError(err)) {
            return res.status(err.statusCode).json({ message: err.message || 'Request failed' });
        }
        return res.status(500).json({ message: 'Server error' });
    }
});

export default router;
