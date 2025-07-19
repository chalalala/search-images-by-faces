'use server';

import { envKey } from '@/types/env';

export const getEnvVariable = async (key: envKey) => {
  return process.env[key];
};
