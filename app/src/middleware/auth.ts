import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger } from '../services/logger';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    logger.warn('Missing authorization header', { ip: req.ip, path: req.path });
    res.status(401).json({ error: 'Authorization header required' });
    return;
  }

  const [type, token] = authHeader.split(' ');

  if (type !== 'Bearer' || !token) {
    logger.warn('Invalid authorization format', { ip: req.ip, path: req.path });
    res.status(401).json({ error: 'Invalid authorization format. Use: Bearer <token>' });
    return;
  }

  if (token !== config.secretKey) {
    logger.warn('Invalid secret key', { ip: req.ip, path: req.path });
    res.status(403).json({ error: 'Invalid secret key' });
    return;
  }

  next();
}
