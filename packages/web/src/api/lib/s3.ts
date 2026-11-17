import { S3Client } from "@aws-sdk/client-s3";

const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

export const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.S3_ENDPOINT || "https://t3.storage.dev",
  forcePathStyle: false,
  ...(accessKeyId && secretAccessKey
    ? { credentials: { accessKeyId, secretAccessKey } }
    : {}),
});

export function missingPhotoStorageConfig() {
  return [
    !process.env.S3_BUCKET && "S3_BUCKET",
    !process.env.S3_ACCESS_KEY_ID && "S3_ACCESS_KEY_ID",
    !process.env.S3_SECRET_ACCESS_KEY && "S3_SECRET_ACCESS_KEY",
  ].filter((key): key is string => Boolean(key));
}

export function publicUrl(key: string) {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET não está configurado.");
  return `/api/photos/${key.split("/").map(encodeURIComponent).join("/")}`;
}
