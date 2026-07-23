export type PublicLegalSection = {
    title: string;
    paragraphs?: string[];
    bullets?: string[];
};

export const PRIVACY_LAST_UPDATED = 'July 23, 2026';
export const PRIVACY_INTRO = [
    'Calibrate Health ("Calibrate", "we", "us", or "our") respects your privacy. This Privacy Policy explains what information we collect, how we use it, and the choices you have when you use the Calibrate Health application at https://calibratehealth.app.',
    'Calibrate Health is a calorie and weight-tracking tool. It is not a medical service and does not provide medical advice.'
];

export const PRIVACY_SECTIONS: PublicLegalSection[] = [
    {
        title: '1. Information We Collect',
        paragraphs: [
            'You provide health-related data voluntarily so Calibrate can provide its core tracking features. Limited technical information is processed to authenticate requests, protect the Service, and diagnose failures.'
        ],
        bullets: [
            'Account information: email address and encrypted password.',
            'Profile information: date of birth or age, sex, height, time zone, unit preference, activity level, optional profile photo, language, haptic, and reminder preferences.',
            'Health-related data you enter: weight entries, food and calorie logs, custom foods, recipes, and meal entries.',
            'Imported data: food logs and weight entries from supported exports such as Lose It CSV files.',
            'Technical data: IP address, browser and device type, operating system, access dates, and application or session information needed for security.',
            'Food-provider requests: food search text, barcode, requested language, and serving context may be sent to FatSecret, Open Food Facts, or USDA FoodData Central. Calibrate does not include your email or account ID.',
            'Session and notification records: browser sessions linked to an HttpOnly cookie; hashed mobile tokens and device metadata; enabled browser or native push endpoints; and in-app reminder state.',
            'Android Health Connect: when explicitly connected, Calibrate may read enabled steps, active calories, total calories, exercise sessions, and separately enabled weight data.',
            'Health Connect imports include source attribution and synchronization state. Calibrate does not write food records to Health Connect, use Health Connect data for advertising, or automatically change calorie targets from imported activity.',
            'Health Connect records already sent to the selected Calibrate server remain in activity history and exports until account deletion or operator cleanup, even after future synchronization is paused or disconnected.'
        ]
    },
    {
        title: '2. How We Use Your Information',
        paragraphs: ['We use information only to operate and improve the Service. We do not sell or rent data or use it for targeted advertising.'],
        bullets: [
            'Create and manage accounts, authenticate requests, and maintain sessions.',
            'Calculate calorie targets and projections and display trends, Health Connect activity, and optional imported weight.',
            'Store and retrieve tracking data and deliver reminders you enable.',
            'Prepare portable account exports, permanently delete accounts on request, diagnose bugs, and maintain reliability.'
        ]
    },
    {
        title: '3. Cookies and Local Storage',
        paragraphs: [
            'The web client uses an HttpOnly session cookie for authentication. Browser storage may retain non-sensitive app preferences, the selected server origin, and PWA state; browser access and refresh tokens are not stored there.',
            'The Android client stores its server address, secure authentication credentials, Health Connect synchronization state, and a local SQLite queue for pending food, weight, day-status, or tracking-pause changes. We do not use advertising cookies or tracking pixels.'
        ]
    },
    {
        title: '4. Data Storage and Security',
        paragraphs: [
            'Calibrate uses encrypted HTTPS connections, salted password hashes, access-controlled databases, and hashed native authentication tokens. Optional profile photos are resized and stored with the account rather than uploaded to a separate image service.',
            'No system can guarantee absolute security, but we take reasonable measures against unauthorized access, loss, or misuse.'
        ]
    },
    {
        title: '5. Self-Hosted Instances',
        paragraphs: ['Calibrate is open-source and may be self-hosted. This policy applies to the hosted service at https://calibratehealth.app.'],
        bullets: [
            'A self-hosted operator is responsible for its stored data, HTTPS, database access, logs, backups, push configuration, and retention.',
            'The hosted Calibrate service cannot access data on independently hosted instances.',
            'Portable export and password-confirmed deletion operate against the selected instance and do not depend on the hosted service.'
        ]
    },
    {
        title: '6. Data Retention',
        paragraphs: [
            'Profile and tracking data remain in the active database while the account is active unless individual records are edited or deleted. Sessions expire or are revoked, and push subscriptions remain until disabled, rejected, revoked, or removed with the account.',
            'Password-confirmed account deletion removes active profile data, avatar, goals, metrics, food history, day resolutions, tracking-pause history, My Foods, recipes, notifications, Health Connect source records, summaries, sessions, push subscriptions, and synchronization records.'
        ],
        bullets: [
            'Operator-managed backups or security logs follow the operator retention schedule and legal requirements.',
            'Downloaded exports, shared copies, and app-local device data remain under your control and may need separate removal.'
        ]
    },
    {
        title: '7. Your Rights and Choices',
        paragraphs: [
            'Depending on your location, you may have rights to access, correct, delete, or export personal data.',
            'The signed-in versioned JSON export includes account profile, preferences, optional avatar, goals, body metrics, food history, day resolutions, tracking-pause history, My Foods, recipes, notification history, Health Connect source records, and daily activity summaries. Password hashes, tokens, sessions, push endpoints, and internal replay metadata are excluded.',
            'Account deletion requires the current password and cannot be undone. Use the public account deletion instructions for signed-in steps, hosted-service requests, timing, and retention details.'
        ]
    },
    {
        title: "8. Children's Privacy",
        paragraphs: [
            'Calibrate is not intended for children under 13. We do not knowingly collect personal data from children; contact us if you believe a child provided information so it can be deleted.'
        ]
    },
    {
        title: '9. Changes to This Policy',
        paragraphs: [
            'We may update this policy. Material changes are reflected in the Last updated date and, when appropriate, announced within the Service.'
        ]
    },
    {
        title: '10. Contact Us',
        paragraphs: [
            'Privacy questions and hosted-service data requests: privacy@calibratehealth.app.',
            'Website: https://calibratehealth.app.'
        ]
    }
];

