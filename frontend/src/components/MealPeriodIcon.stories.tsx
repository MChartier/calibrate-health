import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stack, Typography } from '@mui/material';
import MealPeriodIcon from './MealPeriodIcon';
import type { MealPeriod } from '../types/mealPeriod';

const mealPeriods: MealPeriod[] = [
    'BREAKFAST',
    'MORNING_SNACK',
    'LUNCH',
    'AFTERNOON_SNACK',
    'DINNER',
    'EVENING_SNACK'
];

const meta = {
    title: 'Components/MealPeriodIcon',
    component: MealPeriodIcon,
    args: {
        mealPeriod: 'BREAKFAST',
        fontSize: 'large'
    }
} satisfies Meta<typeof MealPeriodIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {};

export const AllMealPeriods: Story = {
    render: () => (
        <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {mealPeriods.map((mealPeriod) => (
                <Stack key={mealPeriod} spacing={0.75} sx={{ alignItems: 'center' }}>
                    <MealPeriodIcon mealPeriod={mealPeriod} fontSize="large" />
                    <Typography variant="caption">{mealPeriod.replaceAll('_', ' ')}</Typography>
                </Stack>
            ))}
        </Stack>
    )
};
