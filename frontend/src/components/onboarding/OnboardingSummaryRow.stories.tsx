import type { Meta, StoryObj } from '@storybook/react-vite';
import OnboardingSummaryRow from './OnboardingSummaryRow';

const meta = {
    title: 'Components/Onboarding/OnboardingSummaryRow',
    component: OnboardingSummaryRow,
    parameters: {
        layout: 'padded'
    },
    args: {
        label: 'Target',
        value: 'Lose 1 lb/week',
        onEdit: () => undefined
    }
} satisfies Meta<typeof OnboardingSummaryRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Editable: Story = {};

export const Highlighted: Story = {
    args: {
        highlight: true
    }
};

export const ReadOnly: Story = {
    args: {
        onEdit: undefined
    }
};
