import { Router } from 'express';
import bcrypt from 'bcryptjs';
import passport from '../auth/passport';
import { prisma } from '../prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../auth/tokens';
import { z } from 'zod';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';

const router = Router();

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

function setAuthCookies(res: any, accessToken: string, refreshToken: string) {
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    sameSite: 'lax',
  });
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
  });
}

router.post('/signup', async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid input' });
  }
  const { email, password } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    return res.status(409).json({ message: 'Email already in use' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { email: email.toLowerCase(), passwordHash } });
  const accessToken = signAccessToken({ userId: user.id });
  const refreshToken = signRefreshToken({ userId: user.id });
  setAuthCookies(res, accessToken, refreshToken);
  return res.status(201).json({ user: { id: user.id, email: user.email } });
});

router.post('/login', (req, res, next) => {
  passport.authenticate('local', { session: false }, (err: any, user: any, info: any) => {
    if (err) return next(err);
    if (!user) return res.status(401).json({ message: info?.message || 'Unauthorized' });

    const accessToken = signAccessToken({ userId: user.id });
    const refreshToken = signRefreshToken({ userId: user.id });
    setAuthCookies(res, accessToken, refreshToken);
    return res.json({ user: { id: user.id, email: user.email } });
  })(req, res, next);
});

router.post('/refresh', async (req, res) => {
  const token = (req.cookies?.refreshToken as string) || '';
  if (!token) return res.status(401).json({ message: 'No refresh token' });
  try {
    const payload = verifyRefreshToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(401).json({ message: 'Invalid refresh token' });
    const accessToken = signAccessToken({ userId: user.id });
    const refreshToken = signRefreshToken({ userId: user.id });
    setAuthCookies(res, accessToken, refreshToken);
    return res.json({ user: { id: user.id, email: user.email } });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid refresh token' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  res.json({ success: true });
});

router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized' });
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ message: 'User not found' });
  return res.json({
    user: {
      id: user.id,
      email: user.email,
      currentWeight: user.currentWeight,
      targetWeight: user.targetWeight,
      targetCalorieDeficit: user.targetCalorieDeficit,
    },
  });
});

export default router;
