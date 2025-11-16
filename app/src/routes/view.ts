import { Router, Request, Response } from 'express';
import { storageService } from '../services/storage';
import { verifyPassword } from '../services/password';
import { renderMarkdown, getPageTemplate, getPasswordPageTemplate } from '../services/markdown';
import { passwordLimiter } from '../middleware/rateLimit';
import { logger } from '../services/logger';
import { config } from '../config';

const router = Router();

// Transform relative image paths to absolute URLs and encode spaces
function transformImagePaths(content: string, hash: string): string {
  // Replace ./images/filename with /p/hash/images/filename
  // Also encode spaces in filenames as %20
  return content.replace(
      /!\[([^\]]*)\]\(\.\/images\/([^)]+)\)/g,
      (match, alt, filename) => {
        const encodedFilename = filename.replace(/ /g, '%20');
        return `![${alt}](/p/${hash}/images/${encodedFilename})`;
      }
  );
}

// View publication
router.get('/:hash', async (req: Request, res: Response) => {
  try {
    const { hash } = req.params;
    const { raw } = req.query;

    if (!hash || hash.length < 10) {
      res.status(400).send('Invalid publication ID');
      return;
    }

    const publication = await storageService.getPublicationByHash(hash);

    if (!publication) {
      res.status(404).send('Publication not found');
      return;
    }

    // Check if password protected
    if (publication.passwordHash) {
      const session = req.session as { unlockedHashes?: string[] };
      const unlockedHashes = session.unlockedHashes || [];

      if (!unlockedHashes.includes(hash)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(getPasswordPageTemplate(hash));
        return;
      }
    }

    // Get content
    let content = await storageService.getContent(hash);

    if (!content) {
      res.status(404).send('Content not found');
      return;
    }

    // Return raw markdown if requested
    if (raw === 'true') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${publication.filename}.md"`);
      res.send(content);
      return;
    }

    // Transform image paths before rendering
    content = transformImagePaths(content, hash);

    // Render markdown to HTML
    const renderedContent = renderMarkdown(content);

    const html = getPageTemplate(
        publication.title,
        renderedContent,
        publication.createdAt,
        publication.updatedAt
    );

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    logger.error('Error viewing publication', { error, hash: req.params.hash });
    res.status(500).send('Internal server error');
  }
});

// Serve images for publication
router.get('/:hash/images/:filename', async (req: Request, res: Response) => {
  try {
    const { hash, filename } = req.params;

    if (!hash || hash.length < 10) {
      res.status(400).send('Invalid publication ID');
      return;
    }

    if (!filename) {
      res.status(400).send('Filename is required');
      return;
    }

    const publication = await storageService.getPublicationByHash(hash);

    if (!publication) {
      res.status(404).send('Publication not found');
      return;
    }

    // Check if password protected
    if (publication.passwordHash) {
      const session = req.session as { unlockedHashes?: string[] };
      const unlockedHashes = session.unlockedHashes || [];

      if (!unlockedHashes.includes(hash)) {
        res.status(403).send('Access denied. Publication is password protected.');
        return;
      }
    }

    // Decode URL-encoded filename
    const decodedFilename = decodeURIComponent(filename);

    // Get image
    const image = await storageService.getImage(hash, decodedFilename);

    if (!image) {
      res.status(404).send('Image not found');
      return;
    }

    // Set caching headers
    res.setHeader('Cache-Control', `public, max-age=${config.imageCacheMaxAge}`);
    res.setHeader('Content-Type', image.mimeType);
    res.setHeader('Content-Length', image.data.length);

    res.send(image.data);
  } catch (error) {
    logger.error('Error serving image', { error, hash: req.params.hash, filename: req.params.filename });
    res.status(500).send('Internal server error');
  }
});

// Verify password
router.post('/:hash/verify', async (req: Request, res: Response) => {
  try {
    const { hash } = req.params;
    const { password } = req.body;

    if (!hash || hash.length < 10) {
      res.status(400).send('Invalid publication ID');
      return;
    }

    if (!passwordLimiter(hash)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(getPasswordPageTemplate(hash, 'Too many attempts. Please try again later.'));
      return;
    }

    const publication = await storageService.getPublicationByHash(hash);

    if (!publication) {
      res.status(404).send('Publication not found');
      return;
    }

    if (!publication.passwordHash) {
      res.redirect(`/p/${hash}`);
      return;
    }

    if (!password) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(getPasswordPageTemplate(hash, 'Password is required'));
      return;
    }

    const isValid = await verifyPassword(password, publication.passwordHash);

    if (!isValid) {
      logger.warn('Invalid password attempt', { hash, ip: req.ip });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(getPasswordPageTemplate(hash, 'Invalid password'));
      return;
    }

    const session = req.session as { unlockedHashes?: string[] };
    if (!session.unlockedHashes) {
      session.unlockedHashes = [];
    }
    session.unlockedHashes.push(hash);

    logger.info('Publication unlocked', { hash });

    res.redirect(`/p/${hash}`);
  } catch (error) {
    logger.error('Error verifying password', { error, hash: req.params.hash });
    res.status(500).send('Internal server error');
  }
});

export default router;