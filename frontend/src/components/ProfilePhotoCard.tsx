import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Avatar, Box, Button, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../context/useAuth';
import AppCard from '../ui/AppCard';
import { getAvatarLabel } from '../utils/avatarLabel';
import ProfilePhotoCropDialog from './ProfilePhotoCropDialog';
import { useI18n } from '../i18n/useI18n';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type Props = {
    title?: string;
    description?: string;
};

/**
 * ProfilePhotoCard
 *
 * Lets users pick a local image, crop it into a small avatar, and save it to their account.
 * The actual bytes we store are processed client-side (cropped + resized) before upload.
 */
const ProfilePhotoCard: React.FC<Props> = ({
    title,
    description
}) => {
    const theme = useTheme();
    const { t } = useI18n();
    const { user, updateProfileImage } = useAuth();
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const resolvedTitle = title ?? t('profilePhoto.title');
    const resolvedDescription = description ?? t('profilePhoto.description');

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [cropOpen, setCropOpen] = useState(false);
    const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
    const [isRemoving, setIsRemoving] = useState(false);

    const avatarLabel = useMemo(() => getAvatarLabel(user?.email), [user?.email]);
    const hasPhoto = Boolean(user?.profile_image_url);
    const avatarSize = theme.spacing(9);

    useEffect(() => {
        if (!selectedImageUrl) return;
        return () => URL.revokeObjectURL(selectedImageUrl);
    }, [selectedImageUrl]);

    const handlePickFile = (file?: File) => {
        setError('');
        setSuccess('');

        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setError(t('profilePhoto.error.chooseImage'));
            return;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
            setError(t('profilePhoto.error.tooLarge'));
            return;
        }

        const objectUrl = URL.createObjectURL(file);
        setSelectedImageUrl(objectUrl);
        setCropOpen(true);
    };

    const handleRemove = async () => {
        setError('');
        setSuccess('');
        setIsRemoving(true);
        try {
            await updateProfileImage(null);
            setSuccess(t('profilePhoto.success.removed'));
        } catch (err) {
            if (import.meta.env.DEV) {
                console.error(err);
            }
            setError(t('profilePhoto.error.removeFailed'));
        } finally {
            setIsRemoving(false);
        }
    };

    return (
        <>
            <AppCard>
                <Stack spacing={2}>
                    <Box>
                        <Typography variant="h6">{resolvedTitle}</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {resolvedDescription}
                        </Typography>
                    </Box>

                    {error && <Alert severity="error">{error}</Alert>}
                    {success && <Alert severity="success">{success}</Alert>}

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                        <Avatar
                            src={user?.profile_image_url ?? undefined}
                            sx={{
                                width: avatarSize,
                                height: avatarSize,
                                bgcolor: (t) => t.palette.action.hover,
                                fontWeight: 900,
                                fontSize: '1.25rem'
                            }}
                        >
                            {avatarLabel}
                        </Avatar>

                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Button
                                variant={hasPhoto ? 'outlined' : 'contained'}
                                component="label"
                                disabled={!user}
                            >
                                {hasPhoto ? t('profilePhoto.changePhoto') : t('profilePhoto.addPhoto')}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    hidden
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        // Allow selecting the same file again after closing the dialog.
                                        e.target.value = '';
                                        handlePickFile(file);
                                    }}
                                />
                            </Button>

                            {hasPhoto && (
                                <Button
                                    variant="text"
                                    color="error"
                                    onClick={() => void handleRemove()}
                                    disabled={isRemoving}
                                >
                                    {t('profilePhoto.remove')}
                                </Button>
                            )}
                        </Stack>
                    </Stack>
                </Stack>
            </AppCard>

            <ProfilePhotoCropDialog
                open={cropOpen}
                imageUrl={selectedImageUrl}
                onCancel={() => {
                    setCropOpen(false);
                    setSelectedImageUrl(null);
                }}
                onConfirm={async (dataUrl) => {
                    setError('');
                    setSuccess('');
                    await updateProfileImage(dataUrl);
                    setSuccess(t('profilePhoto.success.updated'));
                    setCropOpen(false);
                    setSelectedImageUrl(null);
                }}
            />
        </>
    );
};

export default ProfilePhotoCard;
