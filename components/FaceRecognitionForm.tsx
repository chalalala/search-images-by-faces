'use client';

import { ChangeEvent, FC, useEffect, useOptimistic, useRef, useState, useTransition } from 'react';
import * as faceapi from 'face-api.js';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { FaceRecognitionResult, FaceWithDescriptor } from '@/types/faceRecognition';
import { LoaderCircleIcon, UploadIcon, UserIcon } from 'lucide-react';
import { Button } from './ui/button';
import Image from 'next/image';
import { CameraInput } from './CameraInput';
import { getFilesByFolderLink } from '@/utils/googleapis';
import { getDriveFileContent } from '@/utils/apis/googleapis';
import { getBestMatchFace } from '@/utils/faceRecognition';
import { MatchingPhotos } from './MatchingPhotos';
import { FileListResponse } from '@/types/googleApi';

const MODEL_URL = '/models';

const LIMIT_FILE_PER_REQUEST = 10; // Number of files to process per request
const MIN_TIME_BETWEEN_REQUESTS_MS = 1000; // Minimum time between requests in milliseconds

export const FaceRecognitionForm: FC = () => {
  const [isPending, startTransition] = useTransition();

  const [faceImageUrl, setFaceImageUrl] = useState('');
  const [optimisticFaceImageUrl, setOptimisticFaceImageUrl] = useOptimistic(faceImageUrl);

  const [faceWithDescriptors, setFaceWithDescriptors] = useState<FaceWithDescriptor | undefined>();
  const [isUsingCamera, setIsUsingCamera] = useState(false);

  const [results, setResults] = useState<FaceRecognitionResult[] | null>(null);

  const isFirstLoad = useRef(true);
  const faceImageElementRef = useRef<HTMLImageElement>(null);
  const driveFolderInputRef = useRef<HTMLInputElement>(null);

  const resetResults = () => {
    setResults(null);
  };

  const loadFaceApi = async () => {
    await faceapi.loadSsdMobilenetv1Model(MODEL_URL);
    await faceapi.loadFaceLandmarkModel(MODEL_URL);
    await faceapi.loadFaceRecognitionModel(MODEL_URL);
  };

  const uploadFaceFile = (event: ChangeEvent<HTMLInputElement>) => {
    const imgFile = event.target.files?.[0];

    if (!imgFile) {
      return;
    }

    // Optimistic show the uploaded image file
    const faceImageUrl = URL.createObjectURL(imgFile);
    updateFaceMatcher(faceImageUrl);
  };

  const updateFaceMatcher = (faceImageUrl: string) => {
    // Reset results when a new face image is uploaded
    resetResults();

    startTransition(async () => {
      try {
        setOptimisticFaceImageUrl(faceImageUrl);

        // Detect the face with landmarks and face descriptor from the uploaded image
        const faceImageElement = document.createElement('img');
        faceImageElement.src = faceImageUrl;
        const faceResult = await faceapi.detectSingleFace(faceImageElement).withFaceLandmarks().withFaceDescriptor();

        startTransition(() => {
          setFaceImageUrl(faceImageUrl);
          setFaceWithDescriptors(faceResult);
        });
      } catch (error) {
        console.error('Error updating face matcher:', error);
        setFaceWithDescriptors(undefined);
        setFaceImageUrl('');
      }
    });
  };

  const checkIsPhotoMatching = (file: FileListResponse) => {
    if (!faceWithDescriptors) {
      return;
    }

    startTransition(async () => {
      try {
        const buffer = await getDriveFileContent(file.id);
        const imgFile = new Blob([buffer], { type: file.mimeType });
        const img = await faceapi.bufferToImage(imgFile);

        const bestMatch = await getBestMatchFace(img, faceWithDescriptors);

        if (bestMatch) {
          const newResult = { fileBlob: imgFile, fileName: file.name, src: img.src };
          setResults((results) => [...(results || []), newResult]);
        }
      } catch (e) {
        console.error('Error processing file:', file.name, e);
      }
    });
  };

  const getMatchingPhotos = () => {
    resetResults();

    const folderLink = driveFolderInputRef.current?.value;

    if (!folderLink || !faceWithDescriptors) {
      return;
    }

    startTransition(async () => {
      try {
        const files = await getFilesByFolderLink(folderLink);

        if (!files || !files.length) {
          return;
        }

        const imageFiles = files.filter((file) => file.mimeType.startsWith('image/'));
        const noChunks = Math.ceil(files.length / LIMIT_FILE_PER_REQUEST);

        for (let i = 0; i < noChunks; i++) {
          const chunk = imageFiles.slice(i * LIMIT_FILE_PER_REQUEST, (i + 1) * LIMIT_FILE_PER_REQUEST);
          await Promise.all(chunk.map((file) => checkIsPhotoMatching(file)));

          if (i < noChunks - 1) {
            await new Promise((resolve) => setTimeout(resolve, MIN_TIME_BETWEEN_REQUESTS_MS));
          }
        }
      } catch (err) {
        console.error(err);
      }
    });
  };

  useEffect(() => {
    if (isFirstLoad.current) {
      loadFaceApi();
      isFirstLoad.current = false;
    }
  }, []);

  return (
    <form className='space-y-8' action={getMatchingPhotos}>
      <div className='space-y-2.5'>
        <p className='font-bold'>Upload a photo of your face</p>
        <div className='flex flex-wrap justify-between gap-4'>
          <div className='flex-1 space-y-2.5'>
            <div className='grid grid-cols-1 gap-2 sm:flex sm:flex-wrap'>
              <Button type='button' variant='outline'>
                <Label className='relative flex h-full w-full cursor-pointer items-center justify-center gap-2' title=''>
                  <span>Upload photo</span>
                  <UploadIcon />
                  <Input type='file' onChange={uploadFaceFile} accept='.jpg, .jpeg, .png' className='hidden' />
                </Label>
              </Button>

              <CameraInput isUsingCamera={isUsingCamera} setIsUsingCamera={setIsUsingCamera} setFaceImageUrl={updateFaceMatcher} />
            </div>

            {!isPending && faceImageUrl && !faceWithDescriptors ? (
              <p className='text-sm text-red-700'>Cannot detect face in selected photo.</p>
            ) : null}
          </div>

          <div className='relative flex h-60 w-full items-center justify-center rounded bg-gray-300 sm:w-80'>
            {optimisticFaceImageUrl ? (
              <Image ref={faceImageElementRef} src={optimisticFaceImageUrl} className='w-full rounded object-contain' alt='face' fill />
            ) : (
              <UserIcon className='h-20 w-20 text-gray-500' />
            )}
          </div>
        </div>
      </div>

      <label className='block space-y-2.5'>
        <span className='font-bold'>Public link of Google Drive Folder</span>
        <Input ref={driveFolderInputRef} type='text' placeholder='https://drive.google.com/drive/u/0/folders/XXX' />
      </label>

      <Button>Get matching photos</Button>

      {isPending ? (
        <div className='flex items-center justify-center gap-1'>
          <LoaderCircleIcon className='block h-8 w-8 animate-spin' />
        </div>
      ) : null}

      <MatchingPhotos photos={results} isLoading={isPending} />
    </form>
  );
};
