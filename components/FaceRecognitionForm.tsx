import { ChangeEvent, Dispatch, FC, SetStateAction, useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { FaceRecognitionResult } from '@/types/faceRecognition';
import { LoaderCircleIcon, UploadIcon, UserIcon } from 'lucide-react';
import { Button } from './ui/button';
import Image from 'next/image';
import { CameraInput } from './CameraInput';
import { getDriveFolderId } from '@/utils/googleapis';
import { getDriveFileContent, getDriveFolderContent } from '@/utils/apis/googleapis';

const MODEL_URL = '/models';

interface Props {
  setResults: Dispatch<SetStateAction<FaceRecognitionResult[] | null>>;
}

export const FaceRecognitionForm: FC<Props> = ({ setResults }) => {
  const [faceImageUrl, setFaceImageUrl] = useState('');
  const [faceWithDescriptors, setFaceWithDescriptors] = useState<
    | faceapi.WithFaceDescriptor<
        faceapi.WithFaceLandmarks<
          {
            detection: faceapi.FaceDetection;
          },
          faceapi.FaceLandmarks68
        >
      >
    | undefined
  >();
  const [isLoading, setIsLoading] = useState(false);
  const [isUsingCamera, setIsUsingCamera] = useState(false);
  const [processedItems, setProcessedItems] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);

  const isFirstLoad = useRef(true);
  const faceImageElementRef = useRef<HTMLImageElement>(null);
  const driveFolderInputRef = useRef<HTMLInputElement>(null);

  const loadFaceApi = async () => {
    await faceapi.loadSsdMobilenetv1Model(MODEL_URL);
    await faceapi.loadFaceLandmarkModel(MODEL_URL);
    await faceapi.loadFaceRecognitionModel(MODEL_URL);
  };

  const uploadFaceImage = async (event: ChangeEvent<HTMLInputElement>) => {
    setIsLoading(true);

    const imgFile = event.target.files?.[0];

    if (!imgFile) {
      return;
    }

    // create an HTMLImageElement from a Blob
    const img = await faceapi.bufferToImage(imgFile);

    await updateFaceMatcher(img.src);
    setIsLoading(false);
  };

  const getFaceRecognition = async (input: FaceRecognitionResult & { element: HTMLImageElement }) => {
    if (!faceImageElementRef.current) {
      return;
    }

    try {
      // Detect faces in the uploaded photos
      const fullFaceDescriptions = await faceapi
        .detectAllFaces(
          input.element,
          new faceapi.SsdMobilenetv1Options({
            minConfidence: Number(process.env.NEXT_PUBLIC_MIN_CONFIDENCE ?? 0.3),
          })
        )
        .withFaceLandmarks()
        .withFaceDescriptors();

      setProcessedItems((prevCount) => prevCount + 1);

      if (!fullFaceDescriptions.length) {
        return;
      }

      // Find photos with faces matching the uploaded face
      const faceMatcher = new faceapi.FaceMatcher(fullFaceDescriptions, Number(process.env.NEXT_PUBLIC_FACE_MATCHER_THRESHOLD ?? 0.5));

      if (faceWithDescriptors) {
        const bestMatch = faceMatcher.findBestMatch(faceWithDescriptors.descriptor);

        if (bestMatch.label !== 'unknown') {
          setResults((results) => [...(results || []), { fileBlob: input.fileBlob, fileName: input.fileName, src: input.element.src }]);
        }
      }
    } catch (error) {
      console.error('Error processing image:', error);
    }
  };

  const resetResults = () => {
    setResults(null);
    setProcessedItems(0);
    setTotalFiles(0);
  };

  const updateFaceMatcher = async (faceImageUrl: string) => {
    // Reset results when a new face image is uploaded
    setIsLoading(true);
    setFaceImageUrl(faceImageUrl);
    resetResults();

    const faceImageElement = document.createElement('img');
    faceImageElement.src = faceImageUrl;

    const faceResult = await faceapi.detectSingleFace(faceImageElement).withFaceLandmarks().withFaceDescriptor();

    setFaceWithDescriptors(faceResult);
    setIsLoading(false);
  };

  const processFile = async (file: File & { mimeType: string; id: string }) => {
    try {
      const buffer = await getDriveFileContent(file.id);
      const imgFile = new Blob([buffer], { type: file.mimeType });
      const img = await faceapi.bufferToImage(imgFile);
      await getFaceRecognition({ fileBlob: imgFile, fileName: file.name, src: img.src, element: img });
    } finally {
      setProcessedItems((processedItems) => processedItems + 1);
    }
  };

  const getMatchingPhotos = async () => {
    setIsLoading(true);
    resetResults();

    const folderLink = driveFolderInputRef.current?.value;

    if (!folderLink) {
      return;
    }

    const folderId = getDriveFolderId(folderLink);

    if (!folderId) {
      return;
    }

    const data = await getDriveFolderContent(folderId);

    if (!data) {
      return;
    }

    for (const file of data.files) {
      try {
        if (!file.mimeType.startsWith('image/')) {
          // Skip non-image files
          continue;
        }

        setTotalFiles((totalFiles) => totalFiles + 1);
        processFile(file);
      } catch (e) {
        console.error('Error processing file:', file.name, e);

        // Skip this file if there's an error
        continue;
      }
    }

    setIsLoading(false);
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
                  <Input type='file' onChange={uploadFaceImage} accept='.jpg, .jpeg, .png' className='hidden' />
                </Label>
              </Button>

              <CameraInput isUsingCamera={isUsingCamera} setIsUsingCamera={setIsUsingCamera} setFaceImageUrl={updateFaceMatcher} />
            </div>

            {!isLoading && faceImageUrl && !faceWithDescriptors ? (
              <p className='text-sm text-red-700'>Cannot detect face in selected photo.</p>
            ) : null}
          </div>

          <div className='relative flex h-60 w-full items-center justify-center rounded bg-gray-300 sm:w-80'>
            {faceImageUrl ? (
              <Image ref={faceImageElementRef} objectFit='contain' src={faceImageUrl} className='w-full rounded' alt='face' fill />
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

      {processedItems < totalFiles ? (
        <div className='flex items-center justify-center gap-1'>
          <LoaderCircleIcon className='block h-8 w-8 animate-spin' />
          <span>
            Processed {processedItems} items / {totalFiles} items
          </span>
        </div>
      ) : null}
    </form>
  );
};
