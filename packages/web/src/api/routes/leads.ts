import { z } from "zod";
import { base } from "../__core/app";
import { db } from "../database";
import * as schema from "../database/schema";
import { subscribeNewsletter } from "../services/newsletter";

export const leads = {
  create: base
    .input(
      z.object({
        kind: z.enum(["contato", "atacado", "clube", "newsletter", "lifestyle"]),
        name: z.string().min(2),
        email: z.email(),
        phone: z.string().optional(),
        company: z.string().optional(),
        plan: z.string().optional(),
        message: z.string().optional(),
      })
    )
    .handler(async ({ input }) => {
      // Somente opt-in explícito da newsletter; comprador/contato não vira inscrito.
      if (input.kind === "newsletter") await subscribeNewsletter(input.name, input.email);
      const [lead] = await db.insert(schema.leads).values(input).returning();
      return { id: lead.id, ok: true };
    }),
};
