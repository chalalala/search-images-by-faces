import { FaceRecognitionResult } from '@/types/faceRecognition';
import JSZip from 'jszip';

export const writeFile = (blobPart: BlobPart | undefined, fileName: string) => {
  if (!blobPart) {
    return;
  }

  const blob = new Blob([blobPart]);
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.href = url;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(url);
};

/**
 * Gives every photo its own path in the zip, keeping the Drive subfolders.
 * Drive allows several files with the same name in one folder, so repeated names get " (2)", " (3)"... before the extension.
 */
export const getUniqueZipPaths = (photos: Pick<FaceRecognitionResult, 'fileName' | 'folderPath'>[]) => {
  const usedPaths = new Set<string>();

  return photos.map(({ fileName, folderPath }) => {
    const path = folderPath ? `${folderPath}/${fileName}` : fileName;
    const extensionIndex = fileName.lastIndexOf('.') > 0 ? path.length - (fileName.length - fileName.lastIndexOf('.')) : path.length;
    const base = path.slice(0, extensionIndex);
    const extension = path.slice(extensionIndex);

    let uniquePath = path;

    for (let copy = 2; usedPaths.has(uniquePath.toLowerCase()); copy++) {
      uniquePath = `${base} (${copy})${extension}`;
    }

    usedPaths.add(uniquePath.toLowerCase());

    return uniquePath;
  });
};

const CONCURRENT_DOWNLOADS = 4;

/**
 * Downloads the full size photos (only the ones not downloaded yet), then saves them as one zip.
 * `onProgress` gets how many photos are ready.
 */
export const downloadPhotosAsZip = async (
  photos: FaceRecognitionResult[],
  options: {
    getOriginal: (photo: FaceRecognitionResult) => Promise<Blob>;
    onProgress?: (done: number) => void;
    zipName?: string;
  }
) => {
  const zip = new JSZip();
  const folder = zip.folder('images');
  const paths = getUniqueZipPaths(photos);
  let nextIndex = 0;
  let done = 0;

  const workers = Array.from({ length: Math.min(CONCURRENT_DOWNLOADS, photos.length) }, async () => {
    while (nextIndex < photos.length) {
      const index = nextIndex++;
      const photo = photos[index];
      const blob = photo.originalBlob ?? (await options.getOriginal(photo));

      folder?.file(paths[index], blob);
      options.onProgress?.(++done);
    }
  });

  await Promise.all(workers);

  const content = await zip.generateAsync({ type: 'blob' });
  writeFile(content, options.zipName ?? 'images.zip');
};
