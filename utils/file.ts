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

export const downloadAllImages = (results: FaceRecognitionResult[] | null) => {
  if (!results) {
    return;
  }

  const zip = new JSZip();
  const img = zip.folder('images');

  results.forEach((image) => {
    img?.file(image.fileName, image.fileBlob, {
      base64: true,
    });
  });

  zip.generateAsync({ type: 'blob' }).then(function (content) {
    writeFile(content, 'images.zip');
  });
};
