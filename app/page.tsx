import { FaceRecognitionForm } from '@/components/FaceRecognitionForm';

export default function Home() {
  return (
    <div className='mx-auto w-full max-w-4xl space-y-5 px-5 py-10'>
      <h1 className='mb-12 text-3xl font-semibold'>Search photos by face</h1>
      <FaceRecognitionForm />
    </div>
  );
}
