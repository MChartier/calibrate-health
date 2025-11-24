import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config';
import authRoutes from './routes/auth';
import goalRoutes from './routes/goals';
import weightRoutes from './routes/weights';
import foodRoutes from './routes/food';
import summaryRoutes from './routes/summary';
import passport from './auth/passport';

const app = express();

app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);
app.use('/goals', goalRoutes);
app.use('/weights', weightRoutes);
app.use('/food', foodRoutes);
app.use('/summary', summaryRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`API running on port ${config.port}`);
});
