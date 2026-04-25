import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, IconButton, Tooltip } from '@mui/material';
import SettingsIcon from '@mui/icons-material/SettingsRounded';
import SectionHeader from './SectionHeader';

const meta = {
    title: 'UI/SectionHeader',
    component: SectionHeader,
    parameters: {
        layout: 'padded'
    },
    args: {
        title: 'Weight trend',
        subtitle: 'Last 30 days',
        actions: <Button size="small">Add entry</Button>
    }
} satisfies Meta<typeof SectionHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithSubtitle: Story = {};

export const IconAction: Story = {
    args: {
        title: 'Provider settings',
        subtitle: undefined,
        align: 'center',
        actions: (
            <Tooltip title="Settings">
                <IconButton aria-label="Settings" size="small">
                    <SettingsIcon />
                </IconButton>
            </Tooltip>
        )
    }
};
