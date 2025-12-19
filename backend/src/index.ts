import 'dotenv/config';

import express from 'express';
import session from 'express-session';
import passport from 'passport';
import cors from 'cors';
import { Strategy as LocalStrategy } from 'passport-local';
import prisma from './config/database';
import bcrypt from 'bcryptjs'; // We need to install bcryptjs

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

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
        const user = await prisma.user.findUnique({ where: { id } });
        done(null, user);
    } catch (err) {
        done(err);
    }
});

import authRoutes from './routes/auth';
import goalRoutes from './routes/goals';
import metricRoutes from './routes/metrics';
import foodRoutes from './routes/food';
import userRoutes from './routes/user';
import devRoutes from './routes/dev';

// Routes
app.use('/auth', authRoutes);
const apiRouter = express.Router();
app.use('/api', apiRouter);

apiRouter.use('/goals', goalRoutes);
apiRouter.use('/metrics', metricRoutes);
apiRouter.use('/food', foodRoutes);
apiRouter.use('/user', userRoutes);
apiRouter.use('/dev', devRoutes);

app.get('/', (req, res) => {
    res.send('Fitness App API');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
