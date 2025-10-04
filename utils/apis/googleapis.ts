'use client';

import { getEnvVariable } from '@/actions/env';
import { envKey } from '@/types/env';
import { FileListResponse } from '@/types/googleApi';

export const getDriveFolderContent = async (folderId: string) => {
  const apiKey = await getEnvVariable(envKey.GOOGLE_API_KEY);

  if (!apiKey) {
    return;
  }

  let data: FileListResponse[] = [];
  let nextPageToken = '';

  do {
    const searchParams = new URLSearchParams({
      q: `'${folderId}' in parents`,
      key: apiKey || '',
      pageToken: nextPageToken,
    });

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${searchParams.toString()}`);
    const pageData = await res.json();

    nextPageToken = pageData.nextPageToken;

    data = [...data, ...(pageData.files || [])];
  } while (nextPageToken);

  return data;
};

export const getDriveFileContent = async (fileId: string) => {
  const apiKey = await getEnvVariable(envKey.GOOGLE_API_KEY);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`);
  const buffer = await res.arrayBuffer();

  return buffer;
};
