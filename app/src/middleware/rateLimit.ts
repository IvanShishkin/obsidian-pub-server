import rateLimit from 'express-rate-limit';
import { config } from '../config';

export const apiLimiter = rateLimit({
  windowMs: config.rateLimitWindow,
  max: config.rateLimitMax,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const publicLimiter = rateLimit({
  windowMs: config.rateLimitWindow,
  max: config.rateLimitPublic,
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordAttempts = new Map<string, { count: number; resetTime: number }>();

export function passwordLimiter(hash: string): boolean {
  const now = Date.now();
  const attempt = passwordAttempts.get(hash);

  if (!attempt || now > attempt.resetTime) {
    passwordAttempts.set(hash, {
      count: 1,
      resetTime: now + config.rateLimitWindow,
    });
    return true;
  }

  if (attempt.count >= config.rateLimitPassword) {
    return false;
  }

  attempt.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of passwordAttempts.entries()) {
    if (now > value.resetTime) {
      passwordAttempts.delete(key);
    }
  }
}, 60000);
