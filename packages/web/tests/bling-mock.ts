/** Bling falso para os testes (registrado no fetch simulado de mp-mock). */
import { otherHosts } from "./mp-mock";
import type { BlingProduct } from "../src/api/services/bling-sync";

type Req = { method: string; path: string; query: URLSearchParams; body: unknown; headers: Headers };

export const bmock = {
  products: new Map<number, BlingProduct>(),
  contatos: [] as { id: number; numeroDocumento: string; body: unknown }[],
  pedidos: [] as { id: number; numero: number; numeroLoja: string; body: Record<string, unknown> }[],
  requests: [] as Req[],
  tokenSeq: 0,
  /** Próximas respostas forçadas por rota ("GET /produtos" → status). */
  failNext: new Map<string, number[]>(),
  refreshFails: false,
  validAccess: new Set<string>(),
  validRefresh: new Set<string>(),
  companyId: "empresa-kalango",
};

export function resetBling() {
  bmock.products.clear();
  bmock.contatos = [];
  bmock.pedidos = [];
  bmock.requests = [];
  bmock.failNext.clear();
  bmock.refreshFails = false;
}

export function calls(prefix: string) {
  return bmock.requests.filter((r) => `${r.method} ${r.path}`.startsWith(prefix));
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function issue() {
  const n = ++bmock.tokenSeq;
  const access = `jwt-access-${n}-${"a".repeat(1500)}`;
  const refresh = `refresh-${n}`;
  bmock.validAccess.add(access);
  bmock.validRefresh.add(refresh);
  return { access_token: access, refresh_token: refresh, expires_in: 21600, token_type: "Bearer", scope: "1 2 3" };
}

async function handler(url: URL, init?: RequestInit) {
  const method = init?.method ?? "GET";
  const path = url.pathname.replace(/^\/Api\/v3/, "");
  const headers = new Headers(init?.headers);
  const raw = init?.body ? String(init.body) : "";
  const body = raw && headers.get("content-type")?.includes("json") ? JSON.parse(raw) : raw;
  bmock.requests.push({ method, path, query: url.searchParams, body, headers });

  const key = `${method} ${path}`;
  const forced = bmock.failNext.get(key);
  if (forced?.length) return json({ error: { type: "X", message: "forçado", description: "erro simulado" } }, forced.shift()!);

  if (path === "/oauth/token") {
    const expected = `Basic ${Buffer.from("bling-client-teste:bling-segredo-teste").toString("base64")}`;
    if (headers.get("authorization") !== expected) return json({ error: "invalid_client" }, 401);
    if (headers.get("enable-jwt") !== "1") return json({ error: "sem jwt" }, 400);
    const form = new URLSearchParams(raw);
    if (form.get("grant_type") === "authorization_code") {
      if (form.get("code") !== "code-ok") return json({ error: "invalid_grant" }, 400);
      return json(issue());
    }
    if (form.get("grant_type") === "refresh_token") {
      const rt = form.get("refresh_token") ?? "";
      if (bmock.refreshFails || !bmock.validRefresh.has(rt)) return json({ error: "invalid_grant" }, 400);
      bmock.validRefresh.delete(rt); // rotativo
      return json(issue());
    }
    return json({ error: "unsupported" }, 400);
  }

  const auth = headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!bmock.validAccess.has(auth)) return json({ error: { type: "UNAUTHORIZED", message: "token" } }, 401);

  if (path === "/empresas/me/dados-basicos") return json({ data: { id: bmock.companyId, nome: "Kalango Cafés" } });

  if (path === "/produtos" && method === "GET") {
    const codigos = url.searchParams.getAll("codigos[]");
    const cat = Number(url.searchParams.get("idCategoria") ?? 0);
    const criterio = url.searchParams.get("criterio");
    let list = [...bmock.products.values()];
    if (codigos.length) list = list.filter((p) => codigos.includes(p.codigo ?? ""));
    if (cat) list = list.filter((p) => p.categoria?.id === cat);
    if (criterio === "2") list = list.filter((p) => p.situacao === "A");
    // Listagem não traz descrição complementar nem mídia.
    return json({ data: list.map(({ descricaoComplementar: _d, midia: _m, ...p }) => p) });
  }
  const prod = path.match(/^\/produtos\/(\d+)$/);
  if (prod) {
    const p = bmock.products.get(Number(prod[1]));
    return p ? json({ data: p }) : json({ error: { message: "não encontrado" } }, 404);
  }
  if (path === "/estoques/saldos") {
    const ids = url.searchParams.getAll("idsProdutos[]").map(Number);
    return json({
      data: ids.map((id) => ({
        produto: { id },
        saldoVirtualTotal: bmock.products.get(id)?.estoque?.saldoVirtualTotal ?? 0,
      })),
    });
  }
  if (path === "/contatos" && method === "GET") {
    const doc = url.searchParams.get("numeroDocumento");
    return json({ data: bmock.contatos.filter((c) => c.numeroDocumento === doc).map((c) => ({ id: c.id })) });
  }
  if (path === "/contatos" && method === "POST") {
    const b = body as { numeroDocumento: string };
    const id = 7000 + bmock.contatos.length;
    bmock.contatos.push({ id, numeroDocumento: b.numeroDocumento, body });
    return json({ data: { id } }, 201);
  }
  if (path === "/pedidos/vendas" && method === "GET") {
    const nums = url.searchParams.getAll("numerosLojas[]");
    return json({
      data: bmock.pedidos.filter((p) => nums.includes(p.numeroLoja)).map((p) => ({ id: p.id, numero: p.numero })),
    });
  }
  if (path === "/pedidos/vendas" && method === "POST") {
    const b = body as Record<string, unknown>;
    const id = 9000 + bmock.pedidos.length;
    bmock.pedidos.push({ id, numero: 100 + bmock.pedidos.length, numeroLoja: String(b.numeroLoja), body: b });
    return json({ data: { id } }, 201);
  }
  const ped = path.match(/^\/pedidos\/vendas\/(\d+)$/);
  if (ped) {
    const p = bmock.pedidos.find((x) => x.id === Number(ped[1]));
    return p ? json({ data: { id: p.id, numero: p.numero } }) : json({}, 404);
  }
  if (path === "/categorias/produtos") return json({ data: [{ id: 55, descricao: "Cafés" }] });
  if (path === "/canais-venda") return json({ data: [{ id: 66, descricao: "Site", tipo: "Api", situacao: 1 }] });
  if (path === "/formas-pagamentos") return json({ data: [{ id: 77, descricao: "Mercado Pago", situacao: 1 }] });

  return json({ error: { message: `rota não simulada ${key}` } }, 404);
}

otherHosts.set("api.bling.com.br", handler);
