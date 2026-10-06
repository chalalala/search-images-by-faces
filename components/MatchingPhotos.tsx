import { FaceRecognitionResult } from '@/types/faceRecognition';
import { FC, useState } from 'react';
import { CheckIcon, DownloadIcon, ExternalLinkIcon, LoaderCircleIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import { downloadPhotosAsZip, writeFile } from '@/utils/file';
import { DriveRequestError } from '@/utils/apis/googleapis';
import { cn } from '@/lib/utils';

interface Props {
  photos: FaceRecognitionResult[] | null;
  isLoading: boolean;
  getOriginal: (photo: FaceRecognitionResult) => Promise<Blob>; // Downloads the full size photo from Drive
}

const getDriveFileUrl = (fileId: string) => `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;

export const MatchingPhotos: FC<Props> = ({ photos, isLoading, getOriginal }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number } | null>(null);
  const [downloadError, setDownloadError] = useState('');

  if (photos === null || (isLoading && !photos.length)) {
    return null;
  }

  if (!photos.length) {
    return <p className='text-center'>No matching photos.</p>;
  }

  const selectedPhotos = photos.filter((photo) => selectedIds.has(photo.fileId));
  const previewPhoto = previewIndex === null ? undefined : photos[previewIndex];
  const isDownloading = downloadProgress !== null;

  const toggleSelected = (fileId: string) => {
    setSelectedIds((selectedIds) => {
      const newSelectedIds = new Set(selectedIds);

      if (!newSelectedIds.delete(fileId)) {
        newSelectedIds.add(fileId);
      }

      return newSelectedIds;
    });
  };

  const download = async (photosToDownload: FaceRecognitionResult[]) => {
    setDownloadError('');
    setDownloadProgress({ done: 0, total: photosToDownload.length });

    try {
      await downloadPhotosAsZip(photosToDownload, {
        getOriginal,
        onProgress: (done) => setDownloadProgress({ done, total: photosToDownload.length }),
      });
    } catch (error) {
      console.error('Cannot download the photos:', error);
      setDownloadError(error instanceof DriveRequestError ? error.message : 'Cannot download the photos. Please try again.');
    } finally {
      setDownloadProgress(null);
    }
  };

  const downloadOne = async (photo: FaceRecognitionResult) => {
    setDownloadError('');

    try {
      writeFile(photo.originalBlob ?? (await getOriginal(photo)), photo.fileName);
    } catch (error) {
      console.error('Cannot download the photo:', error);
      setDownloadError('Cannot download this photo. Please try again.');
    }
  };

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-left font-bold'>Matching photos</p>

        <div className='flex flex-wrap items-center gap-1'>
          {selectedPhotos.length ? (
            <>
              <Button type='button' variant='link' onClick={() => setSelectedIds(new Set())} disabled={isDownloading}>
                Clear selection
              </Button>
              <Button type='button' variant='outline' onClick={() => download(selectedPhotos)} disabled={isDownloading}>
                Download selected ({selectedPhotos.length})
              </Button>
            </>
          ) : (
            <Button
              type='button'
              variant='link'
              onClick={() => setSelectedIds(new Set(photos.map((photo) => photo.fileId)))}
              disabled={isDownloading}>
              Select all
            </Button>
          )}

          <Button type='button' variant='outline' onClick={() => download(photos)} disabled={isDownloading}>
            Download all
          </Button>
        </div>
      </div>

      {downloadProgress ? (
        <p className='flex items-center gap-1 text-sm text-gray-600'>
          <LoaderCircleIcon className='h-4 w-4 animate-spin' />
          Preparing download: {downloadProgress.done} of {downloadProgress.total} photos
        </p>
      ) : null}

      {downloadError ? <p className='text-sm text-red-700'>{downloadError}</p> : null}

      <ul className='grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4'>
        {photos.map((photo, index) => {
          const isSelected = selectedIds.has(photo.fileId);

          return (
            <li key={photo.fileId} className='group relative'>
              <button
                type='button'
                onClick={() => setPreviewIndex(index)}
                className={cn('block h-40 w-full rounded bg-gray-100', isSelected && 'ring-2 ring-blue-600 ring-offset-2')}
                aria-label={`Preview ${photo.fileName}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.previewUrl} alt={photo.fileName} className='h-full w-full rounded object-contain' />
              </button>

              <button
                type='button'
                onClick={() => toggleSelected(photo.fileId)}
                aria-pressed={isSelected}
                aria-label={isSelected ? `Unselect ${photo.fileName}` : `Select ${photo.fileName}`}
                className={cn(
                  'absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white shadow',
                  isSelected ? 'bg-blue-600 text-white' : 'bg-black/30 text-transparent hover:bg-black/50'
                )}>
                <CheckIcon className='h-4 w-4' />
              </button>

              <p className='mt-1 truncate text-xs text-gray-600' title={photo.folderPath ? `${photo.folderPath}/${photo.fileName}` : photo.fileName}>
                {photo.folderPath ? `${photo.folderPath}/` : ''}
                {photo.fileName}
              </p>
            </li>
          );
        })}
      </ul>

      <Dialog open={!!previewPhoto} onOpenChange={(open) => !open && setPreviewIndex(null)}>
        {previewPhoto ? (
          <DialogContent className='max-w-4xl' aria-describedby={undefined}>
            <DialogTitle className='truncate pr-6 font-semibold'>
              {previewPhoto.folderPath ? `${previewPhoto.folderPath}/` : ''}
              {previewPhoto.fileName}
            </DialogTitle>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewPhoto.previewUrl} alt={previewPhoto.fileName} className='max-h-[70vh] w-full rounded bg-gray-100 object-contain' />

            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='flex gap-1'>
                <Button type='button' variant='outline' onClick={() => setPreviewIndex(previewIndex! - 1)} disabled={previewIndex === 0}>
                  Previous
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setPreviewIndex(previewIndex! + 1)}
                  disabled={previewIndex === photos.length - 1}>
                  Next
                </Button>
              </div>

              <div className='flex flex-wrap gap-1'>
                <Button type='button' variant='outline' onClick={() => toggleSelected(previewPhoto.fileId)}>
                  {selectedIds.has(previewPhoto.fileId) ? 'Unselect' : 'Select'}
                </Button>
                <Button type='button' variant='outline' onClick={() => downloadOne(previewPhoto)}>
                  Download <DownloadIcon />
                </Button>
                <Button asChild variant='outline'>
                  <a href={getDriveFileUrl(previewPhoto.fileId)} target='_blank' rel='noopener noreferrer'>
                    Open in Google Drive <ExternalLinkIcon />
                  </a>
                </Button>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
};
