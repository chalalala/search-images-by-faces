import { FC, useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogTrigger } from './ui/dialog';
import { DialogTitle } from '@radix-ui/react-dialog';
import { CameraIcon } from 'lucide-react';

interface Props {
  onCapture: (photo: Blob) => void;
}

export const CameraInput: FC<Props> = ({ onCapture }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  // The camera is on exactly while the dialog is open, however the dialog gets closed
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let stream: MediaStream | undefined;
    let isClosed = false;
    setErrorMsg('');

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((newStream) => {
        stream = newStream;

        // The dialog was closed before the camera started
        if (isClosed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      })
      .catch((err) => {
        console.error('Cannot start the camera:', err);
        setErrorMsg('Cannot use the camera. Please allow camera access and try again.');
      });

    return () => {
      isClosed = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [isOpen]);

  const takePhoto = () => {
    const video = videoRef.current;

    if (!video?.videoWidth) {
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);

    canvas.toBlob((photo) => {
      if (photo) {
        onCapture(photo);
        setIsOpen(false);
      }
    }, 'image/png');
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button type='button' variant='outline'>
          <span>Use photo from camera</span>
          <CameraIcon />
        </Button>
      </DialogTrigger>

      <DialogContent aria-describedby={undefined}>
        <DialogTitle>Use photo from camera</DialogTitle>

        {errorMsg ? (
          <p className='text-sm text-red-700'>{errorMsg}</p>
        ) : (
          <video ref={videoRef} className='w-full' playsInline muted>
            Video stream not available.
          </video>
        )}

        <Button type='button' onClick={takePhoto} disabled={!!errorMsg}>
          Take photo
        </Button>
      </DialogContent>
    </Dialog>
  );
};
