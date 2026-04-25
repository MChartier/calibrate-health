import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Stack, Typography } from '@mui/material';
import AppCard from './AppCard';
import SectionHeader from './SectionHeader';

const meta = {
    title: 'UI/AppCard',
    component: AppCard,
    parameters: {
        layout: 'padded'
    },
    args: {
        children: (
            <Stack spacing={1.5}>
                <SectionHeader
                    title="Daily target"
                    subtitle="A reusable card surface with app-standard padding."
                    actions={<Button size="small">Edit</Button>}
                />
                <Typography variant="h4" color="primary">
                    2,120 kcal
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Uses the same Card and CardContent defaults as dashboard summary tiles.
                </Typography>
            </Stack>
        )
    }
} satisfies Meta<typeof AppCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const DenseContent: Story = {
    args: {
        contentSx: { p: { xs: 1, sm: 1.25 }, '&:last-child': { pb: { xs: 1, sm: 1.25 } } },
        children: (
            <Stack spacing={0.75}>
                <Typography variant="subtitle2">Compact surface</Typography>
                <Typography variant="body2" color="text.secondary">
                    Use contentSx when a feature card needs tighter internal spacing.
                </Typography>
            </Stack>
        )
    }
};
