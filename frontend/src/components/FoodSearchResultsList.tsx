import React, { useEffect, useMemo, useRef } from 'react';
import {
    Box,
    Button,
    CircularProgress,
    List,
    ListItemButton,
    ListItemText,
    Stack,
    Typography
} from '@mui/material';
import type { NormalizedFoodItem } from '../types/food';
import { formatMeasureLabelForDisplay, getMeasureCalories, getPreferredMeasure } from '../utils/foodMeasure';

type Props = {
    items: NormalizedFoodItem[];
    selectedItemId: string | null;
    hasMore: boolean;
    isLoading: boolean;
    isLoadingMore: boolean;
    onLoadMore: () => void;
    onSelect: (item: NormalizedFoodItem) => void;
};

/**
 * Build a compact secondary line so users can differentiate similarly-named foods quickly.
 */
const buildSecondaryText = (item: NormalizedFoodItem): string => {
    const parts: string[] = [];
    if (item.brand) {
        parts.push(item.brand);
    }
    const preferredMeasure = getPreferredMeasure(item);
    const measureCalories = preferredMeasure ? getMeasureCalories(item, preferredMeasure, 1) : null;
    if (preferredMeasure && measureCalories) {
        const measureLabel = formatMeasureLabelForDisplay(preferredMeasure.label);
        parts.push(`${measureCalories.calories} kcal per ${measureLabel}`);
    } else if (item.nutrientsPer100g?.calories !== undefined) {
        parts.push(`${item.nutrientsPer100g.calories} kcal/100g`);
    }
    return parts.join(' | ');
};

/**
 * Scrollable list view of food search results with infinite-scroll pagination.
 */
const FoodSearchResultsList: React.FC<Props> = ({
    items,
    selectedItemId,
    hasMore,
    isLoading,
    isLoadingMore,
    onLoadMore,
    onSelect
}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const sentinelRef = useRef<HTMLDivElement | null>(null);

    const canRequestMore = useMemo(() => {
        return hasMore && !isLoading && !isLoadingMore;
    }, [hasMore, isLoading, isLoadingMore]);

    useEffect(() => {
        if (!canRequestMore) {
            return;
        }

        const root = containerRef.current;
        const sentinel = sentinelRef.current;
        if (!root || !sentinel) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    // Disconnect immediately so we don't spam requests before state updates.
                    observer.disconnect();
                    onLoadMore();
                }
            },
            {
                root,
                rootMargin: '160px 0px',
                threshold: 0.1
            }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [canRequestMore, onLoadMore]);

    return (
        <Box
            ref={containerRef}
            sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                overflowY: 'auto',
                height: { xs: 240, sm: 280 }
            }}
        >
            <List dense disablePadding>
                {items.map((item) => {
                    const secondary = buildSecondaryText(item);
                    return (
                        <ListItemButton
                            key={item.id}
                            selected={item.id === selectedItemId}
                            onClick={() => onSelect(item)}
                            sx={{ alignItems: 'flex-start' }}
                        >
                            <ListItemText
                                primary={item.description}
                                secondary={secondary || undefined}
                                primaryTypographyProps={{ variant: 'body2' }}
                                secondaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                            />
                        </ListItemButton>
                    );
                })}

                <Box
                    ref={sentinelRef}
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        px: 2,
                        py: 1.5
                    }}
                >
                    {isLoadingMore ? (
                        <Stack direction="row" spacing={1} alignItems="center">
                            <CircularProgress size={18} />
                            <Typography variant="caption" color="text.secondary">
                                Loading more...
                            </Typography>
                        </Stack>
                    ) : hasMore ? (
                        <Button size="small" onClick={onLoadMore} disabled={isLoading}>
                            Load more
                        </Button>
                    ) : (
                        <Typography variant="caption" color="text.secondary">
                            End of results
                        </Typography>
                    )}
                </Box>
            </List>
        </Box>
    );
};

export default FoodSearchResultsList;
