import 'dotenv/config';

import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import cors from 'cors';
import { Strategy as LocalStrategy } from 'passport-local';
import prisma from './config/database';
import bcrypt from 'bcryptjs'; // We need to install bcryptjs
import { autoLoginTestUser } from './utils/devAuth';
import devTestRoutes from './routes/devTest';

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Serve the built frontend SPA from disk in production deployments.
 *
 * We only fall back to `index.html` for non-API routes so deep links work without
 * intercepting JSON endpoints like `/api/*` and `/auth/*`.
 */
function configureSpaStaticAssets(app: express.Express): void {
    if (!isProduction) return;

    const distDir = process.env.FRONTEND_DIST_DIR;
    if (!distDir) {
        console.warn('FRONTEND_DIST_DIR is not set; skipping SPA static serving.');
        return;
    }

    const indexHtmlPath = path.join(distDir, 'index.html');
    if (!fs.existsSync(indexHtmlPath)) {
        console.warn(`FRONTEND_DIST_DIR does not contain index.html (${indexHtmlPath}); skipping SPA static serving.`);
        return;
    }

    app.use(express.static(distDir));

    // SPA fallback should not hijack backend endpoints.
    const spaFallbackRoute = /^\/(?!api(?:\/|$)|auth(?:\/|$)|dev(?:\/|$)).*/;
    app.get(spaFallbackRoute, (_req, res) => {
        res.sendFile(indexHtmlPath);
    });
}

// Middleware
if (isProduction) {
    // Ensure secure cookies work behind a TLS-terminating reverse proxy (Caddy/ALB/etc).
    app.set('trust proxy', 1);
} else {
    // Local dev can use a Vite proxy, but enabling CORS keeps ad-hoc tooling convenient.
    app.use(cors());
}

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false,
    proxy: isProduction,
    name: 'calibratehealth.sid',
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction
    }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(autoLoginTestUser);

// Passport Config
passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return done(null, false, { message: 'Incorrect email.' });

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return done(null, false, { message: 'Incorrect password.' });
        }

        return done(null, user);
    } catch (err) {
        return done(err);
    }
}));

passport.serializeUser((user: any, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id: number, done) => {
    try {
        // Keep req.user small and non-sensitive; routes can fetch extra columns as needed.
        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                weight_unit: true,
                height_unit: true,
                timezone: true,
                date_of_birth: true,
                sex: true,
                height_mm: true,
                activity_level: true
            }
        });
        done(null, user);
    } catch (err) {
        done(err);
    }
});

import authRoutes from './routes/auth';
import goalRoutes from './routes/goals';
import metricRoutes from './routes/metrics';
import foodRoutes from './routes/food';
import myFoodsRoutes from './routes/myFoods';
import userRoutes from './routes/user';
import devRoutes from './routes/dev';

// Routes
app.use('/auth', authRoutes);
const apiRouter = express.Router();
app.use('/api', apiRouter);

apiRouter.get('/healthz', (_req, res) => {
    res.json({ ok: true });
});

apiRouter.use('/goals', goalRoutes);
apiRouter.use('/metrics', metricRoutes);
apiRouter.use('/food', foodRoutes);
apiRouter.use('/my-foods', myFoodsRoutes);
apiRouter.use('/user', userRoutes);

// Keep debug/prototype routes (food provider comparisons, etc.) out of production deployments.
if (process.env.NODE_ENV !== 'production') {
    apiRouter.use('/dev', devRoutes);
    app.use('/dev/test', devTestRoutes);
}

configureSpaStaticAssets(app);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
