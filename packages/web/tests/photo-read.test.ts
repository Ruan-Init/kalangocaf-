import { expect, test } from "bun:test";
import { handlePhotoRead } from "../src/api/routes/photo-read";

const key = "cafes/1720000000000-a1b2c3d4-cafe-especial.jpg";
const imageBody = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.close();
    },
  });

test("foto válida é lida do bucket privado e servida como JPEG", async () => {
  let requestedKey = "";
  const response = await handlePhotoRead(key, {
    missingConfig: () => [],
    readPhoto: async (requested) => {
      requestedKey = requested;
      return { body: imageBody(), etag: '"photo-etag"' };
    },
  });

  expect(requestedKey).toBe(key);
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("image/jpeg");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.get("ETag")).toBe('"photo-etag"');
  expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3]);
});

test("caminho fora do formato de fotos permitido não consulta o storage", async () => {
  let reads = 0;
  const response = await handlePhotoRead("private/../../secret.txt", {
    missingConfig: () => [],
    readPhoto: async () => {
      reads++;
      return { body: imageBody() };
    },
  });

  expect(response.status).toBe(404);
  expect(reads).toBe(0);
});

test("foto não encontrada no bucket retorna 404", async () => {
  const missingPhoto = new Error("Missing");
  missingPhoto.name = "NoSuchKey";
  const response = await handlePhotoRead(key, {
    missingConfig: () => [],
    readPhoto: async () => {
      throw missingPhoto;
    },
  });

  expect(response.status).toBe(404);
});

test("storage não configurado retorna erro explícito", async () => {
  let reads = 0;
  const response = await handlePhotoRead(key, {
    missingConfig: () => ["S3_BUCKET"],
    readPhoto: async () => {
      reads++;
      return { body: imageBody() };
    },
  });

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: "Storage de fotos não configurado: S3_BUCKET.",
  });
  expect(reads).toBe(0);
});
