import {
  isPhotoObjectKey,
  photoContentTypeForKey,
} from "../services/photo-storage";

type PhotoReadDependencies = {
  missingConfig: () => string[];
  readPhoto: (key: string) => Promise<{
    body: ReadableStream<Uint8Array>;
    etag?: string;
    lastModified?: Date;
  }>;
};

function isNotFound(error: unknown) {
  if (error instanceof Error && (error.name === "NoSuchKey" || error.name === "NotFound")) {
    return true;
  }
  if (typeof error !== "object" || error === null || !("$metadata" in error)) return false;
  const metadata = error.$metadata;
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    "httpStatusCode" in metadata &&
    metadata.httpStatusCode === 404
  );
}

export async function handlePhotoRead(key: string, dependencies: PhotoReadDependencies) {
  if (!isPhotoObjectKey(key)) return new Response("Foto não encontrada.", { status: 404 });

  const contentType = photoContentTypeForKey(key);
  if (!contentType) return new Response("Foto não encontrada.", { status: 404 });

  const missing = dependencies.missingConfig();
  if (missing.length) {
    return new Response(
      JSON.stringify({ error: `Storage de fotos não configurado: ${missing.join(", ")}.` }),
      { status: 503, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }

  try {
    const photo = await dependencies.readPhoto(key);
    const headers = new Headers({
      "Cache-Control": "public, max-age=3600",
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    });
    if (photo.etag) headers.set("ETag", photo.etag);
    if (photo.lastModified) headers.set("Last-Modified", photo.lastModified.toUTCString());
    return new Response(photo.body, { headers });
  } catch (error) {
    if (isNotFound(error)) return new Response("Foto não encontrada.", { status: 404 });
    console.error("Falha ao ler foto no storage.", error);
    return new Response("Não foi possível carregar a foto.", { status: 502 });
  }
}
