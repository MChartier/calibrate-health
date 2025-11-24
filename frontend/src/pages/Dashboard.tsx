import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Card, CardContent, MenuItem, Stack, TextField, Typography, Chip, Divider, IconButton } from '@mui/material';
import Grid from '@mui/material/Grid';
import DeleteIcon from '@mui/icons-material/Delete';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addFood, deleteFood, fetchFood, fetchGoals, fetchHistory, fetchSummary, logWeight, updateGoals } from '../api/service';
import type { Summary } from '../api/types';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const deficitOptions = [250, 500, 750, 1000];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function Dashboard() {
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [weightInput, setWeightInput] = useState('');
  const [foodForm, setFoodForm] = useState({ label: '', calories: '', meal: 'LUNCH' });
  const [goalForm, setGoalForm] = useState({ currentWeight: '', targetWeight: '', targetCalorieDeficit: 500 });
  const queryClient = useQueryClient();

  const goalsQuery = useQuery({ queryKey: ['goals'], queryFn: fetchGoals });

  useEffect(() => {
    if (goalsQuery.data) {
      setGoalForm({
        currentWeight: goalsQuery.data.currentWeight?.toString() || '',
        targetWeight: goalsQuery.data.targetWeight?.toString() || '',
        targetCalorieDeficit: goalsQuery.data.targetCalorieDeficit || 500,
      });
    }
  }, [goalsQuery.data]);

  const summaryQuery = useQuery({ queryKey: ['summary', selectedDate], queryFn: () => fetchSummary(selectedDate) });
  const foodQuery = useQuery({ queryKey: ['food', selectedDate], queryFn: () => fetchFood(selectedDate) });
  const historyQuery = useQuery({ queryKey: ['history'], queryFn: () => fetchHistory(90) });

  const goalMutation = useMutation({
    mutationFn: updateGoals,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
  });

  const weightMutation = useMutation({
    mutationFn: logWeight,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['summary'] });
      queryClient.invalidateQueries({ queryKey: ['history'] });
    },
  });

  const foodMutation = useMutation({
    mutationFn: addFood,
    onSuccess: () => {
      setFoodForm({ label: '', calories: '', meal: 'LUNCH' });
      queryClient.invalidateQueries({ queryKey: ['food', selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
  });

  const deleteFoodMutation = useMutation({
    mutationFn: deleteFood,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['food', selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
  });

  const summary: Summary | undefined = summaryQuery.data;

  const chartData = useMemo(() => {
    return (historyQuery.data?.weights || []).map((w) => ({
      date: new Date(w.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      weight: w.weight,
    }));
  }, [historyQuery.data]);

  const handleGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    goalMutation.mutate({
      currentWeight: goalForm.currentWeight ? Number(goalForm.currentWeight) : undefined,
      targetWeight: goalForm.targetWeight ? Number(goalForm.targetWeight) : undefined,
      targetCalorieDeficit: Number(goalForm.targetCalorieDeficit),
    });
  };

  const handleWeightSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!weightInput) return;
    weightMutation.mutate({ date: selectedDate, weight: Number(weightInput) });
    setWeightInput('');
  };

  const handleFoodSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!foodForm.label || !foodForm.calories) return;
    foodMutation.mutate({
      date: selectedDate,
      label: foodForm.label,
      calories: Number(foodForm.calories),
      meal: foodForm.meal as any,
    });
  };

  const projected = summary?.projectedGoalDate
    ? new Date(summary.projectedGoalDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  return (
    <Stack spacing={3}>
      <Typography variant="h4" fontWeight={700} color="primary.main">
        Daily dashboard
      </Typography>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Goal & profile
              </Typography>
              <Stack component="form" spacing={2} onSubmit={handleGoalSubmit}>
                <TextField
                  label="Current weight"
                  type="number"
                  value={goalForm.currentWeight}
                  onChange={(e) => setGoalForm((g) => ({ ...g, currentWeight: e.target.value }))}
                  inputProps={{ step: '0.1' }}
                />
                <TextField
                  label="Target weight"
                  type="number"
                  value={goalForm.targetWeight}
                  onChange={(e) => setGoalForm((g) => ({ ...g, targetWeight: e.target.value }))}
                  inputProps={{ step: '0.1' }}
                />
                <TextField
                  label="Daily target deficit"
                  select
                  value={goalForm.targetCalorieDeficit}
                  onChange={(e) => setGoalForm((g) => ({ ...g, targetCalorieDeficit: Number(e.target.value) }))}
                >
                  {deficitOptions.map((d) => (
                    <MenuItem key={d} value={d}>
                      {d} kcal/day
                    </MenuItem>
                  ))}
                </TextField>
                <Button type="submit" variant="contained" disabled={goalMutation.isPending}>
                  {goalMutation.isPending ? 'Saving...' : 'Save goals'}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Weight entry
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} component="form" onSubmit={handleWeightSubmit}>
                <TextField
                  label="Date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ minWidth: 180 }}
                />
                <TextField
                  label="Weight"
                  type="number"
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  inputProps={{ step: '0.1' }}
                  fullWidth
                />
                <Button type="submit" variant="contained" disabled={weightMutation.isPending}>
                  {weightMutation.isPending ? 'Saving...' : 'Log'}
                </Button>
              </Stack>
              <Box sx={{ mt: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  Latest logged weight: {summary?.weight ? `${summary.weight.toFixed(1)}` : '—'}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Food log
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} component="form" onSubmit={handleFoodSubmit}>
                <TextField label="Label" value={foodForm.label} onChange={(e) => setFoodForm((f) => ({ ...f, label: e.target.value }))} fullWidth />
                <TextField
                  label="Calories"
                  type="number"
                  value={foodForm.calories}
                  onChange={(e) => setFoodForm((f) => ({ ...f, calories: e.target.value }))}
                  sx={{ minWidth: 120 }}
                />
                <TextField
                  label="Meal"
                  select
                  value={foodForm.meal}
                  onChange={(e) => setFoodForm((f) => ({ ...f, meal: e.target.value }))}
                  sx={{ minWidth: 160 }}
                >
                  {['BREAKFAST', 'MORNING', 'LUNCH', 'AFTERNOON', 'DINNER', 'EVENING'].map((m) => (
                    <MenuItem key={m} value={m}>
                      {m.toLowerCase()}
                    </MenuItem>
                  ))}
                </TextField>
                <Button type="submit" variant="contained" disabled={foodMutation.isPending}>
                  Add
                </Button>
              </Stack>

              <Stack spacing={1.5} sx={{ mt: 2 }}>
                {foodQuery.data?.map((item) => (
                  <Card key={item.id} variant="outlined">
                    <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
                      <Stack spacing={0.5}>
                        <Typography fontWeight={600}>{item.label}</Typography>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip label={`${item.calories} kcal`} size="small" color="secondary" />
                          <Chip label={item.meal.toLowerCase()} size="small" />
                        </Stack>
                      </Stack>
                      <IconButton color="error" onClick={() => deleteFoodMutation.mutate(item.id)}>
                        <DeleteIcon />
                      </IconButton>
                    </CardContent>
                  </Card>
                ))}
                {foodQuery.data?.length === 0 && <Typography color="text.secondary">No entries for this day yet.</Typography>}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Daily snapshot
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                <MetricCard label="Calories in" value={summary?.caloriesIn ?? 0} color="#0ea5e9" />
                <MetricCard label="Estimated calories out" value={summary?.caloriesOutEstimate ?? 0} color="#a855f7" />
                <MetricCard label="Net" value={summary?.netCalories ?? 0} color="#f97316" />
              </Stack>
              <Divider sx={{ my: 2 }} />
              <Typography variant="body2" color="text.secondary">
                Target deficit: {summary?.targetDeficit ? `${summary.targetDeficit} kcal/day` : '—'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Projected goal date: {projected}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Weight trend
          </Typography>
          <Box sx={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: 0, right: 16 }}>
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} domain={['auto', 'auto']} />
                <Tooltip />
                <Line type="monotone" dataKey="weight" stroke="#0f766e" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}

function MetricCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 180, borderColor: color + '55' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h5" fontWeight={700} color={color}>
          {Math.round(value)}
        </Typography>
      </CardContent>
    </Card>
  );
}
