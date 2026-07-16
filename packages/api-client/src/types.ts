import type {
    ActivityLevel,
    ActivityRecordType,
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

export type AccountExport = {
    format: 'calibrate-account-export';
    version: 2;
    exported_at: string;
    account: {
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
        profile_image: { mime_type: string; data_base64: string } | null;
    };
    goals: Array<{
        id: number;
        start_weight_grams: number;
        target_weight_grams: number;
        target_date: string | null;
        daily_deficit: number;
        created_at: string;
    }>;
    body_metrics: Array<{
        id: number;
        date: string;
        weight_grams: number;
        body_fat_percent: number | null;
    }>;
    food_logs: Array<{
        id: number;
        my_food_id: number | null;
        date: string;
        local_date: string;
        meal_period: MealPeriod;
        name: string;
        calories: number;
        servings_consumed: number | null;
        serving_size_quantity_snapshot: number | null;
        serving_unit_label_snapshot: string | null;
        calories_per_serving_snapshot: number | null;
        external_source: string | null;
        external_id: string | null;
        brand_snapshot: string | null;
        locale_snapshot: string | null;
        barcode_snapshot: string | null;
        measure_label_snapshot: string | null;
        grams_per_measure_snapshot: number | null;
        measure_quantity_snapshot: number | null;
        grams_total_snapshot: number | null;
        created_at: string;
    }>;
    food_log_days: Array<{
        id: number;
        local_date: string;
        is_complete: boolean;
        completed_at: string | null;
        created_at: string;
        updated_at: string;
    }>;
    my_foods: Array<{
        id: number;
        type: 'FOOD' | 'RECIPE';
        name: string;
        serving_size_quantity: number;
        serving_unit_label: string;
        calories_per_serving: number;
        is_pinned: boolean;
        recipe_total_calories: number | null;
        yield_servings: number | null;
        created_at: string;
        updated_at: string;
        recipe_ingredients: Array<{
            id: number;
            sort_order: number;
            source: RecipeIngredientSource;
            name_snapshot: string;
            calories_total_snapshot: number;
            source_my_food_id: number | null;
            quantity_servings: number | null;
            serving_size_quantity_snapshot: number | null;
            serving_unit_label_snapshot: string | null;
            calories_per_serving_snapshot: number | null;
            external_source: string | null;
            external_id: string | null;
            brand_snapshot: string | null;
            locale_snapshot: string | null;
            barcode_snapshot: string | null;
            measure_label_snapshot: string | null;
            grams_per_measure_snapshot: number | null;
            measure_quantity_snapshot: number | null;
            grams_total_snapshot: number | null;
            created_at: string;
        }>;
    }>;
    in_app_notifications: Array<{
        id: number;
        type: InAppNotificationType;
        local_date: string;
        title: string | null;
        body: string | null;
        action_url: string | null;
        read_at: string | null;
        dismissed_at: string | null;
        resolved_at: string | null;
        created_at: string;
        updated_at: string;
    }>;
    activity_records: Array<{
        id: number;
        record_type: ActivityRecordType;
        external_id: string;
        data_origin: string;
        client_record_id: string | null;
        client_record_version: string | null;
        source_updated_at: string;
        start_time: string;
        end_time: string | null;
        start_zone_offset_seconds: number | null;
        end_zone_offset_seconds: number | null;
        local_date: string;
        step_count: number | null;
        energy_kcal: number | null;
        weight_grams: number | null;
        exercise_type: number | null;
        title: string | null;
        notes: string | null;
        recording_method: number | null;
        device_type: number | null;
        device_manufacturer: string | null;
        device_model: string | null;
        created_at: string;
        updated_at: string;
    }>;
    activity_day_summaries: Array<{
        id: number;
        local_date: string;
        steps: number | null;
        active_calories_kcal: number | null;
        total_calories_kcal: number | null;
        exercise_minutes: number | null;
        observed_at: string;
        created_at: string;
        updated_at: string;
    }>;
};

export type DeleteAccountRequest = {
    current_password: string;
};

export type MobileAuthRequest = {
    email: string;
    password: string;
    device_id: string;
    device_platform?: 'android_phone';
    device_name?: string;
};

export type MobileAuthResponse = {
    user: UserClientPayload;
    access_token: string;
    refresh_token: string;
    access_expires_at: string;
    refresh_expires_at: string;
};

export type WearAuthPrincipal = Pick<
    UserClientPayload,
    'id' | 'timezone' | 'language' | 'weight_unit' | 'height_unit'
>;

export type WearMobileAuthResponse = Omit<MobileAuthResponse, 'user'> & {
    user: WearAuthPrincipal;
};

export type MobileRefreshResponse = MobileAuthResponse | WearMobileAuthResponse;

export type MobileSessionSummary = {
    id: number;
    device_id: string;
    device_platform: MobileDevicePlatform;
    device_name: string | null;
    created_at: string;
    last_used_at: string | null;
    refresh_expires_at: string;
    current: boolean;
};

export type WearPairingCredentialRequest = {
    server_origin: string;
    watch_device_id: string;
    watch_device_name?: string;
    protocol_version: 1;
    watch_public_key_spki: string;
};

export type WearPairingCredentialResponse = {
    pairing_token: string;
    server_origin: string;
    watch_device_id: string;
    protocol_version: 1;
    challenge: string;
    expires_at: string;
};

export type WearPairingExchangeRequest = {
    pairing_token: string;
    server_origin: string;
    watch_device_id: string;
    protocol_version: 1;
    exchange_id: string;
    challenge_signature: string;
};

export type WatchQuickAddDraft = {
    id: string;
    source: 'pinned' | 'recent';
    label: string;
    calories: number;
    draft: FoodLogCreatePayload;
};

export type WatchSnapshot = {
    server_time: string;
    timezone: string;
    local_date: string;
    weight_unit: 'KG' | 'LB';
    revision: string;
    calories: {
        consumed: number;
        target: number | null;
        remaining: number | null;
        missing: string[];
    };
    activity: {
        steps: number | null;
        active_calories_kcal: number | null;
        total_calories_kcal: number | null;
        exercise_minutes: number | null;
        observed_at: string;
    } | null;
    food_day: { is_complete: boolean; completed_at: string | null; revision: string | null };
    weight: {
        today_grams: number | null;
        today_revision: string | null;
        latest_grams: number | null;
        latest_revision: string | null;
        latest_date: string | null;
    };
    goal?: {
        start_weight_grams: number;
        target_weight_grams: number;
        current_weight_grams: number | null;
        daily_deficit: number;
        progress_percent: number | null;
        remaining_weight_grams: number;
        is_complete: boolean;
    } | null;
    quick_add: WatchQuickAddDraft[];
    reminders: Array<{
        id: number;
        type: 'food' | 'weight';
        local_date: string;
        created_at: string;
    }>;
    undo_candidate: { food_log_id: number; name: string; calories: number; created_at: string } | null;
    staleness: { activity_stale: boolean; activity_age_seconds: number | null };
};

export type WatchSnapshotFetchResult = {
    body: WatchSnapshot | null;
    etag: string | null;
    notModified: boolean;
};

export type WatchMutationRequest =
    | { type: 'food.create'; payload: FoodLogCreatePayload }
    | { type: 'food.delete'; payload: { food_log_id: number } }
    | { type: 'metric.upsert'; payload: { local_date: string; weight_grams: number; expected_revision: string | null } }
    | { type: 'food_day.set_complete'; payload: { local_date: string; is_complete: boolean; expected_revision: string | null } };

export type WatchFoodLog = FoodLogEntry & {
    date: string;
    local_date: string;
    created_at: string;
};

export type WatchMutationResponse =
    | { type: 'food.create'; food_log: WatchFoodLog }
    | { type: 'food.delete'; food_log_id: number; deleted: true }
    | { type: 'metric.upsert'; metric: { id: number; local_date: string; weight_grams: number; revision: string } }
    | { type: 'food_day.set_complete'; food_day: FoodLogDay & { revision: string } };

export type ClientConfigResponse = {
    api_version: number;
    api_versions: {
        current: 'v1';
        supported: string[];
        legacy_alias: string;
        legacy_deprecation: string;
    };
    server_version: string;
    hosted_origin: string;
    min_supported_mobile_version: string;
    min_supported_wear_version: string;
    capabilities: {
        self_hosted_server_url: boolean;
        native_push: boolean;
        health_connect_activity: boolean;
        wear_os_ready: boolean;
    };
};

type HealthConnectRecordBase = {
    record_id: string;
    data_origin: string;
    client_record_id?: string | null;
    client_record_version?: string | null;
    source_updated_at: string;
    start_time: string;
    end_time?: string | null;
    start_zone_offset_seconds?: number | null;
    end_zone_offset_seconds?: number | null;
    title?: string | null;
    notes?: string | null;
    recording_method?: number | null;
    device_type?: number | null;
    device_manufacturer?: string | null;
    device_model?: string | null;
};

export type HealthConnectStepUpsert = HealthConnectRecordBase & { count: number };
export type HealthConnectEnergyUpsert = HealthConnectRecordBase & { energy_kcal: number };
export type HealthConnectWeightUpsert = HealthConnectRecordBase & { weight_grams: number };
export type HealthConnectExerciseUpsert = HealthConnectRecordBase & { exercise_type: number };
export type HealthConnectRecordUpsert =
    | HealthConnectStepUpsert
    | HealthConnectEnergyUpsert
    | HealthConnectWeightUpsert
    | HealthConnectExerciseUpsert;

type ActivityDaySummaryBase = {
    local_date: string;
    steps?: number | null;
    active_calories_kcal?: number | null;
    total_calories_kcal?: number | null;
    exercise_minutes?: number | null;
    observed_at: string;
};

export type ActivityDaySummaryPayload = ActivityDaySummaryBase & (
    | { steps: number }
    | { active_calories_kcal: number }
    | { total_calories_kcal: number }
    | { exercise_minutes: number }
);

type HealthConnectSyncBase = {
    next_changes_token: string;
    deleted_record_ids?: string[];
    day_summaries?: ActivityDaySummaryPayload[];
};

export type HealthConnectReplaceWindow = {
    start_date: string;
    end_date: string;
};

export type HealthConnectSyncPayload =
    | (HealthConnectSyncBase & { sync_mode: 'incremental'; replace_window?: never; record_type: 'STEPS'; previous_changes_token: string | null; upserts?: HealthConnectStepUpsert[] })
    | (HealthConnectSyncBase & { sync_mode: 'incremental'; replace_window?: never; record_type: 'ACTIVE_CALORIES' | 'TOTAL_CALORIES'; previous_changes_token: string | null; upserts?: HealthConnectEnergyUpsert[] })
    | (HealthConnectSyncBase & { sync_mode: 'incremental'; replace_window?: never; record_type: 'EXERCISE_SESSION'; previous_changes_token: string | null; upserts?: HealthConnectExerciseUpsert[] })
    | (HealthConnectSyncBase & { sync_mode: 'incremental'; replace_window?: never; record_type: 'WEIGHT'; previous_changes_token: string | null; upserts?: HealthConnectWeightUpsert[] })
    | (HealthConnectSyncBase & { sync_mode: 'reset'; replace_window?: HealthConnectReplaceWindow; record_type: 'STEPS'; previous_changes_token: null; upserts?: HealthConnectStepUpsert[] })
    | (HealthConnectSyncBase & { sync_mode: 'reset'; replace_window?: HealthConnectReplaceWindow; record_type: 'ACTIVE_CALORIES' | 'TOTAL_CALORIES'; previous_changes_token: null; upserts?: HealthConnectEnergyUpsert[] })
    | (HealthConnectSyncBase & { sync_mode: 'reset'; replace_window?: HealthConnectReplaceWindow; record_type: 'EXERCISE_SESSION'; previous_changes_token: null; upserts?: HealthConnectExerciseUpsert[] })
    | (HealthConnectSyncBase & { sync_mode: 'reset'; replace_window?: HealthConnectReplaceWindow; record_type: 'WEIGHT'; previous_changes_token: null; upserts?: HealthConnectWeightUpsert[] });

export type HealthConnectSyncResponse = {
    record_type: ActivityRecordType;
    upserted: number;
    deleted: number;
    reset_deleted: number;
    stale_ignored: number;
    tombstoned_ignored: number;
    day_summaries_upserted: number;
    day_summaries_stale_ignored: number;
    checkpoint_advanced: true;
};

export type ActivityRecordEntry = {
    id: number;
    record_type: ActivityRecordType;
    record_id: string;
    data_origin: string;
    client_record_id: string | null;
    client_record_version: string | null;
    source_updated_at: string;
    start_time: string;
    end_time: string | null;
    start_zone_offset_seconds: number | null;
    end_zone_offset_seconds: number | null;
    local_date: string;
    count: number | null;
    energy_kcal: number | null;
    weight_grams: number | null;
    exercise_type: number | null;
    title: string | null;
    notes: string | null;
    recording_method: number | null;
    device_type: number | null;
    device_manufacturer: string | null;
    device_model: string | null;
    created_at: string;
    updated_at: string;
};

export type ActivityDaySummary = {
    id: number;
    local_date: string;
    steps: number | null;
    active_calories_kcal: number | null;
    total_calories_kcal: number | null;
    exercise_minutes: number | null;
    observed_at: string;
    created_at: string;
    updated_at: string;
};

export type ActivityDaysResponse = {
    start_date: string;
    end_date: string;
    days: Array<{
        local_date: string;
        summary: ActivityDaySummary | null;
        records: ActivityRecordEntry[];
    }>;
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
    name?: string;
    calories?: number;
    my_food_id?: number | null;
    servings_consumed?: number | null;
    serving_size_quantity_snapshot?: number | null;
    serving_unit_label_snapshot?: string | null;
    calories_per_serving_snapshot?: number | null;
    external_source?: string | null;
    external_id?: string | null;
    brand?: string | null;
    locale?: string | null;
    barcode?: string | null;
    measure_label?: string | null;
    grams_per_measure_snapshot?: number | null;
    measure_quantity_snapshot?: number | null;
    grams_total_snapshot?: number | null;
};

export type FoodLogUpdatePayload = Partial<{
    name: string;
    calories: number;
    meal_period: MealPeriod;
    servings_consumed: number | null;
}>;

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
    title: string | null;
    body: string | null;
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
    device_id?: string;
    platform?: NativePushPlatform;
    provider?: NativePushProvider;
};

