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
  queryGSI: jest.fn()
}));

jest.mock('../handlers/lib/auth', () => ({
  getUser: jest.fn(),
  getCompanyId: jest.fn()
}));

const db = require('../handlers/lib/dynamo');
const auth = require('../handlers/lib/auth');
const photos = require('../handlers/photos');

describe('photos handler', () => {
  beforeEach(() => jest.clearAllMocks());

  const mockEstimate = {
    PK: 'COMPANY#comp-1', SK: 'EST#2026-01-01#est-1',
    id: 'est-1', photos: []
  };

  describe('getUploadUrl', () => {
    test('returns presigned URL and key', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [mockEstimate] });

      const result = await photos.getUploadUrl({
        pathParameters: { id: 'est-1' },
        body: JSON.stringify({ filename: 'yard.jpg', contentType: 'image/jpeg' })
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.uploadUrl).toContain('presigned-url');
      expect(body.key).toContain('comp-1/est-1/');
      expect(body.key).toContain('yard.jpg');
    });

    test('returns 404 for missing estimate', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [] });

      const result = await photos.getUploadUrl({
        pathParameters: { id: 'nope' },
        body: JSON.stringify({ filename: 'a.jpg', contentType: 'image/jpeg' })
      });
      expect(result.statusCode).toBe(404);
    });

    test('returns 400 for missing filename', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [mockEstimate] });

      const result = await photos.getUploadUrl({
        pathParameters: { id: 'est-1' },
        body: JSON.stringify({ contentType: 'image/jpeg' })
      });
      expect(result.statusCode).toBe(400);
    });

    test('returns 403 when no auth', async () => {
      auth.getCompanyId.mockResolvedValue(null);
      const result = await photos.getUploadUrl({
        pathParameters: { id: 'est-1' },
        body: JSON.stringify({ filename: 'a.jpg', contentType: 'image/jpeg' })
      });
      expect(result.statusCode).toBe(403);
    });
  });

  describe('deletePhoto', () => {
    test('deletes photo from S3 and estimate', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      const estWithPhoto = {
        ...mockEstimate,
        photos: [{ key: 'comp-1/est-1/abc-yard.jpg', filename: 'yard.jpg' }]
      };
      db.query.mockResolvedValue({ items: [estWithPhoto] });
      db.update.mockResolvedValue({});

      const result = await photos.deletePhoto({
        pathParameters: { id: 'est-1', key: 'comp-1/est-1/abc-yard.jpg' }
      });
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.deleted).toBe(true);
      expect(db.update).toHaveBeenCalledWith(
        estWithPhoto.PK, estWithPhoto.SK,
        expect.objectContaining({ photos: [] })
      );
    });

    test('rejects photo key from wrong company', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [mockEstimate] });

      const result = await photos.deletePhoto({
        pathParameters: { id: 'est-1', key: 'comp-OTHER/est-1/hack.jpg' }
      });
      expect(result.statusCode).toBe(403);
    });

    test('returns 404 for missing estimate', async () => {
      auth.getCompanyId.mockResolvedValue('comp-1');
      db.query.mockResolvedValue({ items: [] });

      const result = await photos.deletePhoto({
        pathParameters: { id: 'nope', key: 'comp-1/nope/a.jpg' }
      });
      expect(result.statusCode).toBe(404);
    });
  });
});
