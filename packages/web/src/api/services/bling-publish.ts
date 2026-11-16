/** Gestão → novo produto Bling. Rascunho durável, SKU único, POST sem repetição. */
import { ORPCError } from "@orpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../database";
import { merch, products } from "../database/schema";
import { BlingError, blingFetch, getConnection, isConnected } from "./bling-client";

export type ProductKind = "coffee" | "merch";
export const publicStatuses = ["legacy", "ready"];
export const isPublished = (row: { publicationStatus: string }) => publicStatuses.includes(row.publicationStatus);
export const publicationOpen = (row: { publicationStatus: string }) => !isPublished(row);

export function creationSku(kind: ProductKind, key: string) {
  return `KG-${kind === "coffee" ? "CF" : "LS"}-${key.replace(/-/g, "").toUpperCase()}`;
}

export async function publicationRow(kind: ProductKind, id: number) {
  const rows = kind === "coffee"
    ? await db.select().from(products).where(eq(products.id, id)).limit(1)
    : await db.select().from(merch).where(eq(merch.id, id)).limit(1);
  if (!rows[0]) throw new ORPCError("NOT_FOUND", { message: "Produto não encontrado." });
  return rows[0];
}

type PublicationSet = Partial<Pick<typeof products.$inferInsert,
  "publicationStatus" | "publicationError" | "publicationAttemptAt" | "productAttempted" |
  "stockAttempted" | "initialDepositId" | "blingId" | "blingSyncedAt">>;
async function setRow(kind: ProductKind, id: number, values: PublicationSet) {
  if (kind === "coffee") await db.update(products).set(values).where(eq(products.id, id));
  else await db.update(merch).set(values).where(eq(merch.id, id));
}

/** Evita edição/exclusão enquanto uma operação pode estar em voo. */
export function assertPublicationEditable(row: Awaited<ReturnType<typeof publicationRow>>) {
  if (row.publicationStatus === "publishing") {
    throw new ORPCError("CONFLICT", { message: "Cadastro no Bling em andamento. Aguarde e atualize a lista." });
  }
}

const running = new Map<string, Promise<Awaited<ReturnType<typeof publicationRow>>>>();
export function publishToBling(kind: ProductKind, id: number) {
  const key = `${kind}:${id}`;
  const previous = running.get(key);
  if (previous) return previous;
  const operation = publish(kind, id).finally(() => running.delete(key));
  running.set(key, operation);
  return operation;
}

function definitelyRejected(err: unknown) {
  return err instanceof BlingError && (
    ["not_configured", "not_connected", "reconnect"].includes(err.kind) ||
    (err.status != null && err.status >= 400 && err.status < 500 && err.status !== 408)
  );
}

