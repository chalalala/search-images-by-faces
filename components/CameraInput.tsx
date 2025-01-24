import { FC, useCallback, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogTrigger } from './ui/dialog';
import { DialogTitle } from '@radix-ui/react-dialog';
import { CameraIcon } from 'lucide-react';

interface Props {
  isUsingCamera: boolean;
  setFaceImageUrl: (url: string) => void;
  setIsUsingCamera: (isUsingCamera: boolean) => void;
}

const WIDTH = 320; // We will scale the photo width to this

export const CameraInput: FC<Props> = ({ isUsingCamera, setFaceImageUrl, setIsUsingCamera }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isStartedCamera = useRef(false);

  // Computed based on the input stream
  const height = useRef(0);

  // Indicates whether or not we're currently streaming
  // video from the camera. Obviously, we start at false.
  const streaming = useRef(false);

  const startCamera = () => {
    const video = videoRef.current;

    if (!(video instanceof HTMLVideoElement) || isStartedCamera.current) {
      return;
    }

    isStartedCamera.current = true;

    navigator.mediaDevices
      .getUserMedia({
        video: true,
        audio: false,
      })
      .then((stream) => {
        video.srcObject = stream;
        video.play();
      })
      .catch((err) => {
        console.error(`An error occurred: ${err}`);
      });
  };

  const stopCamera = () => {
    const video = videoRef.current;

    if (!(video instanceof HTMLVideoElement) || !isStartedCamera.current) {
      return;
    }

    isStartedCamera.current = false;

    const stream = video.srcObject;

    if (!(stream instanceof MediaStream)) {
      return;
    }

    for (const track of stream.getTracks()) {
      track.stop();
    }

    video.srcObject = null;
  };

  const onVideoCanPlay = () => {
    const video = videoRef.current;

    if (!(video instanceof HTMLVideoElement)) {
      return;
    }

    if (!streaming.current) {
      height.current = video.videoHeight * (WIDTH / video.videoWidth);

      // Firefox currently has a bug where the height can't be read from
      // the video, so we will make assumptions if this happens.
      if (isNaN(height.current)) {
        height.current = WIDTH / (4 / 3);
      }

      video.setAttribute('width', WIDTH.toString());
      video.setAttribute('height', height.toString());

      streaming.current = true;
    }
  };

  const takePhoto = useCallback(() => {
    const video = videoRef.current;

    if (!(video instanceof HTMLVideoElement)) {
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.setAttribute('width', WIDTH.toString());
    canvas.setAttribute('height', height.toString());

    const context = canvas.getContext('2d');

    if (WIDTH && height && context) {
      canvas.width = WIDTH;
      canvas.height = height.current;
      context.drawImage(video, 0, 0, WIDTH, height.current);

      const data = canvas.toDataURL('image/png');

      setFaceImageUrl(data);
      setIsUsingCamera(false);
      stopCamera();
    }
  }, [setFaceImageUrl, setIsUsingCamera]);

  useEffect(() => {
    process.nextTick(() => {
      if (isUsingCamera) {
        startCamera();
      } else {
        isStartedCamera.current = false;
      }
    });
  }, [isUsingCamera]);

  return (
    <Dialog open={isUsingCamera} onOpenChange={setIsUsingCamera}>
      <DialogTrigger asChild>
        <Button type='button' variant='outline'>
          <span>Use photo from camera</span>
          <CameraIcon />
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogTitle>Use photo from camera</DialogTitle>

        <video ref={videoRef} className='w-full' onCanPlay={onVideoCanPlay}>
          Video stream not available.
        </video>

        <Button type='button' onClick={takePhoto}>
          Take photo
        </Button>
      </DialogContent>
    </Dialog>
  );
};
