import { useState } from 'react';
import { Card, CardContent, List, ListItem, ListItemText, TextField, Typography } from '@mui/material';
import Grid from '@mui/material/Grid';
import { useQuery } from '@tanstack/react-query';
import { fetchFood, fetchHistory } from '../api/service';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function History() {
  const [date, setDate] = useState(todayIso());
  const historyQuery = useQuery({ queryKey: ['history'], queryFn: () => fetchHistory(180) });
  const foodQuery = useQuery({ queryKey: ['food', date], queryFn: () => fetchFood(date) });

  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, md: 6 }}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Weight history
            </Typography>
            <List dense>
              {historyQuery.data?.weights.map((w) => (
                <ListItem key={w.id} divider>
                  <ListItemText
                    primary={`${new Date(w.date).toLocaleDateString()} — ${w.weight.toFixed(1)}`}
                    secondary={w.id}
                    secondaryTypographyProps={{ sx: { display: 'none' } }}
                  />
                </ListItem>
              ))}
              {historyQuery.data?.weights.length === 0 && <Typography color="text.secondary">No weight entries yet.</Typography>}
            </List>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Food for a date
            </Typography>
            <TextField
              type="date"
              label="Date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ mb: 2 }}
            />
            <List>
              {foodQuery.data?.map((f) => (
                <ListItem key={f.id} divider>
                  <ListItemText primary={`${f.label} • ${f.calories} kcal`} secondary={f.meal.toLowerCase()} />
                </ListItem>
              ))}
              {foodQuery.data?.length === 0 && <Typography color="text.secondary">No entries for this day.</Typography>}
            </List>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}