async function publish(kind: ProductKind, id: number) {
  let row = await publicationRow(kind, id);
  if (isPublished(row)) return row;
  if (row.publicationStatus === "publishing" && row.publicationAttemptAt &&
      Date.now() - row.publicationAttemptAt.getTime() < 120_000) return row;

  // Compare-and-set compartilhado entre processos. Uma falha/restart conserva os marcadores de POST.
  const table = kind === "coffee" ? products : merch;
  const claimed = await db.update(table).set({
    publicationStatus: "publishing", publicationAttemptAt: new Date(), publicationError: null,
  }).where(and(eq(table.id, id), eq(table.publicationStatus, row.publicationStatus),
    row.publicationAttemptAt ? eq(table.publicationAttemptAt, row.publicationAttemptAt) : isNull(table.publicationAttemptAt)))
    .returning({ id: table.id });
  if (!claimed.length) return publicationRow(kind, id);

  try {
    const conn = await getConnection();
    if (!isConnected(conn)) throw new Error("Conecte o Bling na aba Bling e tente novamente. O rascunho está salvo e fora da loja.");
    if (!row.sku || !row.priceCents || row.priceCents <= 0) throw new Error("Informe um preço maior que zero antes de enviar ao Bling.");
    if (kind === "coffee" && row.initialStock > 0 && !row.initialDepositId) {
      if (!conn?.initialDepositId) throw new Error("Escolha o depósito de estoque inicial na aba Bling e tente novamente.");
      await setRow(kind, id, { initialDepositId: conn.initialDepositId });
      row = await publicationRow(kind, id);
    }

    if (!row.blingId) {
      // Só procura o SKU gerado por este cadastro; não importa um produto escolhido pelo usuário.
      const found = await blingFetch<{ data: { id: number; codigo: string; situacao?: string }[] }>("/produtos", {
        query: { "codigos[]": [row.sku!], criterio: 5, limite: 100 },
      });
      const matches = (found.data ?? []).filter((p) => p.codigo === row.sku);
      if (matches.length > 1) throw new Error("Mais de um produto com este SKU no Bling. Confira no ERP antes de continuar.");
      let blingId = matches[0]?.id;
      if (matches[0]?.situacao !== undefined && matches[0].situacao !== "A" && matches[0].situacao !== "I") {
        throw new Error("Produto com este SKU foi excluído no Bling. Confira no ERP antes de continuar.");
      }
      if (!blingId) {
        if (row.productAttempted) throw new Error(`Resposta do cadastro ainda não confirmada. Confira o SKU ${row.sku} no Bling; tentar novamente apenas consulta, sem criar duplicatas.`);
        const body = {
          nome: row.name, codigo: row.sku, preco: row.priceCents! / 100,
          tipo: "P", situacao: row.active ? "A" : "I", formato: "S", unidade: "UN",
          descricaoCurta: row.description ?? "",
          ...(kind === "coffee" ? {
            pesoLiquido: ("weightGrams" in row ? row.weightGrams : 250) / 1000,
            ...(conn?.cafeCategoryId ? { categoria: { id: conn.cafeCategoryId } } : {}),
          } : {}),
        };
        await setRow(kind, id, { productAttempted: true });
        try {
          const response = await blingFetch<{ data: { id: number } }>("/produtos", {
            method: "POST", body, noRetry: true,
          });
          blingId = response?.data?.id;
          if (!Number.isSafeInteger(blingId) || blingId! <= 0) throw new Error("Bling não confirmou o ID do novo produto.");
        } catch (err) {
          if (definitelyRejected(err)) await setRow(kind, id, { productAttempted: false });
          throw err;
        }
      }
      await setRow(kind, id, { blingId });
      row = await publicationRow(kind, id);
    }

    if (kind === "coffee" && row.initialStock > 0) {
      if (row.stockAttempted) {
        // Nunca refazer um balanço ambíguo: poderia repor saldo vendido em outro canal.
        const balance = await blingFetch<{ data: { produto: { id: number }; saldoFisicoTotal?: number }[] }>(
          `/estoques/saldos/${row.initialDepositId}`, { query: { "idsProdutos[]": [row.blingId!] } }
        );
        const current = balance.data?.find((p) => p.produto.id === row.blingId)?.saldoFisicoTotal;
        if (current !== row.initialStock) throw new Error("Estoque inicial não confirmado. Confira o balanço no depósito do Bling; a integração não repetirá a movimentação automaticamente.");
      } else {
        await setRow(kind, id, { stockAttempted: true });
        try {
          await blingFetch("/estoques", { method: "POST", noRetry: true, body: {
            produto: { id: row.blingId }, deposito: { id: row.initialDepositId },
            operacao: "B", quantidade: row.initialStock, observacoes: `Cadastro Gestão ${row.sku}`,
          } });
        } catch (err) {
          if (definitelyRejected(err)) await setRow(kind, id, { stockAttempted: false });
          throw err;
        }
      }
    }
    await setRow(kind, id, { publicationStatus: "ready", publicationError: null, blingSyncedAt: new Date() });
  } catch (err) {
    const current = await publicationRow(kind, id);
    await setRow(kind, id, {
      publicationStatus: current.stockAttempted ? "stock_uncertain" :
        !current.blingId && current.productAttempted ? "uncertain" : "error",
      publicationError: (err instanceof Error ? err.message : "Falha ao cadastrar no Bling.").slice(0, 800),
    });
  }
  return publicationRow(kind, id);
}

/** Filtro SQL usado também por catálogo e feeds. */
export const publishedCoffee = () => inArray(products.publicationStatus, publicStatuses);
export const publishedMerch = () => inArray(merch.publicationStatus, publicStatuses);