import React from 'react';
import { CardHeader, type CardHeaderProps } from './CardHeader';

export type CompactCardHeaderProps = Omit<CardHeaderProps, 'density'>;

/** @deprecated Prefer CardHeader and select a density explicitly. */
export const CompactCardHeader: React.FC<CompactCardHeaderProps> = (props) => (
    <CardHeader {...props} density="compact" />
);
