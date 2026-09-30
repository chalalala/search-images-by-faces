import { driveErrorResponse, listDriveImages } from '@/lib/drive';

const MAX_PAGE_SIZE = 100;

// Lists the images in a public Google Drive folder: GET /api/drive/files?folderId=...&pageToken=...&pageSize=...&includeFolders=1
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get('folderId') || '';
  const pageToken = searchParams.get('pageToken') || '';
  const pageSize = Math.min(Number(searchParams.get('pageSize')) || MAX_PAGE_SIZE, MAX_PAGE_SIZE);
  const includeFolders = searchParams.get('includeFolders') === '1';

  try {
    const data = await listDriveImages(folderId, { pageSize, pageToken, includeFolders });

    return Response.json(data);
  } catch (error) {
    return driveErrorResponse(error);
  }
}
