import React, { useState } from 'react';
import { Button, Stack, Typography } from '@mui/material';
import { useAuth } from '../../context/useAuth';
import { WEIGHT_UNITS } from '../../context/authContext';
import { useI18n } from '../../i18n/useI18n';
import { useTransientStatus } from '../../hooks/useTransientStatus';
import AppCard from '../../ui/AppCard';
import InlineStatusLine from '../../ui/InlineStatusLine';
import SectionHeader from '../../ui/SectionHeader';
import LoseItImportDialog, { type LoseItImportSummary } from './LoseItImportDialog';

/**
 * Settings card that launches the Lose It import flow.
 */
const CARD_CONTENT_SPACING = 1.5; // Keeps description and CTA grouped without crowding.

const LoseItImportCard: React.FC = () => {
    const { t } = useI18n();
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const { status, showStatus } = useTransientStatus();

    const handleImportComplete = (summary: LoseItImportSummary) => {
        const totalWeights = summary.weightEntriesImported + summary.weightEntriesUpdated;
        showStatus(
            t('import.loseit.completeSummary', {
                foods: summary.foodLogsImported,
                weights: totalWeights
            }),
            'success'
        );
    };

    return (
        <AppCard>
            <SectionHeader title={t('settings.importTitle')} sx={{ mb: 0.5 }} />
            <InlineStatusLine status={status} sx={{ mb: 1 }} />
            <Stack spacing={CARD_CONTENT_SPACING}>
                <Typography color="text.secondary">
                    {t('settings.importDescription')}
                </Typography>
                <Button variant="outlined" onClick={() => setOpen(true)}>
                    {t('import.loseit.openButton')}
                </Button>
            </Stack>

            <LoseItImportDialog
                open={open}
                onClose={() => setOpen(false)}
                onComplete={handleImportComplete}
                defaultWeightUnit={user?.weight_unit ?? WEIGHT_UNITS.KG}
            />
        </AppCard>
    );
};

export default LoseItImportCard;
