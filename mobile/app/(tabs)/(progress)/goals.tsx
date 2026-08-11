/**
 * Defines the goals Expo Router screen.
 */
import { Redirect } from 'expo-router';

/** Render the goals screen interface. */
export default function GoalsScreen() {
    return <Redirect href="/progress" />;
}
