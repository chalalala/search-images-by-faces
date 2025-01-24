import { ChangeEvent, Dispatch, FC, SetStateAction, useEffect, useRef, useState, useTransition } from 'react';
import * as faceapi from 'face-api.js';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { FaceRecognitionResult } from '@/types/faceRecognition';
import { LoaderCircleIcon, UploadIcon, UserIcon } from 'lucide-react';
import { Button } from './ui/button';
import Image from 'next/image';
import { CameraInput } from './CameraInput';

const MODEL_URL = '/models';

interface Props {
  results: FaceRecognitionResult[] | null;
  setResults: Dispatch<SetStateAction<FaceRecognitionResult[] | null>>;
}

export const FaceRecognitionForm: FC<Props> = ({ results, setResults }) => {
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
  const [queryingImages, setQueryingImages] = useState<FaceRecognitionResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isUsingCamera, setIsUsingCamera] = useState(false);

  const isFirstLoad = useRef(true);
  const faceImageElementRef = useRef<HTMLImageElement>(null);

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

  const uploadPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    setIsLoading(true);
    setResults(null);

    const imgFiles = event.target.files || [];

    if (!imgFiles.length) {
      return;
    }

    const images = [];

    for (const imgFile of imgFiles) {
      const img = await faceapi.bufferToImage(imgFile);

      images.push({ file: imgFile, element: img });
    }

    setQueryingImages(images);
    setIsLoading(false);
  };

  const getFaceRecognition = () => {
    startTransition(async () => {
      for (const input of queryingImages) {
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

        if (!fullFaceDescriptions.length) {
          continue;
        }

        // Find photos with faces matching the uploaded face
        const faceMatcher = new faceapi.FaceMatcher(fullFaceDescriptions, Number(process.env.NEXT_PUBLIC_FACE_MATCHER_THRESHOLD ?? 0.5));

        if (!faceImageElementRef.current) {
          continue;
        }

        if (faceWithDescriptors) {
          const bestMatch = faceMatcher.findBestMatch(faceWithDescriptors.descriptor);

          if (bestMatch.label !== 'unknown') {
            setResults((results) => [...(results || []), input]);
          }
        }
      }

      if (!results) {
        setResults([]);
      }
    });
  };

  const updateFaceMatcher = async (faceImageUrl: string) => {
    // Reset results when a new face image is uploaded
    setResults(null);

    setIsLoading(true);
    setFaceImageUrl(faceImageUrl);

    const faceImageElement = document.createElement('img');
    faceImageElement.src = faceImageUrl;

    const faceResult = await faceapi.detectSingleFace(faceImageElement).withFaceLandmarks().withFaceDescriptor();

    setFaceWithDescriptors(faceResult);
    setIsLoading(false);
  };

  useEffect(() => {
    if (isFirstLoad.current) {
      loadFaceApi();
      isFirstLoad.current = false;
    }
  }, []);

  return (
    <form className='space-y-8' onSubmit={getFaceRecognition}>
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
        <span className='font-bold'>Upload photos you want to search for</span>
        <Input type='file' onChange={uploadPhotos} accept='.jpg, .jpeg, .png' multiple className='cursor-pointer' />
      </label>

      {!isPending && queryingImages.length && !results ? (
        <Button onClick={getFaceRecognition} className='mx-auto block'>
          Get matching photos
        </Button>
      ) : null}

      {isPending || isLoading ? <LoaderCircleIcon className='mx-auto block h-8 w-8 animate-spin' /> : null}
    </form>
  );
};
