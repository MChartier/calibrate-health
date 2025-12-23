import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Box, Divider, Stack, Typography, Avatar, IconButton, Tooltip } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EggAltIcon from '@mui/icons-material/EggAlt';
import BakeryDiningIcon from '@mui/icons-material/BakeryDining';
import IcecreamIcon from '@mui/icons-material/Icecream';
import LunchDiningIcon from '@mui/icons-material/LunchDining';
import DinnerDiningIcon from '@mui/icons-material/DinnerDining';
import NightlifeIcon from '@mui/icons-material/Nightlife';
import { MEAL_PERIOD_LABELS, MEAL_PERIOD_ORDER, type MealPeriod } from '../types/mealPeriod';

type FoodLogEntry = {
    id: number | string;
    meal_period?: MealPeriod;
    name?: string;
    calories?: number;
};

const MEAL_ICONS: Record<MealPeriod, React.ReactNode> = {
    BREAKFAST: <EggAltIcon htmlColor="#ff9800" />,
    MORNING_SNACK: <BakeryDiningIcon htmlColor="#4caf50" />,
    LUNCH: <LunchDiningIcon htmlColor="#3f51b5" />,
    AFTERNOON_SNACK: <IcecreamIcon htmlColor="#8bc34a" />,
    DINNER: <DinnerDiningIcon htmlColor="#9c27b0" />,
    EVENING_SNACK: <NightlifeIcon htmlColor="#e91e63" />
};

const MEALS: Array<{ key: MealPeriod; label: string; icon: React.ReactNode }> = MEAL_PERIOD_ORDER.map((key) => ({
    key,
    label: MEAL_PERIOD_LABELS[key],
    icon: MEAL_ICONS[key]
}));

const MEAL_PERIOD_SET = new Set<MealPeriod>(MEAL_PERIOD_ORDER);

/**
 * Return a validated meal period (or null) so the UI can safely group entries.
 */
function normalizeMealPeriod(value: unknown): MealPeriod | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim() as MealPeriod;
    return MEAL_PERIOD_SET.has(trimmed) ? trimmed : null;
}

function sumCalories(entries: FoodLogEntry[]): number {
    return entries.reduce((total, entry) => total + (typeof entry.calories === 'number' ? entry.calories : 0), 0);
}

const FoodLogMeals: React.FC<{ logs: FoodLogEntry[] }> = ({ logs }) => {
    const grouped = useMemo(() => {
        const groups: Record<MealPeriod, FoodLogEntry[]> = {
            BREAKFAST: [],
            MORNING_SNACK: [],
            LUNCH: [],
            AFTERNOON_SNACK: [],
            DINNER: [],
            EVENING_SNACK: []
        };

        for (const log of Array.isArray(logs) ? logs : []) {
            const meal = normalizeMealPeriod(log.meal_period);
            if (!meal) continue;
            groups[meal].push(log);
        }

        return groups;
    }, [logs]);

    const [expanded, setExpanded] = useState<Record<MealPeriod, boolean>>({
        BREAKFAST: true,
        MORNING_SNACK: true,
        LUNCH: true,
        AFTERNOON_SNACK: true,
        DINNER: true,
        EVENING_SNACK: true
    });

    const previousCountsRef = useRef<Record<MealPeriod, number> | null>(null);

    useEffect(() => {
        const counts: Record<MealPeriod, number> = {
            BREAKFAST: grouped.BREAKFAST.length,
            MORNING_SNACK: grouped.MORNING_SNACK.length,
            LUNCH: grouped.LUNCH.length,
            AFTERNOON_SNACK: grouped.AFTERNOON_SNACK.length,
            DINNER: grouped.DINNER.length,
            EVENING_SNACK: grouped.EVENING_SNACK.length
        };

        const previousCounts = previousCountsRef.current;
        previousCountsRef.current = counts;
        if (!previousCounts) return;

        setExpanded((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const meal of MEALS) {
                const key = meal.key;
                if (previousCounts[key] === 0 && counts[key] > 0) {
                    next[key] = true;
                    changed = true;
                }
            }

            return changed ? next : prev;
        });
    }, [grouped]);

    const handleExpandAll = () => {
        setExpanded({
            BREAKFAST: true,
            MORNING_SNACK: true,
            LUNCH: true,
            AFTERNOON_SNACK: true,
            DINNER: true,
            EVENING_SNACK: true
        });
    };

    const handleCollapseAll = () => {
        setExpanded({
            BREAKFAST: false,
            MORNING_SNACK: false,
            LUNCH: false,
            AFTERNOON_SNACK: false,
            DINNER: false,
            EVENING_SNACK: false
        });
    };

    return (
        <Stack spacing={2}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6">Food Log</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Tooltip title="Collapse all">
                        <IconButton size="small" onClick={handleCollapseAll}>
                            <ExpandMoreIcon sx={{ transform: 'rotate(180deg)' }} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Expand all">
                        <IconButton size="small" onClick={handleExpandAll}>
                            <ExpandMoreIcon />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>
            {MEALS.map((meal) => {
                const entries = grouped[meal.key];
                const total = sumCalories(entries);
                const isExpanded = expanded[meal.key];

                return (
                    <Accordion
                        key={meal.key}
                        expanded={isExpanded}
                        onChange={(_, nextExpanded) => setExpanded((prev) => ({ ...prev, [meal.key]: nextExpanded }))}
                        variant="outlined"
                        disableGutters
                    >
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1 }}>
                                <Avatar sx={{ width: 28, height: 28, bgcolor: 'background.default' }} variant="rounded">
                                    {meal.icon}
                                </Avatar>
                                <Typography sx={{ fontWeight: 'bold' }}>{meal.label}</Typography>
                            </Box>
                            <Typography color="text.secondary">{total} Calories</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                            {entries.length === 0 ? (
                                <Typography color="text.secondary">No entries yet.</Typography>
                            ) : (
                                <Stack divider={<Divider flexItem />} spacing={1}>
                                    {entries.map((entry) => (
                                        <Box key={entry.id} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <Typography>{entry.name}</Typography>
                                            <Typography color="text.secondary">{entry.calories} Calories</Typography>
                                        </Box>
                                    ))}
                                </Stack>
                            )}
                        </AccordionDetails>
                    </Accordion>
                );
            })}
        </Stack>
    );
};

export default FoodLogMeals;
