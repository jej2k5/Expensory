import * as Minio from 'minio';

export const BUCKET = process.env.MINIO_BUCKET || 'receipts';

let client;

export function getMinioClient() {
  if (!client) {
    client = new Minio.Client({
      endPoint:  process.env.MINIO_ENDPOINT  || 'localhost',
      port:      parseInt(process.env.MINIO_PORT || '9000', 10),
      useSSL:    process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'expensory',
      secretKey: process.env.MINIO_SECRET_KEY || 'expensory123',
    });
  }
  return client;
}

export async function ensureBucket() {
  const minio = getMinioClient();
  const exists = await minio.bucketExists(BUCKET);
  if (!exists) {
    await minio.makeBucket(BUCKET);
    console.log(`[MinIO] Created bucket: ${BUCKET}`);
  } else {
    console.log(`[MinIO] Bucket ready: ${BUCKET}`);
  }
}
