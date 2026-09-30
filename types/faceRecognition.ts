export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedFace {
  box: FaceBox;
  descriptor: Float32Array;
}

// Messages exchanged with workers/faceDetection.worker.ts
export type DetectFacesCommand = { type: 'load' } | { type: 'detect'; image: Blob; minConfidence: number };

export type DetectFacesRequest = DetectFacesCommand & { id: number };

export type DetectFacesResponse = { id: number; faces: DetectedFace[] } | { id: number; error: string };

export interface ReferencePhoto {
  id: string;
  url: string; // Object URL of the photo
  status: 'detecting' | 'ready' | 'error';
  faces: DetectedFace[];
  faceCrops: string[]; // Small images of each face, in the same order as `faces`
  selectedFaceIndex: number; // Which face to search for, -1 when there is none
}

export interface FaceRecognitionResult {
  fileId: string;
  fileName: string;
  folderPath: string; // Subfolder the photo was found in, relative to the scanned folder ('' for the folder itself)
  mimeType: string;
  previewUrl: string; // Object URL of the image the face was found in (usually a thumbnail)
  originalBlob?: Blob; // Set when the full size photo was already downloaded to check it
}
