/**
 * @jest-environment node
 */
import { DriveApiError, fetchDriveFile, listDriveImages, toThumbnailUrl } from './drive';

const mockFetch = jest.fn();

const driveError = (status: number, reason: string) => new Response(JSON.stringify({ error: { code: status, errors: [{ reason }] } }), { status });

describe('Drive API helpers', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = mockFetch;
    process.env.GOOGLE_API_KEY = 'test-key';
  });

  it('lists only images in the folder and passes paging options', async () => {
    mockFetch.mockResolvedValue(Response.json({ files: [], nextPageToken: 'next' }));

    const data = await listDriveImages('folder_ID-1', { pageSize: 10, pageToken: 'token' });

    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.searchParams.get('q')).toBe("'folder_ID-1' in parents and mimeType contains 'image/' and trashed = false");
    expect(url.searchParams.get('pageSize')).toBe('10');
    expect(url.searchParams.get('pageToken')).toBe('token');
    expect(url.searchParams.get('key')).toBe('test-key');
    expect(data.nextPageToken).toBe('next');
  });

  it('rejects ids that could change the Drive query', async () => {
    await expect(listDriveImages("x' or name contains '")).rejects.toMatchObject({ status: 400 });
    await expect(fetchDriveFile('../other')).rejects.toMatchObject({ status: 400 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fails clearly when the API key is missing', async () => {
    delete process.env.GOOGLE_API_KEY;

    await expect(listDriveImages('folder')).rejects.toThrow('GOOGLE_API_KEY');
  });

  it.each([
    [404, 'notFound', 404, 'Folder not found'],
    [403, 'userRateLimitExceeded', 429, 'rate limit'],
    [429, 'rateLimitExceeded', 429, 'rate limit'],
    [400, 'keyInvalid', 502, 'API key'],
    [500, 'backendError', 502, 'status 500'],
  ])('maps a Drive %i %s error to a readable message', async (status, reason, expectedStatus, expectedMessage) => {
    mockFetch.mockResolvedValue(driveError(status, reason));

    const error: DriveApiError = await listDriveImages('folder').catch((e) => e);

    expect(error).toBeInstanceOf(DriveApiError);
    expect(error.status).toBe(expectedStatus);
    expect(error.message).toContain(expectedMessage);
  });

  it('explains when the API key is restricted to websites', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 403,
            message: 'Requests from referer <empty> are blocked.',
            errors: [{ reason: 'forbidden' }],
            details: [{ reason: 'API_KEY_HTTP_REFERRER_BLOCKED' }],
          },
        }),
        { status: 403 }
      )
    );

    const error: DriveApiError = await listDriveImages('folder').catch((e) => e);

    expect(error.status).toBe(502);
    expect(error.message).toContain('application restriction to None');
  });

  it("includes Google's message when the key is refused for another reason", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', errors: [{ reason: 'badRequest' }] } }),
        { status: 403 }
      )
    );

    const error: DriveApiError = await listDriveImages('folder').catch((e) => e);

    expect(error.message).toContain('Google says: API key not valid.');
  });

  it('asks Drive for thumbnail links when listing', async () => {
    mockFetch.mockResolvedValue(Response.json({ files: [] }));

    await listDriveImages('folder');

    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.searchParams.get('fields')).toContain('thumbnailLink');
  });
});

describe('toThumbnailUrl', () => {
  it('asks for a bigger thumbnail', () => {
    expect(toThumbnailUrl('https://lh3.googleusercontent.com/drive-storage/AJQWtBN-abc=s220')).toBe(
      'https://lh3.googleusercontent.com/drive-storage/AJQWtBN-abc=s1600'
    );
  });

  it.each(['https://example.com/image=s220', 'http://lh3.googleusercontent.com/abc=s220', 'https://googleusercontent.com.evil.com/a', 'not a url'])(
    'rejects %s',
    (link) => {
      expect(toThumbnailUrl(link)).toBeUndefined();
    }
  );
});
