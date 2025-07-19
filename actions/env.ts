'use server';

export const getEnvVariable = async (key: string) => {
  return process.env[key];
};
