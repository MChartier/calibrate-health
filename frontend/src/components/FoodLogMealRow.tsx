import React from 'react';
import {
    Avatar,
    Box,
    Button,
    Collapse,
    IconButton,
    Skeleton,
    Stack,
    Tooltip,
    Typography
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import { alpha, useTheme } from '@mui/material/styles';
import type { MealPeriod } from '../types/mealPeriod';
import { formatServingSnapshotLabel } from '../utils/servingDisplay';
import { getMealPeriodAccentColor } from '../utils/mealColors';
import MealPeriodIcon from './MealPeriodIcon';
import { useI18n } from '../i18n/useI18n';

export type FoodLogMealEntry = {
    id: number | string;
    name?: string;
    calories?: number;
    servings_consumed?: number | null;
    serving_size_quantity_snapshot?: number | null;
    serving_unit_label_snapshot?: string | null;
    calories_per_serving_snapshot?: number | null;
};

export type FoodLogMealRowProps = {
    mealPeriod: MealPeriod;
    label: string;
    entries: FoodLogMealEntry[];
    totalCalories: number;
    isLoading?: boolean;
    isFirst?: boolean;
    isLast?: boolean;
    isExpanded: boolean;
    onAdd: (mealPeriod: MealPeriod) => void;
    onEdit: (entry: FoodLogMealEntry) => void;
    onDelete: (entry: FoodLogMealEntry) => void;
    onToggleExpanded: (mealPeriod: MealPeriod) => void;
};

const TIMELINE_ICON_SIZE_PX = { xs: 34, sm: 38 }; // Meal icon target size in the daily timeline.
const TIMELINE_ROW_PADDING_Y_PX = { xs: 6, sm: 7 }; // Vertical row breathing room while keeping connectors continuous.
const TIMELINE_LINE_WIDTH_PX = 2; // Width of the vertical line connecting meal periods.
const ENTRY_ACTION_ICON_SIZE = 'small' as const; // Keeps inline edit/delete actions secondary to the add action.
const ENTRY_ROW_ACTION_FADE = { xs: 1, md: 0 }; // Desktop row actions stay hidden until hover/focus; touch screens keep them visible.
const TIMELINE_ICON_RADIUS_VAR = '--today-meal-icon-radius'; // Stops timeline segments at the icon edge.
const TIMELINE_ROW_PADDING_VAR = '--today-meal-row-padding-y'; // Lets the connector align to the icon center across breakpoints.
const EMPTY_MEAL_CHEVRON_SLOT_PX = 32; // Reserves the disclosure slot so empty meals align with expanded meals.

type FoodLogEntryRowProps = {
    entry: FoodLogMealEntry;
    onEdit: (entry: FoodLogMealEntry) => void;
    onDelete: (entry: FoodLogMealEntry) => void;
};

/**
 * Quiet inline food entry row. Desktop edit/delete affordances reveal on hover/focus.
 */
const FoodLogEntryRow: React.FC<FoodLogEntryRowProps> = ({ entry, onEdit, onDelete }) => {
    const { t } = useI18n();
    const servingLabel = formatServingSnapshotLabel({
        servingsConsumed: entry.servings_consumed ?? null,
        servingSizeQuantity: entry.serving_size_quantity_snapshot ?? null,
        servingUnitLabel: entry.serving_unit_label_snapshot ?? null
    });

    const caloriesValue = typeof entry.calories === 'number' ? entry.calories : '-';
    const caloriesLabel = t('foodLog.entryCalories', { calories: caloriesValue });

    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                alignItems: 'center',
                gap: { xs: 0.75, sm: 1 },
                py: 0.65,
                borderTop: (theme) =>
                    `1px solid ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.1 : 0.08)}`,
                '&:hover .food-entry-actions, &:focus-within .food-entry-actions': {
                    opacity: 1
                },
                '&:hover .food-entry-delete, &:focus-within .food-entry-delete': {
                    color: 'error.main'
                }
            }}
        >
            <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 580 }}>
                    {entry.name}
                </Typography>
                {servingLabel && (
                    <Typography variant="caption" noWrap sx={{ color: 'text.secondary', display: 'block' }}>
                        {servingLabel}
                    </Typography>
                )}
            </Box>

            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    flexDirection: { xs: 'column', sm: 'row' },
                    gap: { xs: 0.25, sm: 0.5 },
                    minWidth: 0
                }}
            >
                <Typography
                    variant="body2"
                    aria-label={caloriesLabel}
                    sx={{
                        color: 'text.secondary',
                        whiteSpace: 'nowrap',
                        textAlign: 'right',
                        fontSize: { xs: '0.8rem', sm: '0.875rem' }
                    }}
                >
                    {caloriesLabel}
                </Typography>
                <Box
                    className="food-entry-actions"
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.25,
                        opacity: ENTRY_ROW_ACTION_FADE,
                        transition: 'opacity 120ms ease',
                        '& .MuiIconButton-root': {
                            width: { xs: 28, sm: 32 },
                            height: { xs: 28, sm: 32 }
                        }
                    }}
                >
                    <Tooltip title={t('foodLog.editEntry')}>
                        <span>
                            <IconButton size={ENTRY_ACTION_ICON_SIZE} onClick={() => onEdit(entry)}>
                                <EditRoundedIcon fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title={t('foodLog.deleteEntry')}>
                        <span>
                            <IconButton
                                className="food-entry-delete"
                                size={ENTRY_ACTION_ICON_SIZE}
                                onClick={() => onDelete(entry)}
                                sx={{
                                    color: (theme) =>
                                        alpha(theme.palette.error.main, theme.palette.mode === 'dark' ? 0.5 : 0.42),
                                    transition: 'color 120ms ease'
                                }}
                            >
                                <DeleteRoundedIcon fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>
                </Box>
            </Box>
        </Box>
    );
};

