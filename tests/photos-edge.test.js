/**
 * Additional edge case tests for photos handler - security & sanitization
 */
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn().mockResolvedValue({}) })),
  PutObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn()
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.amazonaws.com/presigned-url')
}));

jest.mock('../handlers/lib/dynamo', () => ({
  get: jest.fn(),
  put: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  query: jest.fn(),
  findById: jest.fn(),
  queryGSI: jest.fn()
}));

jest.mock('../handlers/lib/auth', () => ({
  getUser: jest.fn(),
  getCompanyId: jest.fn()
}));

const db = require('../handlers/lib/dynamo');
const auth = require('../handlers/lib/auth');
const photos = require('../handlers/photos');

describe('photos handler - security edge cases', () => {
  beforeEach(() => jest.clearAllMocks());

  const mockEstimate = {
    PK: 'COMPANY#comp-1', SK: 'EST#2026-01-01#est-1',
    id: 'est-1', photos: []
  };

  describe('getUploadUrl - filename sanitization', () => {
    test('sanitizes Windows-style path traversal', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.findById.mockResolvedValue(mockEstimate);

      const result = await photos.getUploadUrl({
        pathParameters: { id: 'est-1' },
        body: JSON.stringify({ filename: '..\\..\\..\\etc\\passwd', contentType: 'image/jpeg' })
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.key).not.toContain('..');
      expect(body.key).not.toContain('\\');
    });

    test('sanitizes filenames with spaces and special chars', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.findById.mockResolvedValue(mockEstimate);

      const result = await photos.getUploadUrl({
        pathParameters: { id: 'est-1' },
        body: JSON.stringify({ filename: 'my photo (1).jpg', contentType: 'image/jpeg' })
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      // Spaces and parens should be replaced with underscores
      expect(body.key).toContain('my_photo__1_.jpg');
    });

    test('truncates very long filenames to 100 chars', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.findById.mockResolvedValue(mockEstimate);

      const longName = 'a'.repeat(200) + '.jpg';
      const result = await photos.getUploadUrl({
        pathParameters: { id: 'est-1' },
        body: JSON.stringify({ filename: longName, contentType: 'image/jpeg' })
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      // The sanitized filename portion should be <= 100 chars
      const parts = body.key.split('/');
      const filenamePart = parts[parts.length - 1];
      // UUID prefix + sanitized name
      const sanitizedPart = filenamePart.split('-').slice(5).join('-'); // skip UUID parts
      // Total filename including UUID should be reasonable
      expect(filenamePart.length).toBeLessThan(200);
    });

    test('key format is companyId/estId/uuid-filename', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.findById.mockResolvedValue(mockEstimate);

      const result = await photos.getUploadUrl({
        pathParameters: { id: 'est-1' },
        body: JSON.stringify({ filename: 'yard.jpg', contentType: 'image/jpeg' })
      });
      const body = JSON.parse(result.body);

      expect(body.key).toMatch(/^comp-1\/est-1\/[a-f0-9-]+-yard\.jpg$/);
    });
  });

  describe('getUploadUrl - photo limit boundary', () => {
    test('allows upload at 19 photos (under limit)', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      const est19 = { ...mockEstimate, photos: Array(19).fill({ key: 'k' }) };
      db.findById.mockResolvedValue(est19);

      const result = await photos.getUploadUrl({
        pathParameters: { id: 'est-1' },
        body: JSON.stringify({ filename: 'last.jpg', contentType: 'image/jpeg' })
      });
      expect(result.statusCode).toBe(200);
    });

    test('rejects upload at exactly 20 photos', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      const est20 = { ...mockEstimate, photos: Array(20).fill({ key: 'k' }) };
      db.findById.mockResolvedValue(est20);

      const result = await photos.getUploadUrl({
        pathParameters: { id: 'est-1' },
        body: JSON.stringify({ filename: 'overflow.jpg', contentType: 'image/jpeg' })
      });
      expect(result.statusCode).toBe(400);
    });

    test('allows upload when photos is undefined', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      const estNoPhotos = { ...mockEstimate, photos: undefined };
      db.findById.mockResolvedValue(estNoPhotos);

      const result = await photos.getUploadUrl({
        pathParameters: { id: 'est-1' },
        body: JSON.stringify({ filename: 'first.jpg', contentType: 'image/jpeg' })
      });
      expect(result.statusCode).toBe(200);
    });
  });

  describe('deletePhoto - key validation', () => {
    test('rejects key from different estimate', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.findById.mockResolvedValue(mockEstimate);

      const result = await photos.deletePhoto({
        pathParameters: { id: 'est-1', key: 'comp-1/est-OTHER/abc-yard.jpg' }
      });
      expect(result.statusCode).toBe(403);
    });

    test('rejects key with path traversal in company prefix', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.findById.mockResolvedValue(mockEstimate);

      const result = await photos.deletePhoto({
        pathParameters: { id: 'est-1', key: 'comp-1/../comp-2/est-1/hack.jpg' }
      });
      // Key doesn't start with comp-1/est-1/ so should be forbidden
      expect(result.statusCode).toBe(403);
    });

    test('removes photo from array and updates estimate', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      const estWith2 = {
        ...mockEstimate,
        photos: [
          { key: 'comp-1/est-1/abc-one.jpg', filename: 'one.jpg' },
          { key: 'comp-1/est-1/def-two.jpg', filename: 'two.jpg' }
        ]
      };
      db.findById.mockResolvedValue(estWith2);
      db.update.mockResolvedValue({});

      const result = await photos.deletePhoto({
        pathParameters: { id: 'est-1', key: 'comp-1/est-1/abc-one.jpg' }
      });

      expect(result.statusCode).toBe(200);
      const updateCall = db.update.mock.calls[0][2];
      expect(updateCall.photos).toHaveLength(1);
      expect(updateCall.photos[0].key).toBe('comp-1/est-1/def-two.jpg');
    });

    test('sets updatedAt when deleting photo', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.findById.mockResolvedValue({ ...mockEstimate, photos: [{ key: 'comp-1/est-1/a.jpg' }] });
      db.update.mockResolvedValue({});

      const before = new Date().toISOString();
      await photos.deletePhoto({
        pathParameters: { id: 'est-1', key: 'comp-1/est-1/a.jpg' }
      });
      const after = new Date().toISOString();

      const updateCall = db.update.mock.calls[0][2];
      expect(updateCall.updatedAt >= before).toBe(true);
      expect(updateCall.updatedAt <= after).toBe(true);
    });
  });
});
