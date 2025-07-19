'use client';

import { getEnvVariable } from '@/actions/env';
import { envKey } from '@/types/env';

export const getDriveFolderContent = async (folderId: string) => {
  const apiKey = await getEnvVariable(envKey.GOOGLE_API_KEY);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=%27${folderId}%27%20in%20parents&key=${apiKey}`);
  const data = await res.json();

  return data || [];
};

export const getDriveFileContent = async (fileId: string) => {
  const apiKey = await getEnvVariable(envKey.GOOGLE_API_KEY);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`);
  const buffer = await res.arrayBuffer();

  return buffer;
};
