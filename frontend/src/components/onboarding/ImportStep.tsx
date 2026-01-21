import React from 'react';
import { Alert, Box, Button, Chip, Stack, Typography } from '@mui/material';
import { useI18n } from '../../i18n/useI18n';
import type { LoseItImportSummary } from '../imports/LoseItImportDialog';

/**
 * Onboarding step that introduces optional import flows.
 */
const IMPORT_STEP_SPACING = 2; // Controls vertical rhythm in the import step content.
const IMPORT_BADGE_GAP = 1; // Keeps the optional badge aligned with the title.

type ImportStepProps = {
    onOpenImport: () => void;
    summary: LoseItImportSummary | null;
};

/**
 * Optional onboarding step that invites users to import Lose It history.
 */
const ImportStep: React.FC<ImportStepProps> = ({ onOpenImport, summary }) => {
    const { t } = useI18n();
    const totalWeights = summary ? summary.weightEntriesImported + summary.weightEntriesUpdated : 0;

    return (
        <Stack spacing={IMPORT_STEP_SPACING}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: IMPORT_BADGE_GAP }}>
                <Typography variant="h5">{t('onboarding.import.title')}</Typography>
                <Chip size="small" label={t('onboarding.import.optional')} />
            </Box>
            <Typography color="text.secondary">
                {t('onboarding.import.body')}
            </Typography>
            <Button variant="outlined" onClick={onOpenImport}>
                {t('onboarding.import.button')}
            </Button>
            {summary && (
                <Alert severity="success">
                    {t('onboarding.import.summary', {
                        foods: summary.foodLogsImported,
                        weights: totalWeights
                    })}
                </Alert>
            )}
        </Stack>
    );
};

export default ImportStep;
