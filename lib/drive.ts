// Server-only helpers for the Google Drive API. The API key is read here and never sent to the browser.
import { FileListResponse } from '@/types/googleApi';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3/files';

// Photos are scanned from thumbnails of this size (longest side, in px): big enough to detect faces,
// much smaller than the originals, and thumbnails don't count against the Drive API quota
const THUMBNAIL_SIZE = 1600;

// Drive ids only contain letters, digits, '-' and '_'. Anything else is rejected so it can't be injected into the query.
const DRIVE_ID_REGEX = /^[A-Za-z0-9_-]+$/;

export class DriveApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'DriveApiError';
  }
}

export const isValidDriveId = (id: string) => DRIVE_ID_REGEX.test(id);

const getApiKey = () => {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new DriveApiError('The server is missing GOOGLE_API_KEY.', 500);
  }

  return apiKey;
};

// Turn a failed Drive response into a message the user can act on
const toDriveApiError = async (res: Response, notFoundMessage: string) => {
  let reason = '';
  let googleMessage = '';
  let detailReasons: string[] = [];

  try {
    const body = await res.json();
    reason = body?.error?.errors?.[0]?.reason || '';
    googleMessage = body?.error?.message || '';
    detailReasons = (body?.error?.details || []).map((detail: { reason?: string }) => detail?.reason || '');
  } catch {
    // Body is not JSON, fall back to the status code
  }

  if (!res.ok) {
    console.error(`Google Drive request failed (status ${res.status}, reason ${reason || 'unknown'}): ${googleMessage}`);
  }

  if (res.status === 404) {
    return new DriveApiError(notFoundMessage, 404);
  }

  if (res.status === 429 || reason.toLowerCase().includes('ratelimit')) {
    return new DriveApiError('Google Drive rate limit reached. Please wait a few minutes and try again.', 429);
  }

  if (res.status === 400 && reason === 'badRequest') {
    return new DriveApiError('Google Drive rejected the request. Please check the folder link.', 400);
  }

  // Keys restricted to websites (HTTP referrers) only work from a browser, and the key is now only used by the server
  if (detailReasons.includes('API_KEY_HTTP_REFERRER_BLOCKED') || /referer/i.test(googleMessage)) {
    return new DriveApiError(
      "The Google API key only allows requests from certain websites, so the server cannot use it. In Google Cloud, set the key's application restriction to None and keep its API restriction to the Google Drive API.",
      502
    );
  }

  if (res.status === 400 || res.status === 403) {
    const details = googleMessage ? ` Google says: ${googleMessage}` : '';

    return new DriveApiError(`Google Drive refused the request. The server API key may be invalid or restricted.${details}`, 502);
  }

  return new DriveApiError(`Google Drive request failed (status ${res.status}).`, 502);
};

export const listDriveImages = async (
  folderId: string,
  options: {
    pageSize?: number;
    pageToken?: string;
  } = {}
) => {
  if (!isValidDriveId(folderId)) {
    throw new DriveApiError('Invalid folder id.', 400);
  }

  const searchParams = new URLSearchParams({
    q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
    fields: 'nextPageToken,files(id,name,mimeType,thumbnailLink)',
    key: getApiKey(),
  });

  if (options.pageSize) {
    searchParams.set('pageSize', options.pageSize.toString());
  }

  if (options.pageToken) {
    searchParams.set('pageToken', options.pageToken);
  }

  const res = await fetch(`${DRIVE_API_URL}?${searchParams.toString()}`, { cache: 'no-store' });

  if (!res.ok) {
    throw await toDriveApiError(res, 'Folder not found. Make sure the link is correct and the folder is shared publicly.');
  }

  const data: FileListResponse = await res.json();

  return data;
};

export const fetchDriveFile = async (fileId: string) => {
  if (!isValidDriveId(fileId)) {
    throw new DriveApiError('Invalid file id.', 400);
  }

  const searchParams = new URLSearchParams({ alt: 'media', key: getApiKey() });
  const res = await fetch(`${DRIVE_API_URL}/${fileId}?${searchParams.toString()}`, { cache: 'no-store' });

  if (!res.ok) {
    throw await toDriveApiError(res, 'Photo not found or not shared publicly.');
  }

  return res;
};

// Thumbnail links point to Google's image CDN. Only those hosts are allowed so the route can't fetch arbitrary URLs.
export const toThumbnailUrl = (thumbnailLink: string) => {
  let url: URL;

  try {
    url = new URL(thumbnailLink);
  } catch {
    return;
  }

  if (url.protocol !== 'https:' || !url.hostname.endsWith('.googleusercontent.com')) {
    return;
  }

  // Links end with a size option like "=s220". Ask for a bigger size instead.
  url.pathname = url.pathname.replace(/=s\d+$/, `=s${THUMBNAIL_SIZE}`);

  return url.toString();
};

export const fetchDriveThumbnail = async (thumbnailLink: string) => {
  const url = toThumbnailUrl(thumbnailLink);

  if (!url) {
    throw new DriveApiError('Invalid thumbnail link.', 400);
  }

  const res = await fetch(url, { cache: 'no-store' });

  if (res.status === 429) {
    throw new DriveApiError('Google Drive rate limit reached. Please wait a few minutes and try again.', 429);
  }

  if (!res.ok) {
    throw new DriveApiError(`Cannot load the photo thumbnail (status ${res.status}).`, 502);
  }

  return res;
};

export const driveErrorResponse = (error: unknown) => {
  if (error instanceof DriveApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  console.error(error);

  return Response.json({ error: 'Something went wrong while contacting Google Drive.' }, { status: 500 });
};
