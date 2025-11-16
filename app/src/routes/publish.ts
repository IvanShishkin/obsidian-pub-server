import { Router, Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { storageService } from '../services/storage';
import { hashPassword } from '../services/password';
import { config } from '../config';
import { logger } from '../services/logger';
import { PublishRequest, Publication } from '../models/publication';

const router = Router();

router.get('/check/:filename', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    
    if (!filename) {
      res.status(400).json({ error: 'Filename is required' });
      return;
    }

    const result = await storageService.getPublicationByFilename(filename);

    if (result) {
      res.json({
        exists: true,
        hash: result.hash,
        url: `${config.baseUrl}/p/${result.hash}`,
        lastUpdated: result.publication.updatedAt,
      });
    } else {
      res.json({
        exists: false,
        hash: null,
        url: null,
        lastUpdated: null,
      });
    }
  } catch (error) {
    logger.error('Error checking file', { error, filename: req.params.filename });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/publish', async (req: Request, res: Response) => {
  try {
    const body = req.body as PublishRequest;

    if (!body.filename || typeof body.filename !== 'string') {
      res.status(400).json({ error: 'Filename is required' });
      return;
    }

    if (!body.content || typeof body.content !== 'string') {
      res.status(400).json({ error: 'Content is required' });
      return;
    }

    if (Buffer.byteLength(body.content, 'utf-8') > config.maxContentSize) {
      res.status(400).json({ error: `Content size exceeds limit of ${config.maxContentSize} bytes` });
      return;
    }

    if (!body.metadata || typeof body.metadata !== 'object') {
      res.status(400).json({ error: 'Metadata is required' });
      return;
    }

    if (body.images) {
      if (!Array.isArray(body.images)) {
        res.status(400).json({ error: 'Images must be an array' });
        return;
      }

      if (body.images.length > config.maxImagesPerPublication) {
        res.status(400).json({ error: `Too many images. Maximum allowed: ${config.maxImagesPerPublication}` });
        return;
      }

      for (const image of body.images) {
        if (!image.filename || !image.data || !image.mimeType) {
          res.status(400).json({ error: 'Each image must have filename, data, and mimeType' });
          return;
        }

        if (!config.allowedImageTypes.includes(image.mimeType)) {
          res.status(400).json({ error: `Invalid image type: ${image.mimeType}` });
          return;
        }
      }
    }

    const sanitizedFilename = body.filename.replace(/[/\\]/g, '_');

    const existing = await storageService.getPublicationByFilename(sanitizedFilename);
    if (existing) {
      res.status(409).json({
        success: false,
        error: 'File already exists',
        exists: true,
        hash: existing.hash,
        url: `${config.baseUrl}/p/${existing.hash}`,
      });
      return;
    }

    // Generate hash
    const hash = nanoid(12);

    let passwordHash: string | null = null;
    if (body.password && body.password.length > 0) {
      passwordHash = await hashPassword(body.password);
    }

    const publication: Publication = {
      filename: sanitizedFilename,
      title: body.metadata.title || sanitizedFilename,
      obsidianPath: body.metadata.obsidianPath || '',
      passwordHash,
      createdAt: body.metadata.publishedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      images: [],
    };

    const imagesUploaded = await storageService.savePublication(hash, body.content, publication, body.images);

    const url = `${config.baseUrl}/p/${hash}`;

    logger.info('New publication created', { hash, filename: sanitizedFilename, images: imagesUploaded });

    res.status(201).json({
      success: true,
      hash,
      url,
      exists: false,
      message: 'Published successfully',
      imagesUploaded,
    });
  } catch (error) {
    logger.error('Error publishing file', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/update/:hash', async (req: Request, res: Response) => {
  try {
    const { hash } = req.params;
    const body = req.body as PublishRequest;

    if (!hash) {
      res.status(400).json({ error: 'Hash is required' });
      return;
    }

    const existingPub = await storageService.getPublicationByHash(hash);
    if (!existingPub) {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }

    if (!body.content || typeof body.content !== 'string') {
      res.status(400).json({ error: 'Content is required' });
      return;
    }

    if (Buffer.byteLength(body.content, 'utf-8') > config.maxContentSize) {
      res.status(400).json({ error: `Content size exceeds limit of ${config.maxContentSize} bytes` });
      return;
    }

    if (body.images) {
      if (!Array.isArray(body.images)) {
        res.status(400).json({ error: 'Images must be an array' });
        return;
      }

      if (body.images.length > config.maxImagesPerPublication) {
        res.status(400).json({ error: `Too many images. Maximum allowed: ${config.maxImagesPerPublication}` });
        return;
      }

      for (const image of body.images) {
        if (!image.filename || !image.data || !image.mimeType) {
          res.status(400).json({ error: 'Each image must have filename, data, and mimeType' });
          return;
        }

        if (!config.allowedImageTypes.includes(image.mimeType)) {
          res.status(400).json({ error: `Invalid image type: ${image.mimeType}` });
          return;
        }
      }
    }

    let passwordHash = existingPub.passwordHash;
    if (body.password !== undefined) {
      if (body.password && body.password.length > 0) {
        passwordHash = await hashPassword(body.password);
      } else {
        passwordHash = null; // Remove password
      }
    }

    const updatedPublication: Publication = {
      ...existingPub,
      filename: body.filename ? body.filename.replace(/[/\\]/g, '_') : existingPub.filename,
      title: body.metadata?.title || existingPub.title,
      obsidianPath: body.metadata?.obsidianPath || existingPub.obsidianPath,
      passwordHash,
      updatedAt: new Date().toISOString(),
    };

    // Save updated publication with images
    const imagesUploaded = await storageService.savePublication(hash, body.content, updatedPublication, body.images);

    const url = `${config.baseUrl}/p/${hash}`;

    logger.info('Publication updated', { hash, filename: updatedPublication.filename, images: imagesUploaded });

    res.json({
      success: true,
      hash,
      url,
      exists: true,
      message: 'Updated successfully',
      imagesUploaded,
    });
  } catch (error) {
    logger.error('Error updating file', { error, hash: req.params.hash });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/delete/:hash', async (req: Request, res: Response) => {
  try {
    const { hash } = req.params;

    if (!hash) {
      res.status(400).json({ error: 'Hash is required' });
      return;
    }

    const deleted = await storageService.deletePublication(hash);

    if (!deleted) {
      res.status(404).json({ error: 'Publication not found' });
      return;
    }

    logger.info('Publication deleted', { hash });

    res.json({
      success: true,
      message: 'Publication deleted',
    });
  } catch (error) {
    logger.error('Error deleting file', { error, hash: req.params.hash });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
