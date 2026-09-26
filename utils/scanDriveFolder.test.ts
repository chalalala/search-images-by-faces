import { FileListResponse, FileListResponseSingleFile } from '@/types/googleApi';
import { DriveRequestError } from './apis/googleapis';
import { scanDriveFolder } from './scanDriveFolder';

const image = (id: string): FileListResponseSingleFile => ({ kind: 'drive#file', id, name: `${id}.jpg`, mimeType: 'image/jpeg' });

const page = (files: FileListResponseSingleFile[], nextPageToken?: string): FileListResponse => ({
  kind: 'drive#fileList',
  incompleteSearch: false,
  files,
  nextPageToken,
});

const pages: Record<string, FileListResponse> = {
  '': page([image('a'), image('b')], 'page-2'),
  'page-2': page([image('c'), { ...image('doc'), mimeType: 'application/pdf' }], 'page-3'),
  'page-3': page([image('d')]),
};

const listPage = jest.fn(async (pageToken: string) => pages[pageToken]);
const rateLimitError = () => new DriveRequestError('Google Drive rate limit reached.', 429);
const noWait = jest.fn(async () => {});
const retry = { retries: 3, initialDelayMs: 1000, maxDelayMs: 3000 };

describe('scanDriveFolder', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('processes every image on every page and reports progress', async () => {
    const processFile = jest.fn(async (file: FileListResponseSingleFile) => {
      expect(file.mimeType).toMatch(/^image\//);
    });
    const onProgress = jest.fn();

    const result = await scanDriveFolder({ listPage, processFile, concurrency: 2, onProgress, wait: noWait });

    expect(listPage.mock.calls.map(([token]) => token)).toEqual(['', 'page-2', 'page-3']);
    expect(processFile.mock.calls.map(([file]) => file.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(result).toEqual({ scanned: 4, failed: 0 });
    expect(onProgress).toHaveBeenLastCalledWith({ scanned: 4, failed: 0 });
    expect(noWait).not.toHaveBeenCalled();
  });

  it('never runs more photos at once than the concurrency limit', async () => {
    const manyImages = page(Array.from({ length: 10 }, (_, i) => image(`photo-${i}`)));
    let running = 0;
    let maxRunning = 0;
    const processFile = jest.fn(async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running--;
    });

    const result = await scanDriveFolder({ listPage: async () => manyImages, processFile, concurrency: 3 });

    expect(result.scanned).toBe(10);
    expect(maxRunning).toBe(3);
  });

  it('waits and retries with a growing delay when rate limited', async () => {
    let time = 0;
    const wait = jest.fn(async (ms: number) => {
      time += ms;
    });
    let calls = 0;
    const processFile = jest.fn(async (file: FileListResponseSingleFile) => {
      if (file.id === 'a' && calls++ < 3) {
        throw rateLimitError();
      }
    });
    const onProgress = jest.fn();

    const result = await scanDriveFolder({
      listPage,
      processFile,
      concurrency: 1,
      retry,
      wait,
      now: () => time,
      onProgress,
    });

    expect(result).toEqual({ scanned: 4, failed: 0 });
    expect(wait.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 3000]);
    expect(onProgress).toHaveBeenCalledWith({ scanned: 0, failed: 0, retryInMs: 2000 });
  });

  it('retries listing a page when rate limited', async () => {
    let calls = 0;
    const flakyListPage = jest.fn(async (pageToken: string) => {
      if (pageToken === 'page-2' && calls++ === 0) {
        throw rateLimitError();
      }
      return pages[pageToken];
    });

    const result = await scanDriveFolder({ listPage: flakyListPage, processFile: async () => {}, concurrency: 2, retry, wait: noWait });

    expect(result.scanned).toBe(4);
    expect(flakyListPage).toHaveBeenCalledTimes(4);
  });

  it('stops the scan when the rate limit does not go away', async () => {
    const processFile = jest.fn(async () => {
      throw rateLimitError();
    });

    await expect(scanDriveFolder({ listPage, processFile, concurrency: 1, retry, wait: noWait })).rejects.toThrow('rate limit');
    // The first photo is tried once plus 3 retries, then the scan stops without trying the others
    expect(processFile).toHaveBeenCalledTimes(4);
    expect(listPage).toHaveBeenCalledTimes(1);
  });

  it('skips a photo that cannot be read and keeps scanning', async () => {
    const processFile = jest.fn(async (file: FileListResponseSingleFile) => {
      if (file.id === 'b') {
        throw new Error('Unsupported image');
      }
    });

    const result = await scanDriveFolder({ listPage, processFile, concurrency: 2 });

    expect(result).toEqual({ scanned: 4, failed: 1 });
  });

  it('stops the scan when the server cannot reach Drive', async () => {
    const processFile = jest.fn(async () => {
      throw new DriveRequestError('The server is missing GOOGLE_API_KEY.', 500);
    });

    await expect(scanDriveFolder({ listPage, processFile, concurrency: 1 })).rejects.toThrow('GOOGLE_API_KEY');
    expect(processFile).toHaveBeenCalledTimes(1);
  });

  it('does not request more pages after being aborted', async () => {
    const controller = new AbortController();
    const processFile = jest.fn(async () => controller.abort());

    await scanDriveFolder({ listPage, processFile, concurrency: 1, signal: controller.signal });

    expect(listPage).toHaveBeenCalledTimes(1);
    expect(processFile).toHaveBeenCalledTimes(1);
  });
});
