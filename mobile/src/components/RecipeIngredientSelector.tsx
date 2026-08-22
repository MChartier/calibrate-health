import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { MyFoodSummary } from '@calibrate/api-client';
import { useAuth } from '../auth/AuthContext';
import { type AppTheme, useAppTheme } from '../theme';
import { getSafeActionErrorMessage } from '../errors/presentation';
import { AppButton } from './AppButton';
import { AppChip } from './AppChip';
import { AppText } from './AppText';
import { TextField } from './TextField';

// Keeps ingredient search responsive without issuing a request for every keystroke.
const RECIPE_INGREDIENT_SEARCH_DEBOUNCE_MS = 250;
// Keeps each selector page compact on phones while allowing useful scanning on desktop.
export const RECIPE_INGREDIENT_PAGE_SIZE = 20;

type RecipeIngredientSelectorProps = {
    enabled: boolean;
    onAddIngredient: (item: MyFoodSummary) => void;
    onLibraryItems?: (items: MyFoodSummary[]) => void;
};

/** Search and page through every owned saved food that can be used as a recipe ingredient. */
export const RecipeIngredientSelector: React.FC<RecipeIngredientSelectorProps> = ({
    enabled,
    onAddIngredient,
    onLibraryItems
}) => {
    const { api } = useAuth();
    const theme = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const [searchText, setSearchText] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const timeout = setTimeout(() => {
            setDebouncedSearch(searchText.trim());
        }, RECIPE_INGREDIENT_SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timeout);
    }, [searchText]);

    const libraryQuery = useInfiniteQuery({
        queryKey: ['mobile-my-food-library', 'recipe-ingredients', debouncedSearch],
        queryFn: ({ pageParam }) => api.getMyFoodsLibrary({
            q: debouncedSearch || undefined,
            type: 'FOOD',
            cursor: pageParam ?? undefined,
            limit: RECIPE_INGREDIENT_PAGE_SIZE
        }),
        initialPageParam: null as string | null,
        getNextPageParam: (lastPage) => lastPage.next_cursor,
        enabled
    });

    const savedFoods = useMemo(() => {
        const byId = new Map<number, MyFoodSummary>();
        libraryQuery.data?.pages.forEach((page) => {
            page.items.forEach((item) => byId.set(item.id, item));
        });
        return Array.from(byId.values());
    }, [libraryQuery.data]);
    const isSearching = searchText.trim() !== debouncedSearch;

    useEffect(() => {
        if (savedFoods.length > 0) onLibraryItems?.(savedFoods);
    }, [onLibraryItems, savedFoods]);

    let status: React.ReactNode = null;
    if (libraryQuery.isPending || isSearching) {
        status = <AppText variant="muted">Searching saved foods...</AppText>;
    } else if (libraryQuery.isError) {
        status = (
            <View style={styles.status}>
                <AppText accessibilityRole="alert" style={styles.error}>
                    {getSafeActionErrorMessage(libraryQuery.error, 'Unable to load saved foods.')}
                </AppText>
                <AppButton
                    title="Retry ingredient search"
                    variant="secondary"
                    onPress={() => { void libraryQuery.refetch(); }}
                />
            </View>
        );
    } else if (savedFoods.length === 0) {
        status = (
            <AppText variant="muted">
                {debouncedSearch
                    ? 'No saved foods match this search.'
                    : 'Create a saved food first, then add it to a recipe.'}
            </AppText>
        );
    }

    return (
        <View style={styles.root}>
            <TextField
                label="Search saved foods"
                value={searchText}
                onChangeText={setSearchText}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
            />
            {status}
            {!isSearching && savedFoods.length > 0 && (
                <View style={styles.chips}>
                    {savedFoods.map((item) => (
                        <AppChip
                            key={item.id}
                            label={item.name}
                            accessibilityLabel={`Add ${item.name} to recipe`}
                            onPress={() => onAddIngredient(item)}
                        />
                    ))}
                </View>
            )}
            {!isSearching && libraryQuery.hasNextPage && (
                <AppButton
                    title="Load more saved foods"
                    variant="secondary"
                    busy={libraryQuery.isFetchingNextPage}
                    busyLabel="Loading more saved foods..."
                    onPress={() => { void libraryQuery.fetchNextPage(); }}
                />
            )}
        </View>
    );
};

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        root: {
            gap: theme.spacing.md
        },
        chips: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: theme.spacing.sm
        },
        status: {
            gap: theme.spacing.sm
        },
        error: {
            color: theme.colors.danger
        }
    });
}
