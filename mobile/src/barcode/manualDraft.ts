import type { MealPeriod } from '@calibrate/shared';
import type { BarcodeReturnDestination } from './context';

export type BarcodeManualFoodDraftContext = Readonly<{
    ownerId: number;
    date: string;
    meal: MealPeriod;
    returnTo: BarcodeReturnDestination;
}>;

export type BarcodeManualFoodDraft = BarcodeManualFoodDraftContext & Readonly<{
    name: string;
    calories: string;
}>;

let pendingDraft: BarcodeManualFoodDraft | null = null;

export function saveBarcodeManualFoodDraft(draft: BarcodeManualFoodDraft): void {
    pendingDraft = draft;
}

export function readBarcodeManualFoodDraft(
    context: BarcodeManualFoodDraftContext
): Pick<BarcodeManualFoodDraft, 'name' | 'calories'> | null {
    if (
        !pendingDraft
        || pendingDraft.ownerId !== context.ownerId
        || pendingDraft.date !== context.date
        || pendingDraft.meal !== context.meal
        || pendingDraft.returnTo !== context.returnTo
    ) return null;
    return { name: pendingDraft.name, calories: pendingDraft.calories };
}

export function clearBarcodeManualFoodDraft(): void {
    pendingDraft = null;
}
