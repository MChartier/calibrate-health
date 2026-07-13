import React from 'react';
import { Redirect } from 'expo-router';

export default function GoalsScreen() {
    return <Redirect href="/(tabs)/progress" />;
}
