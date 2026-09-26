'use client';

import { FileListResponse } from '@/types/googleApi';

// Thrown when the Drive API routes return an error. `message` is safe to show to the user.
export class DriveRequestError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'DriveRequestError';
  }
}

const toDriveRequestError = async (res: Response) => {
  let message = 'Cannot reach Google Drive. Please try again.';

  try {
    const body = await res.json();
    message = body?.error || message;
  } catch {
    // Body is not JSON, keep the default message
  }

  return new DriveRequestError(message, res.status);
};

export const getDriveFolderContent = async (
  folderId: string,
  options: {
    pageSize?: number;
    pageToken?: string;
    signal?: AbortSignal;
  } = {}
) => {
  const searchParams = new URLSearchParams({ folderId });

  if (options.pageSize) {
    searchParams.set('pageSize', options.pageSize.toString());
  }

  if (options.pageToken) {
    searchParams.set('pageToken', options.pageToken);
  }

  const res = await fetch(`/api/drive/files?${searchParams.toString()}`, { signal: options.signal });

  if (!res.ok) {
    throw await toDriveRequestError(res);
  }

  const data: FileListResponse = await res.json();

  return data;
};

export const getDriveFileContent = async (fileId: string, options: { signal?: AbortSignal } = {}) => {
  const res = await fetch(`/api/drive/files/${encodeURIComponent(fileId)}`, { signal: options.signal });

  if (!res.ok) {
    throw await toDriveRequestError(res);
  }

  const buffer = await res.arrayBuffer();

  return buffer;
};

export const getDriveThumbnail = async (thumbnailLink: string, options: { signal?: AbortSignal } = {}) => {
  const searchParams = new URLSearchParams({ link: thumbnailLink });
  const res = await fetch(`/api/drive/thumbnail?${searchParams.toString()}`, { signal: options.signal });

  if (!res.ok) {
    throw await toDriveRequestError(res);
  }

  return res.blob();
};
