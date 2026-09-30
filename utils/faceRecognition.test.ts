import { euclideanDistance, getBestMatchDistance, getLargestFaceIndex } from './faceRecognition';

const face = (...descriptor: number[]) => ({ descriptor: new Float32Array(descriptor) });
const box = (width: number, height: number) => ({ box: { x: 0, y: 0, width, height } });

describe('face matching', () => {
  it('measures the distance between descriptors', () => {
    expect(euclideanDistance([0, 0], [3, 4])).toBe(5);
  });

  it('returns the closest distance to any reference face', () => {
    const faces = [face(1, 0), face(0.1, 0)];
    const references = [new Float32Array([0, 0]), new Float32Array([0.95, 0])];

    expect(getBestMatchDistance(faces, references, 0.5)).toBeCloseTo(0.05);
  });

  it('returns undefined when no face is close enough', () => {
    expect(getBestMatchDistance([face(1, 0)], [new Float32Array([0, 0])], 0.5)).toBeUndefined();
    expect(getBestMatchDistance([], [new Float32Array([0, 0])], 0.5)).toBeUndefined();
    expect(getBestMatchDistance([face(0, 0)], [], 0.5)).toBeUndefined();
  });

  it('picks the biggest face by default', () => {
    expect(getLargestFaceIndex([box(10, 10), box(30, 20), box(20, 20)])).toBe(1);
    expect(getLargestFaceIndex([])).toBe(-1);
  });
});