export type RecentFoodSummary = {
    id: string;
    name: string;
    meal_period: MealPeriod;
    calories: number;
    my_food_id: number | null;
    servings_consumed: number | null;
    serving_size_quantity_snapshot: number | null;
    serving_unit_label_snapshot: string | null;
    calories_per_serving_snapshot: number | null;
    external_source: string | null;
    external_id: string | null;
    brand_snapshot: string | null;
    locale_snapshot: string | null;
    barcode_snapshot: string | null;
    measure_label_snapshot: string | null;
    grams_per_measure_snapshot: number | null;
    measure_quantity_snapshot: number | null;
    grams_total_snapshot: number | null;
    last_logged_at: string;
    times_logged: number;
};

export type RecentFoodsResponse = {
    items: RecentFoodSummary[];
};

export type MyFoodSummary = {
    id: number;
    type: 'FOOD' | 'RECIPE';
    name: string;
    serving_size_quantity: number;
    serving_unit_label: string;
    calories_per_serving: number;
    is_pinned: boolean;
    recipe_total_calories?: number | null;
    yield_servings?: number | null;
};

export type RecipeIngredientSource = 'MY_FOOD' | 'EXTERNAL';

export type RecipeIngredientSummary = {
    id: number;
    recipe_id: number;
    sort_order: number;
    source: RecipeIngredientSource;
    name_snapshot: string;
    calories_total_snapshot: number;
    source_my_food_id: number | null;
    quantity_servings: number | null;
    serving_size_quantity_snapshot: number | null;
    serving_unit_label_snapshot: string | null;
    calories_per_serving_snapshot: number | null;
    external_source: string | null;
    external_id: string | null;
    brand_snapshot: string | null;
    locale_snapshot: string | null;
    barcode_snapshot: string | null;
    measure_label_snapshot: string | null;
    grams_per_measure_snapshot: number | null;
    measure_quantity_snapshot: number | null;
    grams_total_snapshot: number | null;
};

