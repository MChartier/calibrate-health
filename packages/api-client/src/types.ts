import type {
    ActivityLevel,
    HeightUnit,
    MealPeriod,
    MobileDevicePlatform,
    NativePushPlatform,
    NativePushProvider,
    Sex,
    WeightUnit
} from '@calibrate/shared';
import type { InAppNotificationType } from '@calibrate/shared/inAppNotifications';

export type UserClientPayload = {
    id: number;
    email: string;
    created_at: string;
    weight_unit: WeightUnit;
    height_unit: HeightUnit;
    timezone: string;
    language: string;
    reminder_log_weight_enabled: boolean;
    reminder_log_food_enabled: boolean;
    haptics_enabled: boolean;
    date_of_birth: string | null;
    sex: Sex | null;
    height_mm: number | null;
    activity_level: ActivityLevel | null;
    profile_image_url: string | null;
};

export type MobileAuthRequest = {
    email: string;
    password: string;
    device_id: string;
    device_platform?: MobileDevicePlatform;
    device_name?: string;
};

export type MobileAuthResponse = {
    user: UserClientPayload;
    access_token: string;
    refresh_token: string;
    access_expires_at: string;
    refresh_expires_at: string;
};

export type MobileRefreshResponse = MobileAuthResponse;

export type ClientConfigResponse = {
    api_version: number;
    server_version: string;
    hosted_origin: string;
    min_supported_mobile_version: string;
    capabilities: {
        self_hosted_server_url: boolean;
        native_push: boolean;
        wear_os_ready: boolean;
    };
};

export type UserProfile = {
    timezone: string;
    date_of_birth: string | null;
    sex: Sex | null;
    height_mm: number | null;
    activity_level: ActivityLevel | null;
    weight_unit: WeightUnit;
    height_unit: HeightUnit;
};

export type CalorieSummary = {
    dailyCalorieTarget?: number;
    tdee?: number;
    bmr?: number;
    deficit?: number | null;
    missing: string[];
};

export type UserProfileResponse = {
    profile: UserProfile;
    latest_weight_grams: number | null;
    goal_daily_deficit: number | null;
    calorieSummary: CalorieSummary;
};

export type GoalEntry = {
    id: number;
    start_weight: number;
    target_weight: number;
    target_date: string | null;
    daily_deficit: number;
    created_at: string;
};

export type MetricEntry = {
    id: number;
    date: string;
    weight: number;
};

export type FoodLogEntry = {
    id: number;
    meal_period: MealPeriod;
    name: string;
    calories: number;
    my_food_id?: number | null;
    servings_consumed?: number | null;
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
};

export type FoodLogCreatePayload = {
    date: string;
    meal_period: MealPeriod;
    name: string;
    calories: number;
    my_food_id?: number | null;
    servings_consumed?: number | null;
};

export type FoodSearchResult = {
    id: string;
    name: string;
    brand?: string | null;
    calories?: number | null;
    source?: string;
    barcode?: string | null;
    servingSize?: string | null;
    measures?: unknown[];
};

export type FoodSearchResponse = {
    items: FoodSearchResult[];
    provider?: string;
    attribution?: string;
};

export type FoodLogDay = {
    date: string;
    is_complete: boolean;
    completed_at: string | null;
};

export type InAppNotification = {
    id: number;
    type: InAppNotificationType;
    local_date: string;
    title: string;
    body: string;
    action_url: string;
    read_at: string | null;
    dismissed_at: string | null;
    created_at: string;
};

export type InAppNotificationsResponse = {
    notifications: InAppNotification[];
    unread_count: number;
};

export type NativePushSubscriptionPayload = {
    token: string;
    device_id: string;
    platform?: NativePushPlatform;
    provider?: NativePushProvider;
};

export type MyFoodSummary = {
    id: number;
    type: 'FOOD' | 'RECIPE';
    name: string;
    serving_size_quantity: number;
    serving_unit_label: string;
    calories_per_serving: number;
    recipe_total_calories?: number | null;
    yield_servings?: number | null;
};

export type LoseItImportSummary = {
    food_logs: {
        total: number;
        valid: number;
        invalid: number;
    };
    weights: {
        total: number;
        valid: number;
        invalid: number;
    };
    warnings: string[];
};
