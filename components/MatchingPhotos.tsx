import { FaceRecognitionResult } from '@/types/faceRecognition';
import { FC } from 'react';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { downloadAllImages } from '@/utils/file';

interface Props {
  photos: FaceRecognitionResult[] | null;
}

export const MatchingPhotos: FC<Props> = ({ photos }) => {
  if (!photos) {
    return null;
  }

  if (!photos.length) {
    return <p className='text-center'>No matching photos.</p>;
  }

  const downloadAll = () => {
    downloadAllImages(photos);
  };

  return (
    <div>
      <div className='flex items-center justify-between gap-4'>
        <Label asChild>
          <p className='text-left font-bold'>Matching photos</p>
        </Label>

        <Button variant='link' onClick={downloadAll}>
          Download All
        </Button>
      </div>

      <div className='flex flex-wrap gap-4'>
        {photos.map((img) => (
          <picture key={img.file.name} className='h-40 flex-auto'>
            <img src={img.element.src} alt={img.file.name} className='h-full w-full rounded bg-gray-100 object-contain' />
          </picture>
        ))}
      </div>
    </div>
  );
};
