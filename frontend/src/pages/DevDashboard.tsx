import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Checkbox,
    Chip,
    Divider,
    FormControlLabel,
    FormGroup,
    Grid,
    IconButton,
    InputAdornment,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScannerRounded';
import axios from 'axios';
import BarcodeScannerDialog from '../components/BarcodeScannerDialog';

type FoodDataSource = 'usda' | 'openFoodFacts';

type FoodMeasure = {
    label: string;
    gramWeight?: number;
    quantity?: number;
    unit?: string;
};

type NormalizedFoodItem = {
    id: string;
    source: FoodDataSource;
    description: string;
    brand?: string;
    barcode?: string;
    locale?: string;
    availableMeasures: FoodMeasure[];
    nutrientsPer100g?: {
        calories: number;
        protein?: number;
        fat?: number;
        carbs?: number;
    };
};

type FoodProviderInfo = {
    name: FoodDataSource;
    label: string;
    supportsBarcodeLookup: boolean;
    ready: boolean;
    detail?: string;
};

type ProviderSearchResult = FoodProviderInfo & {
    items: NormalizedFoodItem[];
    error?: string;
    elapsedMs?: number;
};

/**
 * Dev-only dashboard to compare food search results side-by-side across providers.
 */
const DevDashboard: React.FC = () => {
    const [providers, setProviders] = useState<FoodProviderInfo[]>([]);
    const [selectedProviders, setSelectedProviders] = useState<FoodDataSource[]>([]);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ProviderSearchResult[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoadingProviders, setIsLoadingProviders] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);

    /**
     * Fetch provider metadata so the UI reflects current backend configuration.
     */
    const loadProviders = useCallback(async () => {
        setIsLoadingProviders(true);
        setError(null);
        try {
            const response = await axios.get('/api/dev/food/providers');
            const fetched: FoodProviderInfo[] = Array.isArray(response.data?.providers) ? response.data.providers : [];
            setProviders(fetched);
            setSelectedProviders((current) => {
                if (current.length > 0) {
                    return current;
                }
                return fetched.filter((provider) => provider.ready).map((provider) => provider.name);
            });
        } catch (err) {
            console.error(err);
            setError('Unable to load provider metadata.');
        } finally {
            setIsLoadingProviders(false);
        }
    }, []);

    useEffect(() => {
        void loadProviders();
    }, [loadProviders]);

    /**
     * Toggle providers while keeping the selection array stable for requests.
     */
    const toggleProvider = (name: FoodDataSource) => {
        setSelectedProviders((current) =>
            current.includes(name) ? current.filter((provider) => provider !== name) : [...current, name]
        );
    };

    /**
     * Build a compact metadata line to scan calories and branding quickly.
     */
    const buildItemDetails = (item: NormalizedFoodItem): string => {
        const details: string[] = [];
        if (item.brand) {
            details.push(`Brand: ${item.brand}`);
        }
        if (item.nutrientsPer100g?.calories !== undefined) {
            details.push(`${item.nutrientsPer100g.calories} kcal/100g`);
        } else {
            details.push('Calories: n/a');
        }
        if (item.barcode) {
            details.push(`UPC: ${item.barcode}`);
        }
        if (item.locale) {
            details.push(`Locale: ${item.locale}`);
        }
        if (item.availableMeasures.length > 0) {
            details.push(`${item.availableMeasures.length} measures`);
        }
        return details.length > 0 ? details.join(' | ') : 'No metadata available';
    };

    /**
     * Run a search against the selected providers using either a free-text query or a UPC/EAN barcode.
     */
    const runSearch = useCallback(
        async (params: { q?: string; barcode?: string }) => {
            if (!params.q && !params.barcode) {
                setError('Enter a search query or scan a barcode.');
                return;
            }

            if (selectedProviders.length === 0) {
                setError('Select at least one provider.');
                return;
            }

            setIsSearching(true);
            setError(null);
            try {
                const response = await axios.get('/api/dev/food/search', {
                    params: {
                        ...params,
                        providers: selectedProviders.join(',')
                    }
                });
                const fetched: ProviderSearchResult[] = Array.isArray(response.data?.results) ? response.data.results : [];
                setResults(fetched);
            } catch (err) {
                console.error(err);
                setError('Search failed. Please try again.');
            } finally {
                setIsSearching(false);
            }
        },
        [selectedProviders]
    );

    /**
     * Execute a query against the selected providers for easy side-by-side comparison.
     */
    const handleSearch = async () => {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) {
            setError('Enter a search query to compare providers, or scan a barcode.');
            return;
        }

        await runSearch({ q: trimmedQuery });
    };

    return (
        <Box>
            <Stack spacing={1} sx={{ mb: 3 }}>
                <Typography variant="body1" color="text.secondary">
                    Compare search output across providers to tune query quality.
                </Typography>
            </Stack>

            <Card variant="outlined" sx={{ mb: 3 }}>
                <CardContent>
                    <Stack spacing={2}>
                        <Box>
                            <Typography variant="subtitle1" gutterBottom>
                                Providers
                            </Typography>
                            <FormGroup row>
                                {providers.map((provider) => (
                                    <FormControlLabel
                                        key={provider.name}
                                        control={
                                            <Checkbox
                                                checked={selectedProviders.includes(provider.name)}
                                                onChange={() => toggleProvider(provider.name)}
                                            />
                                        }
                                        label={
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <Typography variant="body2">{provider.label}</Typography>
                                                {!provider.ready && (
                                                    <Chip
                                                        label={provider.detail || 'Unavailable'}
                                                        size="small"
                                                        color="warning"
                                                    />
                                                )}
                                            </Stack>
                                        }
                                        disabled={!provider.ready}
                                    />
                                ))}
                                {isLoadingProviders && (
                                    <Typography variant="body2" color="text.secondary">
                                        Loading providers...
                                    </Typography>
                                )}
                                {providers.length === 0 && !isLoadingProviders && (
                                    <Typography variant="body2" color="text.secondary">
                                        No providers available.
                                    </Typography>
                                )}
                            </FormGroup>
                        </Box>

                        <Divider />

                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
                            <TextField
                                label="Search foods"
                                placeholder="e.g. greek yogurt, oat milk, chicken breast"
                                fullWidth
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        void handleSearch();
                                    }
                                }}
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton
                                                aria-label="Scan barcode"
                                                title="Scan barcode"
                                                onClick={() => setIsScannerOpen(true)}
                                                size="small"
                                                edge="end"
                                                disabled={isSearching || isLoadingProviders}
                                            >
                                                <QrCodeScannerIcon />
                                            </IconButton>
                                        </InputAdornment>
                                    )
                                }}
                            />
                            <Stack direction="row" spacing={2}>
                                <Button
                                    variant="contained"
                                    onClick={() => void handleSearch()}
                                    disabled={isSearching || isLoadingProviders}
                                >
                                    {isSearching ? 'Searching...' : 'Run search'}
                                </Button>
                                <Button
                                    variant="outlined"
                                    onClick={() => {
                                        setResults([]);
                                        setError(null);
                                    }}
                                >
                                    Clear results
                                </Button>
                            </Stack>
                        </Stack>

                        <BarcodeScannerDialog
                            open={isScannerOpen}
                            onClose={() => setIsScannerOpen(false)}
                            onDetected={(detectedBarcode) => {
                                setQuery(detectedBarcode);
                                void runSearch({ barcode: detectedBarcode });
                            }}
                        />

                        <Typography variant="caption" color="text.secondary">
                            Tip: Use the barcode scan button to test UPC/EAN lookups (camera or manual entry).
                        </Typography>

                        {error && <Alert severity="error">{error}</Alert>}
                    </Stack>
                </CardContent>
            </Card>

            {results.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                    No results yet. Run a query to see provider comparisons.
                </Typography>
            ) : (
                <Grid container spacing={2}>
                    {results.map((providerResult) => (
                        <Grid key={providerResult.name} size={{ xs: 12, md: 6 }}>
                            <Card variant="outlined">
                                <CardContent>
                                    <Stack spacing={1.5}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                                            <Typography variant="h6">{providerResult.label}</Typography>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                {providerResult.elapsedMs !== undefined && (
                                                    <Chip label={`${providerResult.elapsedMs} ms`} size="small" />
                                                )}
                                                <Chip
                                                    label={`${providerResult.items.length} results`}
                                                    size="small"
                                                    variant="outlined"
                                                />
                                            </Stack>
                                        </Box>

                                        {providerResult.error && <Alert severity="error">{providerResult.error}</Alert>}

                                        {!providerResult.error && providerResult.items.length === 0 && (
                                            <Typography variant="body2" color="text.secondary">
                                                No matches returned by this provider.
                                            </Typography>
                                        )}

                                        {providerResult.items.length > 0 && (
                                            <Stack spacing={1}>
                                                {providerResult.items.map((item) => (
                                                    <Box key={`${providerResult.name}-${item.id}`}>
                                                        <Typography variant="subtitle2">{item.description}</Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {buildItemDetails(item)}
                                                        </Typography>
                                                        <Divider sx={{ mt: 1 }} />
                                                    </Box>
                                                ))}
                                            </Stack>
                                        )}
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}
        </Box>
    );
};

export default DevDashboard;
