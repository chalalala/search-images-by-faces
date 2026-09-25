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

describe('scanDriveFolder', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('processes every image on every page and reports progress', async () => {
    const processFile = jest.fn(async () => {});
    const onProgress = jest.fn();
    const wait = jest.fn(async () => {});

    const result = await scanDriveFolder({ listPage, processFile, minTimeBetweenRequestsMs: 1000, onProgress, wait });

    expect(listPage.mock.calls.map(([token]) => token)).toEqual(['', 'page-2', 'page-3']);
    expect(processFile.mock.calls.map(([file]) => file.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(result).toEqual({ scanned: 4, failed: 0 });
    expect(onProgress).toHaveBeenLastCalledWith({ scanned: 4, failed: 0 });
  });

  it('waits only for the time left between page requests, and not after the last page', async () => {
    let time = 0;
    const processFile = jest.fn(async () => {
      time += 300;
    });
    const wait = jest.fn(async (ms: number) => {
      time += ms;
    });

    await scanDriveFolder({ listPage, processFile, minTimeBetweenRequestsMs: 1000, wait, now: () => time });

    // Page 1 took 600ms, page 2 took 300ms, page 3 is the last one
    expect(wait.mock.calls.map(([ms]) => ms)).toEqual([400, 700]);
  });

  it('skips a photo that cannot be read and keeps scanning', async () => {
    const processFile = jest.fn(async (file: FileListResponseSingleFile) => {
      if (file.id === 'b') {
        throw new Error('Unsupported image');
      }
    });

    const result = await scanDriveFolder({ listPage, processFile, minTimeBetweenRequestsMs: 0 });

    expect(result).toEqual({ scanned: 4, failed: 1 });
  });

  it('stops the scan on a rate limit error', async () => {
    const processFile = jest.fn(async () => {
      throw new DriveRequestError('Google Drive rate limit reached.', 429);
    });

    await expect(scanDriveFolder({ listPage, processFile, minTimeBetweenRequestsMs: 0 })).rejects.toThrow('rate limit');
    expect(listPage).toHaveBeenCalledTimes(1);
  });

  it('does not request more pages after being aborted', async () => {
    const controller = new AbortController();
    const processFile = jest.fn(async () => controller.abort());
    const wait = jest.fn(async () => {});

    await scanDriveFolder({ listPage, processFile, minTimeBetweenRequestsMs: 1000, signal: controller.signal, wait });

    expect(listPage).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
});
