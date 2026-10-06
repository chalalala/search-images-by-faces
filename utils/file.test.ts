import { getUniqueZipPaths } from './file';

describe('getUniqueZipPaths', () => {
  it('keeps unique names and subfolders as they are', () => {
    expect(
      getUniqueZipPaths([
        { fileName: 'a.jpg', folderPath: '' },
        { fileName: 'b.jpg', folderPath: 'Trip/Day 1' },
      ])
    ).toEqual(['a.jpg', 'Trip/Day 1/b.jpg']);
  });

  it('numbers repeated names so no photo overwrites another', () => {
    expect(
      getUniqueZipPaths([
        { fileName: 'IMG_1.jpg', folderPath: '' },
        { fileName: 'IMG_1.jpg', folderPath: '' },
        { fileName: 'img_1.JPG', folderPath: '' },
        { fileName: 'IMG_1.jpg', folderPath: 'Trip' },
        { fileName: 'no-extension', folderPath: '' },
        { fileName: 'no-extension', folderPath: '' },
        { fileName: '.hidden', folderPath: '' },
        { fileName: '.hidden', folderPath: '' },
      ])
    ).toEqual(['IMG_1.jpg', 'IMG_1 (2).jpg', 'img_1 (3).JPG', 'Trip/IMG_1.jpg', 'no-extension', 'no-extension (2)', '.hidden', '.hidden (2)']);
  });
});
