import { getDriveFolderId } from './googleapis';

describe('getDriveFolderId', () => {
  it('should extract folder ID from a valid Google Drive folder link with query params', () => {
    const folderLink = 'https://drive.google.com/drive/folders/12345abcde?usp=sharing';
    const folderId = getDriveFolderId(folderLink);
    expect(folderId).toBe('12345abcde');
  });

  it('should extract folder ID from a valid Google Drive folder link without query params', () => {
    const folderLink = 'https://drive.google.com/drive/folders/12345abcde';
    const folderId = getDriveFolderId(folderLink);
    expect(folderId).toBe('12345abcde');
  });

  it('should return an empty string if the folder link does not contain a valid ID', () => {
    const folderLink = 'https://drive.google.com/drive/folders/';
    const folderId = getDriveFolderId(folderLink);
    expect(folderId).toBe('');
  });

  it('should return an empty string if the input is not a valid Google Drive folder link', () => {
    const folderLink = 'https://example.com/not-a-drive-link';
    const folderId = getDriveFolderId(folderLink);
    expect(folderId).toBe('');
  });
});