export type MyFoodDetail = MyFoodSummary & {
    recipe_ingredients?: RecipeIngredientSummary[];
};

export type CreateMyFoodPayload = {
    name: string;
    serving_size_quantity: number;
    serving_unit_label: string;
    calories_per_serving: number;
};

export type CreateRecipePayload = {
    name: string;
    serving_size_quantity: number;
    serving_unit_label: string;
    yield_servings: number;
    ingredients: Array<
        | {
              source: 'MY_FOOD';
              sort_order?: number;
              my_food_id: number;
              quantity_servings: number;
          }
        | {
              source: 'EXTERNAL';
              sort_order?: number;
              name: string;
              calories_total: number;
              external_source?: string | null;
              external_id?: string | null;
              brand?: string | null;
              locale?: string | null;
              barcode?: string | null;
              measure_label?: string | null;
              grams_per_measure?: number | null;
              measure_quantity?: number | null;
              grams_total?: number | null;
          }
    >;
};

export type UpdateMyFoodPayload = CreateMyFoodPayload | CreateRecipePayload;

export type TrendMetricEntry = MetricEntry & {
    user_id: number;
    body_fat_percent: number | null;
    trend_weight: number;
    trend_ci_lower: number;
    trend_ci_upper: number;
    trend_std: number;
};

export type TrendMetricsResponse = {
    metrics: TrendMetricEntry[];
    meta: {
        weekly_rate: number;
        volatility: 'low' | 'medium' | 'high';
        total_points: number;
        total_span_days: number;
    };
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

export type SyncChange = {
    cursor: string;
    entity_type: string;
    entity_id: string;
    action: 'upsert' | 'delete';
    operation_id: string | null;
    payload: unknown;
    created_at: string;
};

export type SyncChangesResponse = {
    changes: SyncChange[];
    next_cursor: string;
    has_more: boolean;
};
