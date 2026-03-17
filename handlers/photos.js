const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const db = require('./lib/dynamo');
const auth = require('./lib/auth');
const res = require('./lib/response');
const crypto = require('crypto');

const s3 = new S3Client({});
const BUCKET = process.env.ASSETS_BUCKET;

module.exports.getUploadUrl = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const estId = event.pathParameters.id;

  // Verify the estimate exists and belongs to this company
  const { items } = await db.query('COMPANY#' + companyId, 'EST#', 50);
  const est = items.find(i => i.id === estId);
  if (!est) return res.notFound();

  const body = JSON.parse(event.body || '{}');
  if (!body.filename || !body.contentType) {
    return res.bad('filename and contentType are required');
  }

  const key = companyId + '/' + estId + '/' + crypto.randomUUID() + '-' + body.filename;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: body.contentType
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

  return res.ok({ uploadUrl, key });
};

module.exports.deletePhoto = async (event) => {
  const companyId = await auth.getCompanyId(event, db);
  if (!companyId) return res.forbidden();

  const estId = event.pathParameters.id;
  const photoKey = decodeURIComponent(event.pathParameters.key);

  // Verify the estimate exists and belongs to this company
  const { items } = await db.query('COMPANY#' + companyId, 'EST#', 50);
  const est = items.find(i => i.id === estId);
  if (!est) return res.notFound();

  // Verify the key belongs to this company/estimate
  if (!photoKey.startsWith(companyId + '/' + estId + '/')) {
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
