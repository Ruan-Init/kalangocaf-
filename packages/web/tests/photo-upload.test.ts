import { expect, test } from "bun:test";
import { ORPCError } from "@orpc/server";
import { handlePhotoUpload } from "../src/api/routes/photo-upload";

const assertOps = (token: string) => {
  if (token !== "ops-test-only") {
    throw new ORPCError("UNAUTHORIZED", { message: "Senha inválida." });
  }
};

const requestWithFile = (
  file = new File(["foto"], "cafe.jpg", { type: "image/jpeg" }),
  options: { token?: string; folder?: string } = {}
) => {
  const form = new FormData();
  form.set("file", file);
  form.set("folder", options.folder ?? "cafes");
  return new Request("https://example.test/api/admin/upload-photo", {
    method: "POST",
    headers: { Authorization: `Bearer ${options.token ?? "ops-test-only"}` },
    body: form,
  });
};

test("foto válida é encaminhada ao storage autenticada e retorna URL pública", async () => {
  let uploaded: {
    filename: string;
    contentType: string;
    folder: string;
    body: Uint8Array;
  } | undefined;

  const response = await handlePhotoUpload(requestWithFile(), {
    assertOps,
    missingConfig: () => [],
    storePhoto: async (input) => {
      uploaded = input;
      return "https://fotos.t3.storage.dev/cafes/foto.jpg";
    },
  });

  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({
    publicUrl: "https://fotos.t3.storage.dev/cafes/foto.jpg",
  });
  expect(uploaded).toMatchObject({
    filename: "cafe.jpg",
    contentType: "image/jpeg",
    folder: "cafes",
    body: new TextEncoder().encode("foto"),
  });
});

test("foto sem autenticação válida não chega ao storage", async () => {
  let uploads = 0;
  const response = await handlePhotoUpload(requestWithFile(undefined, { token: "wrong" }), {
    assertOps,
    missingConfig: () => [],
    storePhoto: async () => {
      uploads++;
      return "https://fotos.t3.storage.dev/foto.jpg";
    },
  });

  expect(response.status).toBe(401);
  expect(uploads).toBe(0);
});

test("armazenamento sem configuração informa as variáveis ausentes", async () => {
  const response = await handlePhotoUpload(requestWithFile(), {
    assertOps,
    missingConfig: () => ["S3_BUCKET"],
    storePhoto: async () => {
      throw new Error("Não deveria chamar o storage.");
    },
  });

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: "Storage de fotos não configurado: S3_BUCKET.",
  });
});

test("tipo de imagem não aceito é recusado antes do storage", async () => {
  let uploads = 0;
  const response = await handlePhotoUpload(
    requestWithFile(new File(["documento"], "arquivo.pdf", { type: "application/pdf" })),
    {
      assertOps,
      missingConfig: () => [],
      storePhoto: async () => {
        uploads++;
        return "https://fotos.t3.storage.dev/foto.jpg";
      },
    }
  );

  expect(response.status).toBe(415);
  expect(uploads).toBe(0);
});

test("foto acima de 15 MB é recusada antes do storage", async () => {
  let uploads = 0;
  const file = new File([new Uint8Array(15 * 1024 * 1024 + 1)], "foto.jpg", {
    type: "image/jpeg",
  });
  const response = await handlePhotoUpload(requestWithFile(file), {
    assertOps,
    missingConfig: () => [],
    storePhoto: async () => {
      uploads++;
      return "https://fotos.t3.storage.dev/foto.jpg";
    },
  });

  expect(response.status).toBe(413);
  expect(uploads).toBe(0);
});
