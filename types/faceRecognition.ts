import * as faceapi from 'face-api.js';

export interface FaceRecognitionResult {
  fileBlob: Blob;
  fileName: string;
  src: string;
}

export type FaceWithDescriptor = faceapi.WithFaceDescriptor<
  faceapi.WithFaceLandmarks<
    {
      detection: faceapi.FaceDetection;
    },
    faceapi.FaceLandmarks68
  >
>;
