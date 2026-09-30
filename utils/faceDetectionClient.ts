'use client';

import { DetectFacesCommand, DetectFacesRequest, DetectFacesResponse, DetectedFace } from '@/types/faceRecognition';

type PendingRequest = { resolve: (faces: DetectedFace[]) => void; reject: (error: Error) => void };

let worker: Worker | undefined;
let nextRequestId = 0;
const pendingRequests = new Map<number, PendingRequest>();

const rejectAll = (message: string) => {
  pendingRequests.forEach(({ reject }) => reject(new Error(message)));
  pendingRequests.clear();
};

// One worker is shared by the whole page and created on first use
const getWorker = () => {
  if (!worker) {
    worker = new Worker(new URL('../workers/faceDetection.worker.ts', import.meta.url));

    worker.onmessage = (event: MessageEvent<DetectFacesResponse>) => {
      const response = event.data;
      const request = pendingRequests.get(response.id);
      pendingRequests.delete(response.id);

      if ('error' in response) {
        request?.reject(new Error(response.error));
      } else {
        request?.resolve(response.faces);
      }
    };

    worker.onerror = (event) => {
      console.error('Face detection worker failed:', event.message);
      rejectAll('Face detection stopped working. Please reload the page.');
      worker?.terminate();
      worker = undefined;
    };
  }

  return worker;
};

const send = (command: DetectFacesCommand) =>
  new Promise<DetectedFace[]>((resolve, reject) => {
    const id = nextRequestId++;
    pendingRequests.set(id, { resolve, reject });
    const request: DetectFacesRequest = { ...command, id };
    getWorker().postMessage(request);
  });

// Starts downloading the face models so the first detection doesn't wait for them
export const loadFaceModels = async () => {
  await send({ type: 'load' });
};

// Finds every face in the image, with the descriptor used to compare it to other faces
export const detectFaces = (image: Blob) => send({ type: 'detect', image, minConfidence: Number(process.env.NEXT_PUBLIC_MIN_CONFIDENCE ?? 0.3) });
