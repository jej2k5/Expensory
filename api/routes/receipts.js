import { Router } from 'express';
import { writeFile } from 'fs/promises';
import { join, extname } from 'path';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = join(__dirname, '..', '..', 'uploads', 'receipts');

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

const EXT_MAP = {
  'image/jpeg':    '.jpg',
  'image/png':     '.png',
  'image/gif':     '.gif',
  'image/webp':    '.webp',
  'application/pdf': '.pdf',
};

const router = Router();

// POST /receipts — save a base64-encoded receipt image to disk
router.post('/', async (req, res, next) => {
  try {
    const { data, mimetype, filename: hint } = req.body;

    if (!data)
      return res.status(400).json({ error: 'data (base64-encoded image) is required' });
    if (!mimetype || !ALLOWED_MIMES.has(mimetype))
      return res.status(400).json({
        error: `mimetype must be one of: ${[...ALLOWED_MIMES].join(', ')}`,
      });

    const buffer   = Buffer.from(data, 'base64');
    const ext      = EXT_MAP[mimetype] || '.bin';
    const filename = `receipt_${Date.now()}_${randomBytes(4).toString('hex')}${ext}`;
    const filePath = join(UPLOADS_DIR, filename);

    await writeFile(filePath, buffer);
    console.log(`[Receipts] Saved ${filename} (${buffer.length} bytes)`);

    res.status(201).json({
      filename,
      size:              buffer.length,
      mimetype,
      original_filename: hint || null,
    });
  } catch (err) { next(err); }
});

export default router;
