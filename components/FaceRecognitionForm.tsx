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
import { getDriveFolderId } from '@/utils/googleapis';
import { DriveRequestError, getDriveFileContent, getDriveFolderContent } from '@/utils/apis/googleapis';
import { getBestMatchFace } from '@/utils/faceRecognition';
import { scanDriveFolder, ScanProgress } from '@/utils/scanDriveFolder';
import { MatchingPhotos } from './MatchingPhotos';
import { FileListResponseSingleFile } from '@/types/googleApi';

const MODEL_URL = '/models';

const LIMIT_FILE_PER_REQUEST = 10; // Number of files to process per request
const MIN_TIME_BETWEEN_REQUESTS_MS = 10000; // Minimum time between requests in milliseconds

export const FaceRecognitionForm: FC = () => {
  const [isPending, startTransition] = useTransition();

  const [faceImageUrl, setFaceImageUrl] = useState('');
  const [optimisticFaceImageUrl, setOptimisticFaceImageUrl] = useOptimistic(faceImageUrl);

  const [faceWithDescriptors, setFaceWithDescriptors] = useState<FaceWithDescriptor | undefined>();
  const [isUsingCamera, setIsUsingCamera] = useState(false);

  const [results, setResults] = useState<FaceRecognitionResult[] | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const isFirstLoad = useRef(true);
  const faceImageElementRef = useRef<HTMLImageElement>(null);
  const driveFolderInputRef = useRef<HTMLInputElement>(null);
  const scanAbortControllerRef = useRef<AbortController | null>(null);

  const stopScan = () => {
    scanAbortControllerRef.current?.abort();
  };

  const resetResults = () => {
    // Cancel any ongoing scan so its late results don't mix with the new ones
    stopScan();
    scanAbortControllerRef.current = null;
    setIsScanning(false);
    setResults(null);
    setErrorMsg('');
    setProgress(null);
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

  const checkIsPhotoMatching = async (file: FileListResponseSingleFile, signal: AbortSignal) => {
    if (!faceWithDescriptors || signal.aborted) {
      return;
    }

    const buffer = await getDriveFileContent(file.id, { signal });
    const imgFile = new Blob([buffer], { type: file.mimeType });
    const img = await faceapi.bufferToImage(imgFile);

    const bestMatch = await getBestMatchFace(img, faceWithDescriptors);

    if (bestMatch && !signal.aborted) {
      const newResult = { fileBlob: imgFile, fileName: file.name, src: img.src };
      setResults((results) => [...(results || []), newResult]);
    }
  };

  const getMatchingPhotos = () => {
    resetResults();

    if (!faceWithDescriptors) {
      setErrorMsg('Please upload a photo with a face first.');
      return;
    }

    const folderId = getDriveFolderId(driveFolderInputRef.current?.value || '');

    if (!folderId) {
      setErrorMsg('Please enter a valid Google Drive folder link.');
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;
    scanAbortControllerRef.current = controller;
    setIsScanning(true);
    setProgress({ scanned: 0, failed: 0 });

    startTransition(async () => {
      try {
        const { scanned } = await scanDriveFolder({
          listPage: (pageToken) => getDriveFolderContent(folderId, { pageSize: LIMIT_FILE_PER_REQUEST, pageToken, signal }),
          processFile: (file) => checkIsPhotoMatching(file, signal),
          minTimeBetweenRequestsMs: MIN_TIME_BETWEEN_REQUESTS_MS,
          signal,
          onProgress: (progress) => {
            if (!signal.aborted) {
              setProgress(progress);
            }
          },
        });

        // A newer face or scan replaced this one
        if (scanAbortControllerRef.current !== controller) {
          return;
        }

        if (!scanned && !signal.aborted) {
          setErrorMsg('No photos found in this folder. Make sure the link is correct and the folder is shared publicly.');
          return;
        }

        // Show "No matching photos" instead of nothing when the scan finished without a match
        setResults((results) => results ?? []);
      } catch (err) {
        if (signal.aborted) {
          // Stopped by the user: keep what was found so far
          if (scanAbortControllerRef.current === controller) {
            setResults((results) => results ?? []);
          }
          return;
        }

        console.error(err);
        setErrorMsg(err instanceof DriveRequestError ? err.message : 'Some errors occur. Please try again.');
      } finally {
        if (scanAbortControllerRef.current === controller) {
          scanAbortControllerRef.current = null;
          setIsScanning(false);
        }
      }
    });
  };

  useEffect(() => {
    if (isFirstLoad.current) {
      loadFaceApi();
      isFirstLoad.current = false;
    }

    // Stop an ongoing scan when leaving the page
    return () => scanAbortControllerRef.current?.abort();
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

      <div className='flex flex-wrap gap-2'>
        <Button disabled={isScanning}>Get matching photos</Button>

        {isScanning ? (
          <Button type='button' variant='outline' onClick={stopScan}>
            Stop
          </Button>
        ) : null}
      </div>

      {errorMsg ? <p className='text-sm text-red-700'>{errorMsg}</p> : null}

      {progress ? (
        <p className='text-sm text-gray-600'>
          {isScanning ? 'Scanning... ' : ''}
          Checked {progress.scanned} {progress.scanned === 1 ? 'photo' : 'photos'}, found {results?.length ?? 0}{' '}
          {results?.length === 1 ? 'match' : 'matches'}
          {progress.failed ? `, ${progress.failed} could not be read` : ''}.
        </p>
      ) : null}

      {isPending ? (
        <div className='flex items-center justify-center gap-1'>
          <LoaderCircleIcon className='block h-8 w-8 animate-spin' />
        </div>
      ) : null}

      <MatchingPhotos photos={results} isLoading={isPending} />
    </form>
  );
};
