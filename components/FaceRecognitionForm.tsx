'use client';

import { FC, FormEvent, useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Input } from './ui/input';
import { FaceRecognitionResult } from '@/types/faceRecognition';
import { LoaderCircleIcon } from 'lucide-react';
import { Button } from './ui/button';
import { getDriveFolderId } from '@/utils/googleapis';
import { DriveRequestError, getDriveFileContent, getDriveFolderContent, getDriveThumbnail } from '@/utils/apis/googleapis';
import { getBestMatchDistance, getMatchThreshold } from '@/utils/faceRecognition';
import { detectFaces, loadFaceModels } from '@/utils/faceDetectionClient';
import { scanDriveFolder, ScanProgress } from '@/utils/scanDriveFolder';
import { MatchingPhotos } from './MatchingPhotos';
import { ReferenceFacesState, ReferencePhotos } from './ReferencePhotos';
import { FileListResponseSingleFile } from '@/types/googleApi';

const LIMIT_FILE_PER_REQUEST = 100; // Number of files listed per request
const CONCURRENT_DOWNLOADS = 4; // Number of photos downloaded and checked at the same time

const getOriginal = async (photo: Pick<FaceRecognitionResult, 'fileId' | 'mimeType'>, signal?: AbortSignal) =>
  new Blob([await getDriveFileContent(photo.fileId, { signal })], { type: photo.mimeType });

export const FaceRecognitionForm: FC = () => {
  const [isPending, startTransition] = useTransition();

  const [reference, setReference] = useState<ReferenceFacesState>({ descriptors: [], isDetecting: false });
  const [modelsError, setModelsError] = useState('');

  const [results, setResults] = useState<FaceRecognitionResult[] | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanId, setScanId] = useState(0);

  const driveFolderInputRef = useRef<HTMLInputElement>(null);
  const includeSubfoldersInputRef = useRef<HTMLInputElement>(null);
  const scanAbortControllerRef = useRef<AbortController | null>(null);
  const previewUrlsRef = useRef<string[]>([]); // Object URLs of the results, freed when the results are cleared

  const stopScan = () => {
    scanAbortControllerRef.current?.abort();
  };

  const resetResults = useCallback(() => {
    // Cancel any ongoing scan so its late results don't mix with the new ones
    scanAbortControllerRef.current?.abort();
    scanAbortControllerRef.current = null;
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];
    setIsScanning(false);
    setResults(null);
    setErrorMsg('');
    setProgress(null);
    setScanId((scanId) => scanId + 1);
  }, []);

  const updateReference = useCallback(
    (newReference: ReferenceFacesState) => {
      // Results were found with the previous faces
      resetResults();
      setReference(newReference);
    },
    [resetResults]
  );

  const checkIsPhotoMatching = async (file: FileListResponseSingleFile, folderPath: string, descriptors: Float32Array[], signal: AbortSignal) => {
    if (signal.aborted) {
      return;
    }

    // Check faces on a thumbnail when there is one: it's smaller and doesn't use the Drive API quota
    let thumbnail: Blob | undefined;

    if (file.thumbnailLink) {
      try {
        thumbnail = await getDriveThumbnail(file.thumbnailLink, { signal });
      } catch (error) {
        if (signal.aborted || (error instanceof DriveRequestError && error.status === 429)) {
          throw error;
        }

        console.warn(`Cannot load the thumbnail of ${file.name}, downloading the original instead:`, error);
      }
    }

    const image = thumbnail ?? (await getOriginal({ fileId: file.id, mimeType: file.mimeType }, signal));
    const faces = await detectFaces(image);
    const distance = getBestMatchDistance(faces, descriptors, getMatchThreshold());

    if (distance === undefined || signal.aborted) {
      return;
    }

    // The full size photo is only downloaded when the user downloads it
    const previewUrl = URL.createObjectURL(image);
    previewUrlsRef.current.push(previewUrl);

    const newResult: FaceRecognitionResult = {
      fileId: file.id,
      fileName: file.name,
      folderPath,
      mimeType: file.mimeType,
      previewUrl,
      originalBlob: thumbnail ? undefined : image,
    };
    setResults((results) => [...(results || []), newResult]);
  };

  const getMatchingPhotos = (event: FormEvent<HTMLFormElement>) => {
    // Not a form action: React holds back every update made in an action until it ends, so "Stop" would never show
    event.preventDefault();
    resetResults();

    if (reference.isDetecting) {
      setErrorMsg('Still looking for faces in your photos. Please wait a moment.');
      return;
    }

    if (!reference.descriptors.length) {
      setErrorMsg('Please upload a photo with a face first.');
      return;
    }

    const folderId = getDriveFolderId(driveFolderInputRef.current?.value || '');

    if (!folderId) {
      setErrorMsg('Please enter a valid Google Drive folder link.');
      return;
    }

    const includeSubfolders = !!includeSubfoldersInputRef.current?.checked;
    const { descriptors } = reference;
    const controller = new AbortController();
    const { signal } = controller;
    scanAbortControllerRef.current = controller;
    setIsScanning(true);
    setProgress({ scanned: 0, failed: 0 });

    startTransition(async () => {
      try {
        const { scanned } = await scanDriveFolder({
          folderId,
          includeSubfolders,
          listPage: (folderId, pageToken) =>
            getDriveFolderContent(folderId, { pageSize: LIMIT_FILE_PER_REQUEST, pageToken, includeFolders: includeSubfolders, signal }),
          processFile: (file, folderPath) => checkIsPhotoMatching(file, folderPath, descriptors, signal),
          concurrency: CONCURRENT_DOWNLOADS,
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
    // Start downloading the face models right away, so the first photo doesn't wait for them
    loadFaceModels().catch((error) => {
      console.error('Cannot load the face recognition models:', error);
      setModelsError('Cannot load face recognition. Please check your connection and reload the page.');
    });

    const previewUrls = previewUrlsRef;

    // Stop an ongoing scan and free the results when leaving the page
    return () => {
      scanAbortControllerRef.current?.abort();
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  return (
    <form className='space-y-8' onSubmit={getMatchingPhotos}>
      {modelsError ? <p className='text-sm text-red-700'>{modelsError}</p> : null}

      <ReferencePhotos onChange={updateReference} />

      <div className='space-y-2.5'>
        <label className='block space-y-2.5'>
          <span className='font-bold'>Public link of Google Drive Folder</span>
          <Input ref={driveFolderInputRef} type='text' placeholder='https://drive.google.com/drive/u/0/folders/XXX' />
        </label>

        <label className='flex w-fit cursor-pointer items-center gap-2 text-sm'>
          <input ref={includeSubfoldersInputRef} type='checkbox' className='h-4 w-4' />
          Include subfolders
        </label>
      </div>

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
          {isScanning && progress.retryInMs ? ` Google Drive is limiting requests, continuing in ${Math.ceil(progress.retryInMs / 1000)}s.` : ''}
        </p>
      ) : null}

      {isPending ? (
        <div className='flex items-center justify-center gap-1'>
          <LoaderCircleIcon className='block h-8 w-8 animate-spin' />
        </div>
      ) : null}

      <MatchingPhotos key={scanId} photos={results} isLoading={isPending} getOriginal={(photo) => getOriginal(photo)} />
    </form>
  );
};