export const ACCOUNT_DELETION_RESPONSE_DAYS = 7;
export const ACCOUNT_DELETION_COMPLETION_DAYS = 30;

export const ACCOUNT_DELETION_INTRO = [
    'Calibrate Health is a food, weight, and activity tracking service. This page explains how to permanently delete an account and its associated data.'
];

export const ACCOUNT_DELETION_SECTIONS: PublicLegalSection[] = [
    {
        title: 'Delete immediately while signed in',
        paragraphs: [
            'Sign in, open Settings, find Account, and choose Delete account. Enter your current password to confirm. Deletion from the active Calibrate database is immediate, permanent, and cannot be undone.'
        ]
    },
    {
        title: 'Request hosted-service deletion without the app',
        paragraphs: [
            'If you cannot use the app, email privacy@calibratehealth.app from the address associated with the hosted account. We may ask you to demonstrate control of the address or account. Never send your password by email.',
            `We aim to acknowledge requests within ${ACCOUNT_DELETION_RESPONSE_DAYS} days and complete a verified request within ${ACCOUNT_DELETION_COMPLETION_DAYS} days unless legal requirements require another period. Before verification, status messages do not disclose whether an email belongs to an account.`
        ]
    },
    {
        title: 'Data deleted with the account',
        bullets: [
            'Profile, preferences, inline avatar, goals, body metrics, food logs, day resolutions, tracking-pause history, My Foods, and recipes.',
            'Imported Health Connect source records, daily activity summaries, notifications, and internal synchronization records.',
            'Browser and mobile sessions, authentication tokens, and browser or native push subscriptions.'
        ]
    },
    {
        title: 'Data that may remain temporarily',
        paragraphs: [
            'Operator-managed backups and limited security logs may remain until their retention period expires or longer when required by law. They are not restored for normal product use after deletion. Export files, shared copies, and app-local data on your devices remain under your control and may need separate removal.'
        ]
    },
    {
        title: 'Self-hosted Calibrate instances',
        paragraphs: [
            'A self-hosted instance is controlled by its operator, not the hosted Calibrate service. Use that instance\'s signed-in deletion control or contact its operator. The operator is responsible for database access, logs, backups, retention, and deletion requests; privacy@calibratehealth.app cannot access or delete independently hosted data.'
        ]
    }
];

export function buildAccountDeletionRequestMailto(): string {
    const subject = 'Calibrate hosted account deletion request';
    const body = [
        'Please delete my Calibrate hosted-service account.',
        '',
        'I understand that Calibrate will verify that I control the account before acting.',
        'I will not send my password by email.'
    ].join('\n');
    return `mailto:privacy@calibratehealth.app?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
