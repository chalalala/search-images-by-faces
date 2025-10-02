import { getDriveFolderContent } from './apis/googleapis';

export const getDriveFolderId = (folderLink: string) => {
  const folderRegex = /(?:folders\/)([^?\/]+)/g;
  const folderId = folderRegex.exec(folderLink)?.[1] || '';

  return folderId;
};

export const getFilesByFolderLink = async (folderLink: string) => {
  const folderId = getDriveFolderId(folderLink);

  if (!folderId) {
    return;
  }

  const data = await getDriveFolderContent(folderId);

  if (!data) {
    return;
  }

  return data.files;
};