/**
 * One meal row inside the daily food timeline.
 */
const FoodLogMealRow: React.FC<FoodLogMealRowProps> = ({
    mealPeriod,
    label,
    entries,
    totalCalories,
    isLoading = false,
    isFirst = false,
    isLast = false,
    isExpanded,
    onAdd,
    onEdit,
    onDelete,
    onToggleExpanded
}) => {
    const { t } = useI18n();
    const theme = useTheme();
    const accentColor = getMealPeriodAccentColor(theme, mealPeriod);
    const hasEntries = entries.length > 0;

    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: { xs: `${TIMELINE_ICON_SIZE_PX.xs}px minmax(0, 1fr)`, sm: `${TIMELINE_ICON_SIZE_PX.sm}px minmax(0, 1fr)` },
                columnGap: { xs: 1.25, sm: 1.5 },
                position: 'relative',
                [TIMELINE_ICON_RADIUS_VAR]: {
                    xs: `${TIMELINE_ICON_SIZE_PX.xs / 2}px`,
                    sm: `${TIMELINE_ICON_SIZE_PX.sm / 2}px`
                },
                [TIMELINE_ROW_PADDING_VAR]: {
                    xs: `${TIMELINE_ROW_PADDING_Y_PX.xs}px`,
                    sm: `${TIMELINE_ROW_PADDING_Y_PX.sm}px`
                }
            }}
        >
            <Box
                sx={{
                    position: 'relative',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    py: `var(${TIMELINE_ROW_PADDING_VAR})`,
                    '&::before': {
                        content: '""',
                        position: 'absolute',
                        top: isFirst ? `calc(var(${TIMELINE_ROW_PADDING_VAR}) + var(${TIMELINE_ICON_RADIUS_VAR}))` : 0,
                        bottom: isLast ? `calc(100% - var(${TIMELINE_ROW_PADDING_VAR}) - var(${TIMELINE_ICON_RADIUS_VAR}))` : 0,
                        width: TIMELINE_LINE_WIDTH_PX,
                        bgcolor: 'divider'
                    }
                }}
            >
                <Avatar
                    sx={{
                        width: TIMELINE_ICON_SIZE_PX,
                        height: TIMELINE_ICON_SIZE_PX,
                        bgcolor: 'background.paper',
                        color: accentColor,
                        boxShadow: (t) => `inset 0 0 0 999px ${alpha(accentColor, t.palette.mode === 'dark' ? 0.22 : 0.12)}`,
                        border: (t) => `1px solid ${alpha(accentColor, t.palette.mode === 'dark' ? 0.38 : 0.28)}`,
                        position: 'relative',
                        zIndex: 1
                    }}
                >
                    <MealPeriodIcon mealPeriod={mealPeriod} fontSize="small" />
                </Avatar>
            </Box>

            <Box sx={{ minWidth: 0, py: `var(${TIMELINE_ROW_PADDING_VAR})` }}>
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: {
                            xs: 'minmax(0, 1fr) auto auto',
                            sm: 'minmax(0, 1fr) auto auto auto'
                        },
                        alignItems: 'center',
                        gap: 1,
                        minHeight: 38
                    }}
                >
                    <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 650, lineHeight: 1.2 }}>{label}</Typography>
                        {isLoading ? (
                            <Skeleton width={74} height={18} />
                        ) : (
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: { xs: 'block', sm: 'none' } }}>
                                {t('foodLog.totalCalories', { calories: totalCalories })}
                            </Typography>
                        )}
                    </Box>
                    {!isLoading && (
                        <Typography
                            variant="body2"
                            sx={{
                                color: 'text.secondary',
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                                textAlign: 'right',
                                display: { xs: 'none', sm: 'block' }
                            }}
                        >
                            {t('foodLog.totalCalories', { calories: totalCalories })}
                        </Typography>
                    )}

                    <Button
                        size="small"
                        variant="text"
                        startIcon={<AddRoundedIcon />}
                        onClick={() => onAdd(mealPeriod)}
                        sx={{
                            flexShrink: 0,
                            color: { xs: 'primary.main', md: 'text.secondary' },
                            minWidth: { xs: 'auto', md: 0 },
                            px: { xs: 1, md: 0.75 },
                            '&:hover, &:focus-visible': {
                                color: 'primary.main'
                            },
                            '& .MuiButton-startIcon': {
                                mr: 0.35
                            }
                        }}
                    >
                        {t('foodLog.addToMeal')}
                    </Button>
                    {hasEntries ? (
                        <Tooltip title={isExpanded ? t('foodLog.collapseMeal') : t('foodLog.expandMeal')}>
                            <IconButton
                                size="small"
                                aria-label={isExpanded ? t('foodLog.collapseMeal') : t('foodLog.expandMeal')}
                                aria-expanded={isExpanded}
                                onClick={() => onToggleExpanded(mealPeriod)}
                            >
                                <KeyboardArrowDownRoundedIcon
                                    fontSize="small"
                                    sx={{
                                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                        transition: (theme) =>
                                            theme.transitions.create('transform', {
                                                duration: theme.transitions.duration.shorter
                                            })
                                    }}
                                />
                            </IconButton>
                        </Tooltip>
                    ) : (
                        <Box aria-hidden sx={{ width: EMPTY_MEAL_CHEVRON_SLOT_PX, height: EMPTY_MEAL_CHEVRON_SLOT_PX }} />
                    )}
                </Box>

                {isLoading ? (
                    <Stack spacing={0.75} sx={{ mt: 0.75 }}>
                        <Skeleton height={22} width="72%" />
                        <Skeleton height={22} width="54%" />
                    </Stack>
                ) : hasEntries ? (
                    <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <Stack sx={{ mt: 0.75 }}>
                            {entries.map((entry) => (
                                <FoodLogEntryRow
                                    key={entry.id}
                                    entry={entry}
                                    onEdit={onEdit}
                                    onDelete={onDelete}
                                />
                            ))}
                        </Stack>
                    </Collapse>
                ) : null}
            </Box>
        </Box>
    );
};

export default FoodLogMealRow;
