import { driveErrorResponse, fetchDriveThumbnail } from '@/lib/drive';

// Streams a resized copy of a Drive photo: GET /api/drive/thumbnail?link=<thumbnailLink from the file list>
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const thumbnailLink = searchParams.get('link') || '';

  try {
    const thumbnailRes = await fetchDriveThumbnail(thumbnailLink);

    return new Response(thumbnailRes.body, {
      headers: {
        'Content-Type': thumbnailRes.headers.get('content-type') || 'image/jpeg',
      },
    });
  } catch (error) {
    return driveErrorResponse(error);
  }
}
