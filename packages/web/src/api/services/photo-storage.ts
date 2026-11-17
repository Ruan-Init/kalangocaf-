import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { missingPhotoStorageConfig, publicUrl, s3 } from "../lib/s3";

const extensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
} as const;

export type PhotoContentType = keyof typeof extensions;
export type PhotoFolder = "lifestyle" | "cafes";

const contentTypesByExtension: Record<string, PhotoContentType> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

export function isPhotoContentType(value: string): value is PhotoContentType {
  return Object.prototype.hasOwnProperty.call(extensions, value);
}

export function isPhotoObjectKey(key: string): boolean {
  return /^(cafes|lifestyle)\/\d+-[a-f0-9]{8}-[a-z0-9-]{1,60}\.(jpg|png|webp|gif|avif)$/.test(key);
}

export function photoContentTypeForKey(key: string): PhotoContentType | undefined {
  return contentTypesByExtension[key.slice(key.lastIndexOf(".") + 1)];
}

export function photoObjectKey(filename: string, contentType: PhotoContentType, folder: PhotoFolder) {
  const base = filename
    .replace(/\.[a-z0-9]+$/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "foto";
  return `${folder}/${Date.now()}-${randomUUID().slice(0, 8)}-${base}.${extensions[contentType]}`;
}

export async function storePhoto(input: {
  filename: string;
  contentType: PhotoContentType;
  folder: PhotoFolder;
  body: Uint8Array;
}) {
  const missing = missingPhotoStorageConfig();
  if (missing.length) {
    throw new Error(`Storage de fotos não configurado: ${missing.join(", ")}.`);
  }
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET não está configurado.");

  const key = photoObjectKey(input.filename, input.contentType, input.folder);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: input.body,
      ContentLength: input.body.byteLength,
      ContentType: input.contentType,
    })
  );
  return publicUrl(key);
}

export async function readPhoto(key: string) {
  const missing = missingPhotoStorageConfig();
  if (missing.length) {
    throw new Error(`Storage de fotos não configurado: ${missing.join(", ")}.`);
  }
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET não está configurado.");

  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!result.Body) throw new Error("O storage não retornou o conteúdo da foto.");
  return {
    body: result.Body.transformToWebStream(),
    etag: result.ETag,
    lastModified: result.LastModified,
  };
}
