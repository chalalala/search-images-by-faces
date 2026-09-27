export interface FileListResponse {
  files: FileListResponseSingleFile[];
  kind: string;
  incompleteSearch: boolean;
  nextPageToken?: string;
}

export interface FileListResponseSingleFile {
  kind: string;
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string; // Short-lived link to a resized copy, served outside the Drive API quota
}
