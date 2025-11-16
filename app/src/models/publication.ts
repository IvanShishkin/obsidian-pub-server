export interface PublicationMetadata {
  title: string;
  publishedAt: string;
  obsidianPath: string;
}

export interface ImageData {
  filename: string;
  data: string;
  mimeType: string;
}

export interface Publication {
  filename: string;
  title: string;
  obsidianPath: string;
  passwordHash: string | null;
  createdAt: string;
  updatedAt: string;
  images?: string[];
}

export interface MetadataStore {
  publications: Record<string, Publication>;
  filenameIndex: Record<string, string>;
}

export interface PublishRequest {
  filename: string;
  content: string;
  password?: string;
  metadata: PublicationMetadata;
  images?: ImageData[];
}

export interface PublishResponse {
  success: boolean;
  hash: string;
  url: string;
  exists: boolean;
  message?: string;
  imagesUploaded?: number;
}

export interface CheckResponse {
  exists: boolean;
  hash: string | null;
  url: string | null;
  lastUpdated: string | null;
}
