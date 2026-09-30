import { DetectedFace, FaceBox } from '@/types/faceRecognition';

export const DEFAULT_MATCH_THRESHOLD = 0.5;

export const getMatchThreshold = () => Number(process.env.NEXT_PUBLIC_FACE_MATCHER_THRESHOLD ?? DEFAULT_MATCH_THRESHOLD);

export const euclideanDistance = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let sum = 0;

  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
};

/**
 * Returns how close the closest face in a photo is to any of the reference faces,
 * or undefined when none is within `threshold` (lower distances are closer).
 * Comparing against each reference separately means one good reference photo is enough.
 */
export const getBestMatchDistance = (faces: Pick<DetectedFace, 'descriptor'>[], referenceDescriptors: ArrayLike<number>[], threshold: number) => {
  let best: number | undefined;

  for (const face of faces) {
    for (const reference of referenceDescriptors) {
      const distance = euclideanDistance(face.descriptor, reference);

      if (distance < threshold && (best === undefined || distance < best)) {
        best = distance;
      }
    }
  }

  return best;
};

// The face to search for by default when a reference photo has several: the biggest one
export const getLargestFaceIndex = (faces: { box: FaceBox }[]) =>
  faces.reduce(
    (largest, face, index) => (face.box.width * face.box.height > faces[largest].box.width * faces[largest].box.height ? index : largest),
    faces.length ? 0 : -1
  );
