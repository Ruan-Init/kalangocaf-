import { ORPCError } from "@orpc/server";
import {
  isPhotoContentType,
  type PhotoFolder,
  type PhotoContentType,
} from "../services/photo-storage";

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

type PhotoUploadDependencies = {
  assertOps: (token: string) => void;
  missingConfig: () => string[];
  storePhoto: (input: {
    filename: string;
    contentType: PhotoContentType;
    folder: PhotoFolder;
    body: Uint8Array;
  }) => Promise<string>;
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function handlePhotoUpload(request: Request, dependencies: PhotoUploadDependencies) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  try {
    dependencies.assertOps(token);
  } catch (error) {
    if (!(error instanceof ORPCError)) throw error;
    return json(
      { error: error.message },
      error.code === "UNAUTHORIZED" ? 401 : 403
    );
  }

  const missing = dependencies.missingConfig();
  if (missing.length) {
    return json(
      { error: `Storage de fotos não configurado: ${missing.join(", ")}.` },
      503
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    if (error instanceof TypeError) return json({ error: "Envio de arquivo inválido." }, 400);
    throw error;
  }

  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "Selecione uma foto." }, 400);
  if (!isPhotoContentType(file.type)) {
    return json({ error: "Só fotos JPG, PNG, WebP, GIF ou AVIF." }, 415);
  }
  if (file.size === 0) return json({ error: "A foto está vazia." }, 400);
  if (file.size > MAX_PHOTO_BYTES) {
    return json({ error: "Foto maior que 15 MB." }, 413);
  }

  const folder = form.get("folder") ?? "lifestyle";
  if (folder !== "lifestyle" && folder !== "cafes") {
    return json({ error: "Pasta de fotos inválida." }, 400);
  }

  try {
    const publicUrl = await dependencies.storePhoto({
      filename: file.name,
      contentType: file.type,
      folder,
      body: new Uint8Array(await file.arrayBuffer()),
    });
    return json({ publicUrl }, 201);
  } catch (error) {
    console.error("Falha ao salvar foto no storage.", error);
    return json({ error: "Não foi possível salvar a foto no storage. Tente novamente." }, 502);
  }
}
