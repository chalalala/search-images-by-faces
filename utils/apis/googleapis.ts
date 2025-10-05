'use client';

import { getEnvVariable } from '@/actions/env';
import { envKey } from '@/types/env';
import { FileListResponse } from '@/types/googleApi';

export const getDriveFolderContent = async (
  folderId: string,
  options: {
    pageSize?: number;
    pageToken?: string;
  } = { pageSize: 100, pageToken: '' }
) => {
  const apiKey = await getEnvVariable(envKey.GOOGLE_API_KEY);

  if (!apiKey) {
    return;
  }

  const searchParams = new URLSearchParams({
    q: `'${folderId}' in parents`,
    key: apiKey || '',
    pageToken: options.pageToken || '',
    pageSize: (options.pageSize || '').toString(),
  });

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${searchParams.toString()}`);
  const data: FileListResponse = await res.json();

  return data;
};

export const getDriveFileContent = async (fileId: string) => {
  const apiKey = await getEnvVariable(envKey.GOOGLE_API_KEY);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`);
  const buffer = await res.arrayBuffer();

  return buffer;
};
