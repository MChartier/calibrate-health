import React, { useMemo } from 'react';
import { OverlaySelect, type OverlaySelectOption } from './OverlaySelect';
import {
    DAILY_GOAL_CHANGE_OPTIONS,
    getDailyGoalChangeCopy,
    type GoalMode
} from '../utils/goals';

type GoalDailyChangeSelectProps = {
    goalMode: Exclude<GoalMode, 'maintain'>;
    value: string;
    isOpen: boolean;
    onToggle: () => void;
    onChange: (value: string) => void;
};

/** Shared deficit/surplus selector used during onboarding and later goal edits. */
export const GoalDailyChangeSelect: React.FC<GoalDailyChangeSelectProps> = ({
    goalMode,
    value,
    isOpen,
    onToggle,
    onChange
}) => {
    const options = useMemo<Array<OverlaySelectOption<string>>>(() => (
        DAILY_GOAL_CHANGE_OPTIONS.map((option) => {
            const optionValue = String(option);
            const copy = getDailyGoalChangeCopy(goalMode, optionValue);
            return { value: optionValue, label: copy.label, description: copy.description };
        })
    ), [goalMode]);

    return (
        <OverlaySelect
            accessibilityLabel="Select daily calorie change"
            value={value}
            options={options}
            isOpen={isOpen}
            onToggle={onToggle}
            onChange={onChange}
        />
    );
};
