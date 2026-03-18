import { Router } from 'express';
import { randomBytes } from 'crypto';
import { getMinioClient, BUCKET } from '../minio.js';

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

const EXT_MAP = {
  'image/jpeg':     '.jpg',
  'image/png':      '.png',
  'image/gif':      '.gif',
  'image/webp':     '.webp',
  'application/pdf':'.pdf',
};

const router = Router();

// POST /receipts — upload a base64-encoded receipt image to MinIO
router.post('/', async (req, res, next) => {
  try {
    const { data, mimetype, filename: hint } = req.body;

    if (!data)
      return res.status(400).json({ error: 'data (base64-encoded image) is required' });
    if (!mimetype || !ALLOWED_MIMES.has(mimetype))
      return res.status(400).json({
        error: `mimetype must be one of: ${[...ALLOWED_MIMES].join(', ')}`,
      });

    const buffer     = Buffer.from(data, 'base64');
    const ext        = EXT_MAP[mimetype] || '.bin';
    const objectName = `receipt_${Date.now()}_${randomBytes(4).toString('hex')}${ext}`;

    await getMinioClient().putObject(BUCKET, objectName, buffer, buffer.length, {
      'Content-Type': mimetype,
    });

    console.log(`[MinIO] Stored ${objectName} (${buffer.length} bytes)`);

    res.status(201).json({
      filename:          objectName,
      size:              buffer.length,
      mimetype,
      original_filename: hint || null,
    });
  } catch (err) { next(err); }
});

// GET /receipts/:filename — stream the object from MinIO
router.get('/:filename', async (req, res, next) => {
  try {
    const minio      = getMinioClient();
    const { filename } = req.params;

    const stat = await minio.statObject(BUCKET, filename);
    res.setHeader('Content-Type',   stat.metaData['content-type'] || 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control',  'public, max-age=31536000, immutable');

    const stream = await minio.getObject(BUCKET, filename);
    stream.pipe(res);
  } catch (err) {
    if (err.code === 'NoSuchKey') return res.status(404).json({ error: 'Receipt not found' });
    next(err);
  }
});

export default router;
