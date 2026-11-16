/** Recarrega só a linha lifestyle, sem tocar em produtos/pedidos. */
import { db } from "./index";
import * as schema from "./schema";
import { seedMerch } from "./merch-data";

await db.delete(schema.merch);
for (const m of seedMerch) await db.insert(schema.merch).values(m);
const rows = await db.select().from(schema.merch);
console.log("merch:", rows.map((r) => `${r.slug}/${r.tone}/[${r.sizes.join(",")}]`).join(" | "));
