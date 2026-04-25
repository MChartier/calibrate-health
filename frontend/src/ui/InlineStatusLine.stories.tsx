import type { Meta, StoryObj } from '@storybook/react-vite';
import InlineStatusLine from './InlineStatusLine';

const meta = {
    title: 'UI/InlineStatusLine',
    component: InlineStatusLine,
    args: {
        status: {
            text: 'Saved changes',
            tone: 'success'
        }
    }
} satisfies Meta<typeof InlineStatusLine>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {};

export const Error: Story = {
    args: {
        status: {
            text: 'Unable to save',
            tone: 'error'
        }
    }
};

export const ReservedEmptyLine: Story = {
    args: {
        status: null
    }
};
