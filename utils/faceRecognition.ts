import { FaceWithDescriptor } from '@/types/faceRecognition';
import * as faceapi from 'face-api.js';

export const getBestMatchFace = async (imgElement: HTMLImageElement, faceWithDescriptor: FaceWithDescriptor) => {
  // Detect faces in the photo
  const fullFaceDescriptions = await faceapi
    .detectAllFaces(
      imgElement,
      new faceapi.SsdMobilenetv1Options({
        minConfidence: Number(process.env.NEXT_PUBLIC_MIN_CONFIDENCE ?? 0.3),
      })
    )
    .withFaceLandmarks()
    .withFaceDescriptors();

  if (!fullFaceDescriptions.length) {
    return;
  }

  // Find photos with faces matching the uploaded face
  const faceMatcher = new faceapi.FaceMatcher(fullFaceDescriptions, Number(process.env.NEXT_PUBLIC_FACE_MATCHER_THRESHOLD ?? 0.5));
  const bestMatch = faceMatcher.findBestMatch(faceWithDescriptor.descriptor);

  // Return undefined if no match or match is 'unknown'
  if (!bestMatch || bestMatch.label === 'unknown') {
    return;
  }

  return bestMatch;
};
