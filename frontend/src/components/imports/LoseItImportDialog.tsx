import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Switch,
    ToggleButton,
    ToggleButtonGroup,
    Typography
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import axios from 'axios';
import { WEIGHT_UNITS, type WeightUnit } from '../../context/authContext';
import { useI18n } from '../../i18n/useI18n';
import { getApiErrorMessage } from '../../utils/apiError';

const DIALOG_CONTENT_SPACING = 2; // Controls vertical spacing between import wizard sections.
const SUMMARY_ROW_SPACING = 0.75; // Keeps preview counts visually grouped but compact.
const OPTIONS_SECTION_SPACING = 1.5; // Separates option controls without overwhelming the dialog.
const WARNING_LIST_SPACING = 0.5; // Tight list spacing for warning callouts.

type FoodConflictMode = 'MERGE' | 'REPLACE' | 'SKIP';
type WeightConflictMode = 'KEEP' | 'OVERWRITE';

type LoseItImportPreview = {
    summary: {
        foodLogs: number;
        foodLogDays: number;
        weights: number;
        bodyFat: number;
        startDate: string | null;
        endDate: string | null;
    };
    conflicts: {
        foodLogDays: number;
        weightDays: number;
    };
    warnings: string[];
    weightUnitGuess: WeightUnit;
    weightUnitGuessSource: 'profile' | 'heuristic' | 'fallback';
};

type LoseItImportResult = {
    importedFoodLogs: number;
    skippedFoodLogs: number;
    importedWeights: number;
    updatedWeights: number;
    skippedWeights: number;
    updatedBodyFat: number;
    warnings: string[];
};

export type LoseItImportSummary = {
    foodLogsImported: number;
    weightEntriesImported: number;
    weightEntriesUpdated: number;
    bodyFatUpdated: number;
};

type LoseItImportDialogProps = {
    open: boolean;
    onClose: () => void;
    onComplete?: (summary: LoseItImportSummary) => void;
    defaultWeightUnit: WeightUnit;
};

type ImportStep = 'select' | 'preview' | 'complete';

/**
 * Dialog flow for importing a Lose It export zip.
 */
