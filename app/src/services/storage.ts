import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';
import { MetadataStore, Publication, ImageData } from '../models/publication';
import { logger } from './logger';

const METADATA_FILE = 'metadata.json';
const PUBLICATIONS_DIR = 'publications';

class StorageService {
  private metadataPath: string;
  private publicationsPath: string;
  private metadata: MetadataStore | null = null;

  constructor() {
    this.metadataPath = path.join(config.dataDir, METADATA_FILE);
    this.publicationsPath = path.join(config.dataDir, PUBLICATIONS_DIR);
  }

  async initialize(): Promise<void> {
    await fs.mkdir(config.dataDir, { recursive: true });
    await fs.mkdir(this.publicationsPath, { recursive: true });

    try {
      const data = await fs.readFile(this.metadataPath, 'utf-8');
      this.metadata = JSON.parse(data);
      logger.info('Metadata loaded successfully');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.metadata = {
          publications: {},
          filenameIndex: {},
        };
        await this.saveMetadata();
        logger.info('Created new metadata file');
      } else {
        logger.error('Failed to load metadata, attempting recovery', { error });
        await this.recoverMetadata();
      }
    }
  }

  private async recoverMetadata(): Promise<void> {
    logger.warn('Recovering metadata from files...');
    this.metadata = {
      publications: {},
      filenameIndex: {},
    };

    try {
      const items = await fs.readdir(this.publicationsPath, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory()) {
          const hash = item.name;
          const contentPath = path.join(this.publicationsPath, hash, 'content.md');
          try {
            await fs.access(contentPath);
            this.metadata.publications[hash] = {
              filename: hash,
              title: hash,
              obsidianPath: '',
              passwordHash: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              images: [],
            };
          } catch {
            // No content.md, skip
          }
        }
      }
      await this.saveMetadata();
      logger.info('Metadata recovered', { count: Object.keys(this.metadata.publications).length });
    } catch (error) {
      logger.error('Failed to recover metadata', { error });
      throw error;
    }
  }

  private async saveMetadata(): Promise<void> {
    if (!this.metadata) return;

    const tempPath = `${this.metadataPath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(this.metadata, null, 2), 'utf-8');
    await fs.rename(tempPath, this.metadataPath);
  }

  private getPublicationDir(hash: string): string {
    return path.join(this.publicationsPath, hash);
  }

  private getImagesDir(hash: string): string {
    return path.join(this.getPublicationDir(hash), 'images');
  }

  async getPublicationByFilename(filename: string): Promise<{ hash: string; publication: Publication } | null> {
    if (!this.metadata) await this.initialize();
    
    const hash = this.metadata!.filenameIndex[filename];
    if (!hash) return null;

    const publication = this.metadata!.publications[hash];
    if (!publication) return null;

    return { hash, publication };
  }

  async getPublicationByHash(hash: string): Promise<Publication | null> {
    if (!this.metadata) await this.initialize();
    return this.metadata!.publications[hash] || null;
  }

  async savePublication(
    hash: string,
    content: string,
    publication: Publication,
    images?: ImageData[]
  ): Promise<number> {
    if (!this.metadata) await this.initialize();

    const pubDir = this.getPublicationDir(hash);
    const imagesDir = this.getImagesDir(hash);

    // Create publication directory
    await fs.mkdir(pubDir, { recursive: true });
    await fs.mkdir(imagesDir, { recursive: true });

    // Save content file
    const contentPath = path.join(pubDir, 'content.md');
    const tempContentPath = `${contentPath}.tmp`;
    await fs.writeFile(tempContentPath, content, 'utf-8');
    await fs.rename(tempContentPath, contentPath);

    // Process images
    let imagesUploaded = 0;
    const newImageFilenames: string[] = [];

    if (images && images.length > 0) {
      // Validate number of images
      if (images.length > config.maxImagesPerPublication) {
        throw new Error(`Too many images. Maximum allowed: ${config.maxImagesPerPublication}`);
      }

      for (const image of images) {
        // Validate MIME type
        if (!config.allowedImageTypes.includes(image.mimeType)) {
          logger.warn('Invalid image type', { filename: image.filename, mimeType: image.mimeType });
          continue;
        }

        // Decode base64
        const buffer = Buffer.from(image.data, 'base64');

        // Validate size
        if (buffer.length > config.maxImageSize) {
          logger.warn('Image too large', { filename: image.filename, size: buffer.length });
          continue;
        }

        // Sanitize filename
        const sanitizedFilename = this.sanitizeImageFilename(image.filename);
        const imagePath = path.join(imagesDir, sanitizedFilename);
        const tempImagePath = `${imagePath}.tmp`;

        await fs.writeFile(tempImagePath, buffer);
        await fs.rename(tempImagePath, imagePath);

        newImageFilenames.push(sanitizedFilename);
        imagesUploaded++;
        logger.debug('Image saved', { hash, filename: sanitizedFilename });
      }
    }

    // Clean up old images that are no longer used
    if (publication.images && publication.images.length > 0) {
      const oldImages = publication.images.filter(img => !newImageFilenames.includes(img));
      for (const oldImage of oldImages) {
        try {
          await fs.unlink(path.join(imagesDir, oldImage));
          logger.debug('Old image removed', { hash, filename: oldImage });
        } catch (error) {
          // Ignore if file doesn't exist
        }
      }
    }

    // Update publication record with image list
    publication.images = newImageFilenames;

    // Update metadata
    this.metadata!.publications[hash] = publication;
    this.metadata!.filenameIndex[publication.filename] = hash;

    await this.saveMetadata();
    logger.info('Publication saved', { hash, filename: publication.filename, images: imagesUploaded });

    return imagesUploaded;
  }

  private sanitizeImageFilename(filename: string): string {
    // Remove path separators and dangerous characters
    return filename
      .replace(/[/\\]/g, '_')
      .replace(/\.\./g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  async getContent(hash: string): Promise<string | null> {
    const contentPath = path.join(this.getPublicationDir(hash), 'content.md');
    try {
      return await fs.readFile(contentPath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async getImage(hash: string, filename: string): Promise<{ data: Buffer; mimeType: string } | null> {
    // Sanitize filename to prevent directory traversal
    const sanitizedFilename = this.sanitizeImageFilename(filename);
    const imagePath = path.join(this.getImagesDir(hash), sanitizedFilename);

    try {
      const data = await fs.readFile(imagePath);
      const mimeType = this.getMimeType(sanitizedFilename);
      return { data, mimeType };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.bmp': 'image/bmp',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  async deletePublication(hash: string): Promise<boolean> {
    if (!this.metadata) await this.initialize();

    const publication = this.metadata!.publications[hash];
    if (!publication) return false;

    // Delete entire publication directory
    const pubDir = this.getPublicationDir(hash);
    try {
      await fs.rm(pubDir, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Update metadata
    delete this.metadata!.filenameIndex[publication.filename];
    delete this.metadata!.publications[hash];

    await this.saveMetadata();
    logger.info('Publication deleted', { hash, filename: publication.filename });
    return true;
  }

  async getAllPublications(): Promise<Record<string, Publication>> {
    if (!this.metadata) await this.initialize();
    return this.metadata!.publications;
  }
}

export const storageService = new StorageService();
