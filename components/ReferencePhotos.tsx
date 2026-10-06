'use client';

import { ChangeEvent, FC, useEffect, useRef, useState } from 'react';
import { LoaderCircleIcon, UploadIcon, UserIcon, XIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { CameraInput } from './CameraInput';
import { FaceBox, ReferencePhoto } from '@/types/faceRecognition';
import { detectFaces } from '@/utils/faceDetectionClient';
import { getLargestFaceIndex } from '@/utils/faceRecognition';
import { cn } from '@/lib/utils';

const FACE_CROP_SIZE = 96; // px
const FACE_CROP_MARGIN = 0.25; // Extra space around the face, as a share of its size

export interface ReferenceFacesState {
  descriptors: Float32Array[]; // The chosen face of every reference photo
  isDetecting: boolean;
}

interface Props {
  onChange: (state: ReferenceFacesState) => void;
}

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });

// Small square images of each face, so the user can tell the people apart
const cropFaces = async (url: string, boxes: FaceBox[]) => {
  const img = await loadImage(url);

  return boxes.map(({ x, y, width, height }) => {
    const size = Math.max(width, height) * (1 + FACE_CROP_MARGIN * 2);
    const canvas = document.createElement('canvas');
    canvas.width = FACE_CROP_SIZE;
    canvas.height = FACE_CROP_SIZE;
    canvas.getContext('2d')?.drawImage(img, x + width / 2 - size / 2, y + height / 2 - size / 2, size, size, 0, 0, FACE_CROP_SIZE, FACE_CROP_SIZE);

    return canvas.toDataURL('image/jpeg');
  });
};

export const ReferencePhotos: FC<Props> = ({ onChange }) => {
  const [photos, setPhotos] = useState<ReferencePhoto[]>([]);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const updatePhoto = (id: string, update: Partial<ReferencePhoto>) => {
    setPhotos((photos) => photos.map((photo) => (photo.id === id ? { ...photo, ...update } : photo)));
  };

  const addPhotos = (files: Blob[]) => {
    const newPhotos = files.map(
      (file): ReferencePhoto => ({
        id: crypto.randomUUID(),
        url: URL.createObjectURL(file),
        status: 'detecting',
        faces: [],
        faceCrops: [],
        selectedFaceIndex: -1,
      })
    );

    setPhotos((photos) => [...photos, ...newPhotos]);

    newPhotos.forEach(async (photo, index) => {
      try {
        const faces = await detectFaces(files[index]);
        const faceCrops =
          faces.length > 1
            ? await cropFaces(
                photo.url,
                faces.map(({ box }) => box)
              )
            : [];

        updatePhoto(photo.id, { status: 'ready', faces, faceCrops, selectedFaceIndex: getLargestFaceIndex(faces) });
      } catch (error) {
        console.error('Cannot detect faces in the reference photo:', error);
        updatePhoto(photo.id, { status: 'error' });
      }
    });
  };

  const uploadFiles = (event: ChangeEvent<HTMLInputElement>) => {
    addPhotos(Array.from(event.target.files || []));
    // Allow choosing the same file again
    event.target.value = '';
  };

  const removePhoto = (id: string) => {
    const photo = photos.find((photo) => photo.id === id);

    if (photo) {
      URL.revokeObjectURL(photo.url);
    }

    setPhotos((photos) => photos.filter((photo) => photo.id !== id));
  };

  useEffect(() => {
    onChangeRef.current({
      descriptors: photos.filter((photo) => photo.selectedFaceIndex >= 0).map((photo) => photo.faces[photo.selectedFaceIndex].descriptor),
      isDetecting: photos.some((photo) => photo.status === 'detecting'),
    });
  }, [photos]);

  // Free the photos when leaving the page
  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url)), []);

  return (
    <div className='space-y-2.5'>
      <div>
        <p className='font-bold'>Upload photos of the person</p>
        <p className='text-sm text-gray-600'>Add a few photos from different angles to find more matches.</p>
      </div>

      <div className='grid grid-cols-1 gap-2 sm:flex sm:flex-wrap'>
        <Button type='button' variant='outline'>
          <Label className='relative flex h-full w-full cursor-pointer items-center justify-center gap-2' title=''>
            <span>Upload photos</span>
            <UploadIcon />
            <Input type='file' onChange={uploadFiles} accept='image/jpeg, image/png, image/webp' multiple className='hidden' />
          </Label>
        </Button>

        <CameraInput onCapture={(photo) => addPhotos([photo])} />
      </div>

      {photos.length ? (
        <ul className='grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3'>
          {photos.map((photo) => (
            <li key={photo.id} className='space-y-2 rounded border p-2'>
              <div className='relative h-40 rounded bg-gray-100'>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt='Reference photo' className='h-full w-full rounded object-contain' />
                <Button
                  type='button'
                  variant='outline'
                  size='icon'
                  className='absolute right-1 top-1 h-7 w-7'
                  onClick={() => removePhoto(photo.id)}
                  aria-label='Remove photo'>
                  <XIcon />
                </Button>
              </div>

              {photo.status === 'detecting' ? (
                <p className='flex items-center gap-1 text-sm text-gray-600'>
                  <LoaderCircleIcon className='h-4 w-4 animate-spin' /> Finding faces...
                </p>
              ) : null}

              {photo.status === 'error' ? <p className='text-sm text-red-700'>Cannot read this photo.</p> : null}

              {photo.status === 'ready' && !photo.faces.length ? <p className='text-sm text-red-700'>No face found in this photo.</p> : null}

              {photo.faces.length > 1 ? (
                <div className='space-y-1'>
                  <p className='text-sm text-gray-600'>{photo.faces.length} faces found. Pick the person to search for:</p>
                  <div className='flex flex-wrap gap-1'>
                    {photo.faceCrops.map((crop, index) => (
                      <button
                        key={index}
                        type='button'
                        onClick={() => updatePhoto(photo.id, { selectedFaceIndex: index })}
                        aria-pressed={photo.selectedFaceIndex === index}
                        aria-label={`Face ${index + 1}`}
                        className={cn(
                          'h-12 w-12 overflow-hidden rounded-full border-2',
                          photo.selectedFaceIndex === index
                            ? 'border-blue-600 ring-2 ring-blue-300'
                            : 'border-transparent opacity-60 hover:opacity-100'
                        )}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={crop} alt='' className='h-full w-full object-cover' />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className='flex h-40 w-full items-center justify-center rounded bg-gray-300 sm:w-80'>
          <UserIcon className='h-20 w-20 text-gray-500' />
        </div>
      )}
    </div>
  );
};
