import React from 'react';
import GoalTrackerCard from './GoalTrackerCard';

/**
 * Today workspace wrapper for goal progress and steady-rate projection.
 */
const GoalProjection: React.FC = () => {
    return <GoalTrackerCard titleKey="today.goalProjection.title" />;
};

export default GoalProjection;
