import { useQueryClient } from "@tanstack/react-query";
import { useRetryPublication } from "../queries/admin";
import { Spinner } from "./primitives";

/** Estado operacional explícito: anúncio salvo não significa produto confirmado no ERP. */
export function ProductPublication({ token, kind, row }: {
  token: string;
  kind: "coffee" | "merch";
  row: { id: number; blingId: number | null; sku: string | null; publicationStatus: string; publicationError: string | null };
}) {
  const qc = useQueryClient();
  const retry = useRetryPublication();
  const pending = !["legacy", "ready"].includes(row.publicationStatus);
  return <div className="w-full space-y-2 text-xs">
    <p className={pending ? "text-gold" : "text-cream/45"}>
      {pending ? "Rascunho · fora da loja até confirmar no Bling" : row.blingId ? `Bling #${row.blingId}` : "Cadastro anterior · sem vínculo"}
      {row.sku ? ` · SKU ${row.sku}` : ""}
    </p>
    {row.publicationError && <p role="alert" className="break-words text-red">{row.publicationError}</p>}
    {pending && <button type="button" disabled={retry.isPending}
      onClick={() => retry.mutate({ token, kind, id: row.id }, {
        onSuccess: () => { void qc.invalidateQueries(); },
      })}
      className="label flex items-center gap-2 border border-gold/40 px-3 py-2 text-[9px] text-gold disabled:opacity-40">
      {retry.isPending && <Spinner />}{retry.isPending ? "Conferindo no Bling…" : "Tentar novamente no Bling"}
    </button>}
    {retry.error && <p role="alert" className="text-red">{retry.error.message}</p>}
  </div>;
}