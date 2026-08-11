/**
 * Defines the Expo Router layout for this route group.
 */
import { Stack } from 'expo-router';

/** Render the settings stack layout interface. */
export default function SettingsStackLayout() {
    return <Stack screenOptions={{ headerShown: false }} />;
}
