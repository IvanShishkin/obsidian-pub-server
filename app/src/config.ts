import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') }) ||
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });

console.log(process.env.SECRET_KEY)
export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  secretKey: process.env.SECRET_KEY || 'change-me-in-production',
  
  domain: process.env.DOMAIN || 'localhost',
  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
  
  maxContentSize: parseInt(process.env.MAX_CONTENT_SIZE || '10485760', 10), // 10MB
  rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10), // 1 min
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  rateLimitPublic: parseInt(process.env.RATE_LIMIT_PUBLIC || '1000', 10),
  rateLimitPassword: parseInt(process.env.RATE_LIMIT_PASSWORD || '5', 10),
  
  corsOrigins: process.env.CORS_ORIGINS || '*',
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  
  dataDir: process.env.DATA_DIR || './data',
  sessionSecret: process.env.SESSION_SECRET || 'session-secret-change-me',
  
  // Image settings
  maxImageSize: parseInt(process.env.MAX_IMAGE_SIZE || '10485760', 10), // 10MB
  maxImagesPerPublication: parseInt(process.env.MAX_IMAGES_PER_PUBLICATION || '50', 10),
  allowedImageTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'],
  imageCacheMaxAge: parseInt(process.env.IMAGE_CACHE_MAX_AGE || '86400', 10), // 24 hours in seconds
};
