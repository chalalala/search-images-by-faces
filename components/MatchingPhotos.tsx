import { FaceRecognitionResult } from '@/types/faceRecognition';
import { FC } from 'react';
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
        <p className='text-left font-bold'>Matching photos</p>

        <Button variant='link' onClick={downloadAll}>
          Download All
        </Button>
      </div>

      <div className='flex flex-wrap gap-4'>
        {photos.map((img) => (
          <picture key={img.src} className='h-40 flex-auto'>
            <img src={img.src} alt='Image' className='h-full w-full rounded bg-gray-100 object-contain' />
          </picture>
        ))}
      </div>
    </div>
  );
};
