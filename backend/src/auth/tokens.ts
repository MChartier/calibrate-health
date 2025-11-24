import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface JwtPayload {
  userId: string;
}

export function signAccessToken(payload: JwtPayload) {
  return jwt.sign(payload, config.accessTokenSecret, { expiresIn: config.accessTokenTtlSeconds });
}

export function signRefreshToken(payload: JwtPayload) {
  return jwt.sign(payload, config.refreshTokenSecret, { expiresIn: config.refreshTokenTtlSeconds });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, config.accessTokenSecret) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, config.refreshTokenSecret) as JwtPayload;
}
