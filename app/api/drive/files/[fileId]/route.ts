import { driveErrorResponse, fetchDriveFile } from '@/lib/drive';

// Streams the content of a public Google Drive file: GET /api/drive/files/:fileId
export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;

  try {
    const driveRes = await fetchDriveFile(fileId);

    return new Response(driveRes.body, {
      headers: {
        'Content-Type': driveRes.headers.get('content-type') || 'application/octet-stream',
      },
    });
  } catch (error) {
    return driveErrorResponse(error);
  }
}
