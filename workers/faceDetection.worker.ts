/// <reference lib="webworker" />
// Runs face-api.js off the main thread, so the page stays responsive while photos are checked.
import * as faceapi from 'face-api.js';
import { DetectFacesRequest, DetectFacesResponse, DetectedFace } from '@/types/faceRecognition';

const MODEL_URL = '/models';

// face-api.js only knows the browser window and Node.js. In a worker, OffscreenCanvas stands in for <canvas>.
class Unsupported {}

faceapi.env.setEnv({
  Canvas: OffscreenCanvas as unknown as typeof HTMLCanvasElement,
  CanvasRenderingContext2D: OffscreenCanvasRenderingContext2D as unknown as typeof CanvasRenderingContext2D,
  Image: Unsupported as unknown as typeof HTMLImageElement,
  ImageData,
  Video: Unsupported as unknown as typeof HTMLVideoElement,
  createCanvasElement: () => new OffscreenCanvas(1, 1) as unknown as HTMLCanvasElement,
  createImageElement: () => {
    throw new Error('Images are not available in a worker');
  },
  fetch: (url: string, init?: RequestInit) => fetch(new URL(url, self.location.origin), init),
  readFile: () => {
    throw new Error('readFile is not available in a worker');
  },
});

const modelsLoaded = Promise.all([
  faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
  faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
  faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
]);

const detectFaces = async (image: Blob, minConfidence: number) => {
  await modelsLoaded;

  const bitmap = await createImageBitmap(image);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  bitmap.close();

  const detections = await faceapi
    .detectAllFaces(canvas as unknown as HTMLCanvasElement, new faceapi.SsdMobilenetv1Options({ minConfidence }))
    .withFaceLandmarks()
    .withFaceDescriptors();

  return detections.map(({ detection, descriptor }): DetectedFace => {
    const { x, y, width, height } = detection.box;

    return { box: { x, y, width, height }, descriptor };
  });
};

// Photos are checked one at a time: running several models at once only uses more memory
let queue: Promise<unknown> = Promise.resolve();

self.onmessage = (event: MessageEvent<DetectFacesRequest>) => {
  const request = event.data;
  const { id } = request;

  const run = async () => {
    try {
      if (request.type === 'load') {
        await modelsLoaded;
      }

      const response: DetectFacesResponse = { id, faces: request.type === 'detect' ? await detectFaces(request.image, request.minConfidence) : [] };

      self.postMessage(response);
    } catch (error) {
      const response: DetectFacesResponse = { id, error: error instanceof Error ? error.message : String(error) };
      self.postMessage(response);
    }
  };

  queue = queue.then(run);
};
