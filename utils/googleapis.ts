export const getDriveFolderId = (folderLink: string) => {
  const folderRegex = /(?:folders\/)([^?\/]+)/g;
  const folderId = folderRegex.exec(folderLink)?.[1] || '';

  return folderId;
};
