import { FileListResponse, FileListResponseSingleFile } from '@/types/googleApi';
import { DriveRequestError } from './apis/googleapis';

export interface ScanProgress {
  scanned: number; // Photos checked so far, including the ones that failed
  failed: number; // Photos that could not be downloaded or read
}

interface ScanDriveFolderOptions {
  listPage: (pageToken: string) => Promise<FileListResponse>;
  processFile: (file: FileListResponseSingleFile) => Promise<void>;
  minTimeBetweenRequestsMs: number;
  signal?: AbortSignal;
  onProgress?: (progress: ScanProgress) => void;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
}

// Resolves after `ms`, or as soon as the signal is aborted
export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const timeout = setTimeout(done, ms);

    function done() {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', done);
      resolve();
    }

    signal?.addEventListener('abort', done);
  });

// A failed download only skips that photo, unless the whole scan can't continue (rate limit, server misconfigured)
const isFatalError = (error: unknown) => error instanceof DriveRequestError && (error.status === 429 || error.status >= 500);

/**
 * Walks every page of a Drive folder and runs `processFile` on each image.
 * Pages are requested at most once every `minTimeBetweenRequestsMs` to avoid hitting rate limits,
 * and there is no wait after the last page.
 */
export const scanDriveFolder = async ({
  listPage,
  processFile,
  minTimeBetweenRequestsMs,
  signal,
  onProgress,
  wait = sleep,
  now = Date.now,
}: ScanDriveFolderOptions): Promise<ScanProgress> => {
  const progress: ScanProgress = { scanned: 0, failed: 0 };
  let pageToken = '';

  do {
    const pageStartedAt = now();
    const page = await listPage(pageToken);
    pageToken = page.nextPageToken || '';

    const imageFiles = (page.files || []).filter((file) => file.mimeType.startsWith('image/'));

    await Promise.all(
      imageFiles.map(async (file) => {
        try {
          await processFile(file);
        } catch (error) {
          if (signal?.aborted || isFatalError(error)) {
            throw error;
          }

          console.warn(`Skipped ${file.name}:`, error);
          progress.failed++;
        }

        progress.scanned++;
        onProgress?.({ ...progress });
      })
    );

    if (pageToken && !signal?.aborted) {
      const remainingMs = minTimeBetweenRequestsMs - (now() - pageStartedAt);

      if (remainingMs > 0) {
        await wait(remainingMs, signal);
      }
    }
  } while (pageToken && !signal?.aborted);

  return progress;
};
