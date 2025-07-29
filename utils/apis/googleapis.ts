'use client';

import { getEnvVariable } from '@/actions/env';
import { envKey } from '@/types/env';

export const getDriveFolderContent = async (folderId: string, nextPageToken?: string) => {
  const apiKey = await getEnvVariable(envKey.GOOGLE_API_KEY);

  if (!apiKey) {
    return;
  }

  const queryParams = new URLSearchParams({
    q: `'${folderId}' in parents`,
    key: apiKey,
  });

  if (nextPageToken) {
    queryParams.set('pageToken', nextPageToken);
  }
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${queryParams.toString()}`);
  const data = await res.json();

  return data || [];
};

export const getDriveFileContent = async (fileId: string) => {
  const apiKey = await getEnvVariable(envKey.GOOGLE_API_KEY);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`);
  const buffer = await res.arrayBuffer();

  return buffer;
};
