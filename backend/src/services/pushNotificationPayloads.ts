export type PushNotificationAction = {
    action: string;
    title: string;
};

export type PushNotificationPayload = {
    title: string;
    body: string;
    url?: string;
    tag?: string;
    actions?: PushNotificationAction[];
    actionUrls?: Record<string, string>;
};

const QUICK_ADD_BASE_PATH = '/log'; // Route used for quick-add notification deep links.
const QUICK_ADD_QUERY_PARAM = 'quickAdd'; // Matches frontend quick-add query param name.
const QUICK_ADD_ACTIONS = {
    weight: 'weight',
    food: 'food'
} as const;

export const REMINDER_ACTION_IDS = {
    logWeight: 'log_weight',
    logFood: 'log_food'
} as const;

export const REMINDER_ACTIONS: PushNotificationAction[] = [
    { action: REMINDER_ACTION_IDS.logWeight, title: 'Log weight' },
    { action: REMINDER_ACTION_IDS.logFood, title: 'Log food' }
];

const buildQuickAddUrl = (action: typeof QUICK_ADD_ACTIONS[keyof typeof QUICK_ADD_ACTIONS]): string => {
    return `${QUICK_ADD_BASE_PATH}?${QUICK_ADD_QUERY_PARAM}=${action}`;
};

export const REMINDER_ACTION_URLS: Record<string, string> = {
    [REMINDER_ACTION_IDS.logWeight]: buildQuickAddUrl(QUICK_ADD_ACTIONS.weight),
    [REMINDER_ACTION_IDS.logFood]: buildQuickAddUrl(QUICK_ADD_ACTIONS.food)
};

type ReminderPayloadOptions = {
    missingWeight: boolean;
    missingFood: boolean;
};

/**
 * Build a reminder payload tailored to today's missing logs.
 */
export const buildReminderPayload = (options: ReminderPayloadOptions): PushNotificationPayload => {
    const { missingWeight, missingFood } = options;
    const missingBoth = missingWeight && missingFood;

    let body = 'Log your progress for today.';
    let url = '/log';
    let tag = 'reminder';

    if (missingBoth) {
        body = 'Log your weight and food for today.';
        url = '/log';
        tag = 'reminder-both';
    } else if (missingWeight) {
        body = 'Log your weight for today.';
        url = REMINDER_ACTION_URLS[REMINDER_ACTION_IDS.logWeight];
        tag = 'reminder-weight';
    } else if (missingFood) {
        body = 'Log your food for today.';
        url = REMINDER_ACTION_URLS[REMINDER_ACTION_IDS.logFood];
        tag = 'reminder-food';
    }

    return {
        title: 'calibrate',
        body,
        url,
        tag,
        actions: REMINDER_ACTIONS,
        actionUrls: REMINDER_ACTION_URLS
    };
};