const LoseItImportDialog: React.FC<LoseItImportDialogProps> = ({ open, onClose, onComplete, defaultWeightUnit }) => {
    const theme = useTheme();
    const { t } = useI18n();
    const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

    const [step, setStep] = useState<ImportStep>('select');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<LoseItImportPreview | null>(null);
    const [result, setResult] = useState<LoseItImportResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

    const [foodConflictMode, setFoodConflictMode] = useState<FoodConflictMode>('MERGE');
    const [weightConflictMode, setWeightConflictMode] = useState<WeightConflictMode>('KEEP');
    const [includeBodyFat, setIncludeBodyFat] = useState(true);
    const [weightUnit, setWeightUnit] = useState<WeightUnit>(defaultWeightUnit);
    const [hasCustomWeightUnit, setHasCustomWeightUnit] = useState(false);

    useEffect(() => {
        if (!open) return;
        setStep('select');
        setSelectedFile(null);
        setPreview(null);
        setResult(null);
        setError(null);
        setIsPreviewing(false);
        setIsImporting(false);
        setFoodConflictMode('MERGE');
        setWeightConflictMode('KEEP');
        setIncludeBodyFat(true);
        setWeightUnit(defaultWeightUnit);
        setHasCustomWeightUnit(false);
    }, [defaultWeightUnit, open]);

    useEffect(() => {
        if (!preview || hasCustomWeightUnit) return;
        setWeightUnit(preview.weightUnitGuess);
    }, [hasCustomWeightUnit, preview]);

    const weightUnitHint = useMemo(() => {
        if (!preview) return null;
        if (preview.weightUnitGuessSource === 'profile') return t('import.loseit.weightUnitHint.profile');
        if (preview.weightUnitGuessSource === 'heuristic') return t('import.loseit.weightUnitHint.heuristic');
        return t('import.loseit.weightUnitHint.fallback');
    }, [preview, t]);

    const weightUnitLabel = weightUnit === WEIGHT_UNITS.KG ? 'kg' : 'lb';

    const handleClose = () => {
        if (isImporting) return;
        onClose();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] ?? null;
        setSelectedFile(file);
        setPreview(null);
        setResult(null);
        setError(null);
        setStep('select');
    };

    const requestPreview = async () => {
        if (!selectedFile) {
            setError(t('import.loseit.error.missingFile'));
            return;
        }

        setError(null);
        setIsPreviewing(true);
        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            const res = await axios.post('/api/imports/loseit/preview', formData);
            setPreview(res.data as LoseItImportPreview);
            setStep('preview');
        } catch (err) {
            setError(getApiErrorMessage(err) ?? t('import.loseit.error.previewFailed'));
        } finally {
            setIsPreviewing(false);
        }
    };

    const executeImport = async () => {
        if (!selectedFile || !preview) return;

        setError(null);
        setIsImporting(true);
        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('weight_unit', weightUnit);
            formData.append('food_conflict_mode', foodConflictMode);
            formData.append('weight_conflict_mode', weightConflictMode);
            formData.append('include_body_fat', includeBodyFat ? 'true' : 'false');

            const res = await axios.post('/api/imports/loseit/execute', formData);
            const data = res.data as LoseItImportResult;
            setResult(data);
            setStep('complete');
            onComplete?.({
                foodLogsImported: data.importedFoodLogs,
                weightEntriesImported: data.importedWeights,
                weightEntriesUpdated: data.updatedWeights,
                bodyFatUpdated: data.updatedBodyFat
            });
        } catch (err) {
            setError(getApiErrorMessage(err) ?? t('import.loseit.error.importFailed'));
        } finally {
            setIsImporting(false);
        }
    };

    const foodConflictOptions = useMemo(
        () => [
            { value: 'MERGE', label: t('import.loseit.foodConflict.merge') },
            { value: 'REPLACE', label: t('import.loseit.foodConflict.replace') },
            { value: 'SKIP', label: t('import.loseit.foodConflict.skip') }
        ],
        [t]
    );

    const weightConflictOptions = useMemo(
        () => [
            { value: 'KEEP', label: t('import.loseit.weightConflict.keep') },
            { value: 'OVERWRITE', label: t('import.loseit.weightConflict.overwrite') }
        ],
        [t]
    );

    let dialogBody: React.ReactNode = null;
    if (step === 'select') {
        dialogBody = (
            <Stack spacing={DIALOG_CONTENT_SPACING}>
                <Typography color="text.secondary">
                    {t('import.loseit.dialogDescription')}
                </Typography>
                <Box>
                    <Button variant="outlined" component="label">
                        {t('import.loseit.chooseFile')}
                        <input type="file" hidden accept=".zip" onChange={handleFileChange} />
                    </Button>
                    {selectedFile && (
                        <Typography variant="body2" sx={{ mt: 1 }}>
                            {t('import.loseit.selectedFile', { name: selectedFile.name })}
                        </Typography>
                    )}
                </Box>
            </Stack>
        );
    } else if (step === 'preview' && preview) {
        dialogBody = (
            <Stack spacing={DIALOG_CONTENT_SPACING}>
                <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                        {t('import.loseit.previewTitle')}
                    </Typography>
                    <Stack spacing={SUMMARY_ROW_SPACING}>
                        <Typography variant="body2">
                            {t('import.loseit.summaryLine', {
                                foods: preview.summary.foodLogs,
                                days: preview.summary.foodLogDays,
                                weights: preview.summary.weights
                            })}
                        </Typography>
                        {preview.summary.startDate && preview.summary.endDate && (
                            <Typography variant="body2" color="text.secondary">
                                {t('import.loseit.dateRange', {
                                    start: preview.summary.startDate,
                                    end: preview.summary.endDate
                                })}
                            </Typography>
                        )}
                    </Stack>
                </Box>

                {(preview.conflicts.foodLogDays > 0 || preview.conflicts.weightDays > 0) && (
                    <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                            {t('import.loseit.conflictsTitle')}
                        </Typography>
                        <Stack spacing={0.5}>
                            {preview.conflicts.foodLogDays > 0 && (
                                <Typography variant="body2" color="text.secondary">
                                    {t('import.loseit.conflicts.foodDays', { count: preview.conflicts.foodLogDays })}
                                </Typography>
                            )}
                            {preview.conflicts.weightDays > 0 && (
                                <Typography variant="body2" color="text.secondary">
                                    {t('import.loseit.conflicts.weightDays', { count: preview.conflicts.weightDays })}
                                </Typography>
                            )}
                        </Stack>
                    </Box>
                )}

                <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                        {t('import.loseit.optionsTitle')}
                    </Typography>
                    <Stack spacing={OPTIONS_SECTION_SPACING}>
                        <FormControl fullWidth>
                            <InputLabel>{t('import.loseit.foodConflictLabel')}</InputLabel>
                            <Select
                                value={foodConflictMode}
                                label={t('import.loseit.foodConflictLabel')}
                                onChange={(event) => setFoodConflictMode(event.target.value as FoodConflictMode)}
                            >
                                {foodConflictOptions.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>
                                        {option.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl fullWidth>
                            <InputLabel>{t('import.loseit.weightConflictLabel')}</InputLabel>
                            <Select
                                value={weightConflictMode}
                                label={t('import.loseit.weightConflictLabel')}
                                onChange={(event) => setWeightConflictMode(event.target.value as WeightConflictMode)}
                            >
                                {weightConflictOptions.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>
                                        {option.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <Box>
                            <Typography variant="body2" sx={{ mb: 0.5 }}>
                                {t('import.loseit.weightUnitLabel')}
                            </Typography>
                            <ToggleButtonGroup
                                value={weightUnit}
                                exclusive
                                size="small"
                                onChange={(_event, value: WeightUnit | null) => {
                                    if (!value) return;
                                    setHasCustomWeightUnit(true);
                                    setWeightUnit(value);
                                }}
                            >
                                <ToggleButton value={WEIGHT_UNITS.LB}>lb</ToggleButton>
                                <ToggleButton value={WEIGHT_UNITS.KG}>kg</ToggleButton>
                            </ToggleButtonGroup>
                            {weightUnitHint && (
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                    {weightUnitHint} ({weightUnitLabel})
                                </Typography>
                            )}
                        </Box>

                        <FormControlLabel
                            control={
                                <Switch
                                    checked={includeBodyFat}
                                    onChange={(event) => setIncludeBodyFat(event.target.checked)}
                                />
                            }
                            label={t('import.loseit.includeBodyFat')}
                        />
                    </Stack>
                </Box>

                {preview.warnings.length > 0 && (
                    <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                            {t('import.loseit.warningsTitle')}
                        </Typography>
                        <Stack spacing={WARNING_LIST_SPACING}>
                            {preview.warnings.map((warning, idx) => (
                                <Typography key={`${warning}-${idx}`} variant="body2" color="text.secondary">
                                    {warning}
                                </Typography>
                            ))}
                        </Stack>
                    </Box>
                )}
            </Stack>
        );
    } else if (step === 'complete' && result) {
        const totalWeights = result.importedWeights + result.updatedWeights;
        dialogBody = (
            <Stack spacing={DIALOG_CONTENT_SPACING}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {t('import.loseit.completeTitle')}
                </Typography>
                <Typography variant="body2">
                    {t('import.loseit.completeSummary', {
                        foods: result.importedFoodLogs,
                        weights: totalWeights
                    })}
                </Typography>
                {(result.skippedFoodLogs > 0 || result.skippedWeights > 0) && (
                    <Typography variant="body2" color="text.secondary">
                        {t('import.loseit.completeSkipped', {
                            foods: result.skippedFoodLogs,
                            weights: result.skippedWeights
                        })}
                    </Typography>
                )}
                {result.updatedBodyFat > 0 && (
                    <Typography variant="body2" color="text.secondary">
                        {t('import.loseit.completeBodyFat', { count: result.updatedBodyFat })}
                    </Typography>
                )}
                {result.warnings.length > 0 && (
                    <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                            {t('import.loseit.warningsTitle')}
                        </Typography>
                        <Stack spacing={WARNING_LIST_SPACING}>
                            {result.warnings.map((warning, idx) => (
                                <Typography key={`${warning}-${idx}`} variant="body2" color="text.secondary">
                                    {warning}
                                </Typography>
                            ))}
                        </Stack>
                    </Box>
                )}
            </Stack>
        );
    }

    let dialogActions: React.ReactNode = null;
    if (step === 'select') {
        dialogActions = (
            <>
                <Button onClick={handleClose}>{t('common.cancel')}</Button>
                <Button variant="contained" onClick={requestPreview} disabled={isPreviewing}>
                    {isPreviewing ? t('common.loading') : t('import.loseit.previewButton')}
                </Button>
            </>
        );
    } else if (step === 'preview') {
        dialogActions = (
            <>
                <Button onClick={() => setStep('select')} disabled={isImporting}>
                    {t('common.back')}
                </Button>
                <Button variant="contained" onClick={executeImport} disabled={isImporting}>
                    {isImporting ? t('import.loseit.importing') : t('import.loseit.importButton')}
                </Button>
            </>
        );
    } else if (step === 'complete') {
        dialogActions = (
            <Button variant="contained" onClick={handleClose}>
                {t('import.loseit.doneButton')}
            </Button>
        );
    }

    return (
        <Dialog open={open} onClose={handleClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
            <DialogTitle>{t('import.loseit.dialogTitle')}</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={DIALOG_CONTENT_SPACING}>
                    {error && <Alert severity="error">{error}</Alert>}
                    {dialogBody}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>{dialogActions}</DialogActions>
        </Dialog>
    );
};

export default LoseItImportDialog;
