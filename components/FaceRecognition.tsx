'use client';

import { FC, useState } from 'react';
import { FaceRecognitionResult } from '@/types/faceRecognition';
import { MatchingPhotos } from './MatchingPhotos';
import { FaceRecognitionForm } from './FaceRecognitionForm';

export const FaceRecognition: FC = () => {
  const [results, setResults] = useState<FaceRecognitionResult[] | null>(null);

  return (
    <div className='mx-auto w-full max-w-4xl space-y-5 px-5 py-10'>
      <h1 className='mb-12 text-3xl font-semibold'>Search photos by face</h1>

      <FaceRecognitionForm setResults={setResults} />

      <MatchingPhotos photos={results} />
    </div>
  );
};
