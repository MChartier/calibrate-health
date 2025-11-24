import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../auth/tokens';

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const payload = verifyAccessToken(token);
    req.userId = payload.userId;
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

function extractToken(req: Request) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  if (req.cookies && req.cookies.accessToken) {
    return req.cookies.accessToken as string;
  }
  return null;
}
