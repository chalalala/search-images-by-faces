import { FileListResponse, FileListResponseSingleFile } from '@/types/googleApi';
import { DriveRequestError } from './apis/googleapis';

export interface ScanProgress {
  scanned: number; // Photos checked so far, including the ones that failed
  failed: number; // Photos that could not be downloaded or read
  retryInMs?: number; // Set while waiting for Google Drive's rate limit to reset
}

interface RetryOptions {
  retries: number; // How many times a rate limited request is retried before giving up
  initialDelayMs: number;
  maxDelayMs: number;
}

interface ScanDriveFolderOptions {
  listPage: (pageToken: string) => Promise<FileListResponse>;
  processFile: (file: FileListResponseSingleFile) => Promise<void>;
  concurrency: number; // How many photos are downloaded and checked at the same time
  retry?: RetryOptions;
  signal?: AbortSignal;
  onProgress?: (progress: ScanProgress) => void;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
}

const DEFAULT_RETRY: RetryOptions = { retries: 6, initialDelayMs: 5000, maxDelayMs: 60000 };

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

const isRateLimitError = (error: unknown) => error instanceof DriveRequestError && error.status === 429;

// A failed download only skips that photo, unless the whole scan can't continue (server misconfigured, bad API key)
const isFatalError = (error: unknown) => error instanceof DriveRequestError && error.status >= 500;

/**
 * Walks every page of a Drive folder and runs `processFile` on each image, a few at a time.
 * When Google Drive rate limits a request, the scan pauses and retries it with an increasing delay
 * instead of failing, so large folders can finish.
 */
export const scanDriveFolder = async ({
  listPage,
  processFile,
  concurrency,
  retry = DEFAULT_RETRY,
  signal,
  onProgress,
  wait = sleep,
  now = Date.now,
}: ScanDriveFolderOptions): Promise<ScanProgress> => {
  const progress: ScanProgress = { scanned: 0, failed: 0 };
  let pausedUntil = 0; // Shared by all workers, so one rate limit pauses every request

  const withRetry = async <T>(request: () => Promise<T>): Promise<T> => {
    let delayMs = retry.initialDelayMs;

    for (let attempt = 0; ; attempt++) {
      const remainingPauseMs = pausedUntil - now();

      if (remainingPauseMs > 0) {
        await wait(remainingPauseMs, signal);
      }

      try {
        return await request();
      } catch (error) {
        if (!isRateLimitError(error) || attempt >= retry.retries || signal?.aborted) {
          throw error;
        }

        pausedUntil = Math.max(pausedUntil, now() + delayMs);
        onProgress?.({ ...progress, retryInMs: delayMs });
        await wait(delayMs, signal);
        onProgress?.({ ...progress });
        delayMs = Math.min(delayMs * 2, retry.maxDelayMs);
      }
    }
  };

  const checkFile = async (file: FileListResponseSingleFile) => {
    try {
      await withRetry(() => processFile(file));
    } catch (error) {
      if (signal?.aborted || isRateLimitError(error) || isFatalError(error)) {
        throw error;
      }

      console.warn(`Skipped ${file.name}:`, error);
      progress.failed++;
    }

    progress.scanned++;
    onProgress?.({ ...progress });
  };

  let pageToken = '';

  do {
    const page = await withRetry(() => listPage(pageToken));
    pageToken = page.nextPageToken || '';

    const imageFiles = (page.files || []).filter((file) => file.mimeType.startsWith('image/'));
    let nextIndex = 0;
    let hasStopped = false;

    // Run `concurrency` workers that each take the next photo until the page is done.
    // When one of them hits an error that ends the scan, the others stop taking photos.
    const workers = Array.from({ length: Math.min(concurrency, imageFiles.length) }, async () => {
      while (nextIndex < imageFiles.length && !hasStopped && !signal?.aborted) {
        try {
          await checkFile(imageFiles[nextIndex++]);
        } catch (error) {
          hasStopped = true;
          throw error;
        }
      }
    });

    await Promise.all(workers);
  } while (pageToken && !signal?.aborted);

  return progress;
};
