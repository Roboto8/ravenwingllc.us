const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const db = require('./lib/dynamo');
const auth = require('./lib/auth');
const res = require('./lib/response');
const crypto = require('crypto');

const s3 = new S3Client({});
const BUCKET = process.env.ASSETS_BUCKET;

// Allowed image types only — no executables, scripts, HTML
const ALLOWED_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif'
};
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_PHOTOS_PER_ESTIMATE = 20;

function sanitizeFilename(name) {
  // Strip path components, keep only the filename, remove dangerous characters
  return name
    .replace(/^.*[\\\/]/, '') // strip path
    .replace(/[^a-zA-Z0-9._-]/g, '_') // only safe chars
    .substring(0, 100); // limit length
}

module.exports.getUploadUrl = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const estId = event.pathParameters.id;

  // Verify the estimate exists and belongs to this company
  const est = await db.findById('COMPANY#' + companyId, 'EST#', estId);
  if (!est) return res.notFound();

  const body = res.parseBody(event);
  if (!body) return res.bad('Invalid JSON');
  if (!body.filename || !body.contentType) {
    return res.bad('filename and contentType are required');
  }

  // Validate content type
  if (!ALLOWED_TYPES[body.contentType]) {
    return res.bad('File type not allowed. Accepted: JPEG, PNG, WebP, HEIC');
  }

  // Check photo count limit
  if (est.photos && est.photos.length >= MAX_PHOTOS_PER_ESTIMATE) {
    return res.bad('Maximum ' + MAX_PHOTOS_PER_ESTIMATE + ' photos per estimate');
  }

  const safeName = sanitizeFilename(body.filename);
  const key = companyId + '/' + estId + '/' + crypto.randomUUID() + '-' + safeName;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: body.contentType,
    ContentDisposition: 'attachment', // prevent browser execution
    ContentLength: MAX_FILE_SIZE
  });

  const uploadUrl = await getSignedUrl(s3, command, {
    expiresIn: 300,
    unhoistableHeaders: new Set(['content-length'])
  });

  return res.ok({ uploadUrl, key, maxSize: MAX_FILE_SIZE });
};

module.exports.deletePhoto = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const estId = event.pathParameters.id;
  const photoKey = decodeURIComponent(event.pathParameters.key);

  // Verify the estimate exists and belongs to this company
  const est = await db.findById('COMPANY#' + companyId, 'EST#', estId);
  if (!est) return res.notFound();

  // Verify the key belongs to this company/estimate (exact segment match)
  const keyParts = photoKey.split('/');
  if (keyParts.length < 3 || keyParts[0] !== companyId || keyParts[1] !== estId) {
    return res.forbidden('Photo does not belong to this estimate');
  }

  // Delete from S3
  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: photoKey
  }));

  // Remove from estimate's photos array
  const photos = (est.photos || []).filter(p => p.key !== photoKey);
  await db.update(est.PK, est.SK, { photos, updatedAt: new Date().toISOString() });

  return res.ok({ deleted: true });
};
