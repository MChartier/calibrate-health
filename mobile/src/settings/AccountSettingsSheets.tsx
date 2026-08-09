import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ActivityLevel, HeightUnit, Sex } from '@calibrate/shared';
import { canSubmitAccountDeletion, DELETE_ACCOUNT_CONFIRMATION } from '../account/accountData';
import { AppButton } from '../components/AppButton';
import { AppText } from '../components/AppText';
import { BottomSheetModal } from '../components/BottomSheetModal';
import {
    ProfileEnergyFields,
    ProfileIdentityFields
} from '../components/profile/ProfileDetailsFields';
import { TextField } from '../components/TextField';
import { TimeZonePickerField } from '../components/TimeZonePickerField';
import { spacing, useAppTheme } from '../theme';
import { getTodayDate } from '../utils/dates';
import { formatCalories } from '../utils/format';
import { getSafeActionErrorMessage } from '../errors/presentation';
import { getMinimumDateOfBirth } from '../caloriePlanning/dateBounds';
import { confirmDiscardChanges } from '../components/confirmDiscardChanges';

type ProfileEditorSheetProps = {
    visible: boolean;
    timezone: string;
    onTimezoneChange: (value: string) => void;
    dateOfBirth: string;
    onDateOfBirthChange: (value: string) => void;
    sex: Sex | null;
    onSexChange: (value: Sex | null) => void;
    activityLevel: ActivityLevel | null;
    onActivityLevelChange: (value: ActivityLevel | null) => void;
    heightUnit: HeightUnit;
    heightCm: string;
    onHeightCmChange: (value: string) => void;
    heightFeet: string;
    onHeightFeetChange: (value: string) => void;
    heightInches: string;
    onHeightInchesChange: (value: string) => void;
    calorieTarget?: number | null;
    validationError?: string | null;
    saveError: Error | null;
    isSaving: boolean;
    isDirty: boolean;
    onClose: () => void;
    onSave: () => void;
};

export function ProfileEditorSheet({
    visible,
    timezone,
    onTimezoneChange,
    dateOfBirth,
    onDateOfBirthChange,
    sex,
    onSexChange,
    activityLevel,
    onActivityLevelChange,
    heightUnit,
    heightCm,
    onHeightCmChange,
    heightFeet,
    onHeightFeetChange,
    heightInches,
    onHeightInchesChange,
    calorieTarget,
    validationError,
    saveError,
    isSaving,
    isDirty,
    onClose,
    onSave
}: ProfileEditorSheetProps) {
    const { colors } = useAppTheme();

    async function handleCancel() {
        if (!isDirty || await confirmDiscardChanges()) onClose();
    }

    return (
        <BottomSheetModal
            visible={visible}
            accessibilityLabel="Profile details"
            title="Profile details"
            description="Time zone and body details used for calorie targets."
            maxHeight="92%"
            size="wide"
            showCloseButton
            dismissDisabled={isSaving}
            isDirty={isDirty}
            confirmDismiss={confirmDiscardChanges}
            onRequestClose={onClose}
        >
            <TimeZonePickerField value={timezone} onChange={onTimezoneChange} />
            <ProfileIdentityFields
                dateOfBirth={dateOfBirth}
                minimumDate={getMinimumDateOfBirth(getTodayDate(timezone))}
                maximumDate={getTodayDate(timezone)}
                onDateOfBirthChange={onDateOfBirthChange}
                sex={sex}
                onSexChange={onSexChange}
            />
            <ProfileEnergyFields
                activityLevel={activityLevel}
                onActivityLevelChange={onActivityLevelChange}
                heightUnit={heightUnit}
                heightCm={heightCm}
                onHeightCmChange={onHeightCmChange}
                heightFeet={heightFeet}
                onHeightFeetChange={onHeightFeetChange}
                heightInches={heightInches}
                onHeightInchesChange={onHeightInchesChange}
                heightLayout="row"
            />
            <AppText variant="muted">Current calorie target: {formatCalories(calorieTarget)}</AppText>
            {validationError && (
                <AppText accessibilityRole="alert" style={{ color: colors.danger }}>
                    {validationError}
                </AppText>
            )}
            {saveError && (
                <AppText accessibilityRole="alert" style={{ color: colors.danger }}>
                    {getSafeActionErrorMessage(saveError, 'Unable to save your profile.')}
                </AppText>
            )}
            <View style={styles.row}>
                <AppButton
                    title="Cancel"
                    variant="secondary"
                    leftIcon={<Ionicons name="close" size={18} color={colors.onSurface} />}
                    disabled={isSaving}
                    onPress={() => { void handleCancel(); }}
                    style={styles.rowButton}
                />
                <AppButton
                    title={isSaving ? 'Saving...' : 'Save'}
                    disabled={isSaving}
                    leftIcon={<Ionicons name="checkmark" size={18} color={colors.onPrimary} />}
                    onPress={onSave}
                    style={styles.rowButton}
                />
            </View>
        </BottomSheetModal>
    );
}

type DeleteAccountSheetProps = {
    visible: boolean;
    isOutboxReady: boolean;
    password: string;
    onPasswordChange: (value: string) => void;
    confirmation: string;
    onConfirmationChange: (value: string) => void;
    error: Error | null;
    isDeleting: boolean;
    onClose: () => void;
    onConfirm: () => void;
};

export function DeleteAccountSheet({
    visible,
    isOutboxReady,
    password,
    onPasswordChange,
    confirmation,
    onConfirmationChange,
    error,
    isDeleting,
    onClose,
    onConfirm
}: DeleteAccountSheetProps) {
    const { colors } = useAppTheme();
    const canDelete = canSubmitAccountDeletion(password, confirmation);
    const isDirty = Boolean(password || confirmation);

    async function handleCancel() {
        if (!isDirty || await confirmDiscardChanges()) onClose();
    }

    return (
        <BottomSheetModal
            visible={visible}
            accessibilityLabel="Delete account permanently"
            title="Delete account permanently"
            description={isOutboxReady
                ? 'This cannot be undone. Pending offline changes on this device will also be discarded.'
                : 'This cannot be undone. Browser changes are sent directly and there is no local write queue to discard.'}
            showCloseButton
            dismissDisabled={isDeleting}
            isDirty={isDirty}
            confirmDismiss={confirmDiscardChanges}
            onRequestClose={onClose}
        >
            <TextField
                label="Current password"
                secureTextEntry
                value={password}
                onChangeText={onPasswordChange}
                editable={!isDeleting}
            />
            <TextField
                label={`Type ${DELETE_ACCOUNT_CONFIRMATION}`}
                value={confirmation}
                onChangeText={onConfirmationChange}
                autoCapitalize="characters"
                editable={!isDeleting}
            />
            {error && (
                <AppText accessibilityRole="alert" style={{ color: colors.danger }}>
                    {getSafeActionErrorMessage(error, 'Unable to delete this account.')}
                </AppText>
            )}
            <View style={styles.row}>
                <AppButton
                    title="Cancel"
                    variant="secondary"
                    disabled={isDeleting}
                    onPress={() => { void handleCancel(); }}
                    style={styles.rowButton}
                />
                <AppButton
                    title={isDeleting ? 'Deleting...' : 'Delete forever'}
                    variant="danger"
                    disabled={isDeleting || !canDelete}
                    onPress={onConfirm}
                    style={styles.rowButton}
                />
            </View>
        </BottomSheetModal>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        gap: spacing.md
    },
    rowButton: {
        flex: 1
    }
});
