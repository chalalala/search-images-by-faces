import { ChangeEvent, Dispatch, FC, SetStateAction, useEffect, useRef, useState, useTransition } from 'react';
import * as faceapi from 'face-api.js';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { FaceRecognitionResult } from '@/types/faceRecognition';
import { LoaderCircleIcon, UserIcon } from 'lucide-react';
import { Button } from './ui/button';
import Image from 'next/image';

const MODEL_URL = '/models';

interface Props {
  results: FaceRecognitionResult[] | null;
  setResults: Dispatch<SetStateAction<FaceRecognitionResult[] | null>>;
}

export const FaceRecognitionForm: FC<Props> = ({ results, setResults }) => {
  const [faceImageUrl, setFaceImageUrl] = useState('');
  const [queryingImages, setQueryingImages] = useState<FaceRecognitionResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isFirstLoad = useRef(true);
  const faceImageElementRef = useRef<HTMLImageElement>(null);

  const loadFaceApi = async () => {
    await faceapi.loadSsdMobilenetv1Model(MODEL_URL);
    await faceapi.loadFaceLandmarkModel(MODEL_URL);
    await faceapi.loadFaceRecognitionModel(MODEL_URL);
  };

  async function uploadFaceImage(event: ChangeEvent<HTMLInputElement>) {
    setIsLoading(true);
    setResults(null);

    const imgFile = event.target.files?.[0];

    if (!imgFile) {
      return;
    }

    // create an HTMLImageElement from a Blob
    const img = await faceapi.bufferToImage(imgFile);

    setFaceImageUrl(img.src);
    setIsLoading(false);
  }

  async function uploadPhotos(event: ChangeEvent<HTMLInputElement>) {
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
  }

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

        const singleResult = await faceapi.detectSingleFace(faceImageElementRef.current).withFaceLandmarks().withFaceDescriptor();

        if (singleResult) {
          const bestMatch = faceMatcher.findBestMatch(singleResult.descriptor);

          if (bestMatch.label !== 'unknown') {
            setResults((results) => [...(results || []), input]);
          }
        }
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
    <form className='space-y-8' onSubmit={getFaceRecognition}>
      <Label className='flex w-full justify-center gap-5'>
        <div className='flex-1 space-y-2.5 text-left'>
          <span className='font-bold'>Upload a photo of your face</span>
          <Input type='file' onChange={uploadFaceImage} accept='.jpg, .jpeg, .png' className='cursor-pointer' />
        </div>

        {faceImageUrl ? (
          <Image
            ref={faceImageElementRef}
            width={160}
            height={160}
            objectFit='contain'
            src={faceImageUrl}
            className='cursor-pointer rounded'
            alt='face'
          />
        ) : (
          <div className='flex h-40 w-40 cursor-pointer items-center justify-center rounded bg-gray-300'>
            <UserIcon className='h-20 w-20 text-gray-500' />
          </div>
        )}
      </Label>

      <Label className='block w-full space-y-2.5 text-left'>
        <span className='font-bold'>Upload photos you want to search for</span>
        <Input type='file' onChange={uploadPhotos} accept='.jpg, .jpeg, .png' multiple className='cursor-pointer' />
      </Label>

      {!isPending && queryingImages.length && !results ? (
        <Button onClick={getFaceRecognition} className='mx-auto block'>
          Get matching photos
        </Button>
      ) : null}

      {isPending || isLoading ? <LoaderCircleIcon className='mx-auto block h-8 w-8 animate-spin' /> : null}
    </form>
  );
};
