import { z } from 'zod';
import { isCard, REACTIONS, type Card, type ClientMsg } from '@judgement/engine';

const card = z.string().refine(isCard).transform((c) => c as Card);

const schema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('setSettings'),
    startCards: z.number().int().min(1).max(17).optional(),
    tracker: z.boolean().optional(),
    turnTimer: z.union([z.literal(0), z.literal(30), z.literal(60)]).optional(),
    scoring: z.enum(['classic', 'stakes']).optional(),
  }),
  z.object({ type: z.literal('addBot') }),
  z.object({ type: z.literal('removeMember'), id: z.string().max(40) }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('bid'), bid: z.number().int().min(0).max(17) }),
  z.object({ type: z.literal('play'), card }),
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('voteWait') }),
  z.object({ type: z.literal('autoplay'), id: z.string().max(40), on: z.boolean() }),
  z.object({ type: z.literal('endGame') }),
  z.object({ type: z.literal('react'), emoji: z.enum(REACTIONS) }),
  z.object({ type: z.literal('rematch') }),
  z.object({ type: z.literal('leave') }),
]);

export function parseClientMsg(raw: unknown): ClientMsg | null {
  if (typeof raw !== 'string' || raw.length > 2000) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const res = schema.safeParse(json);
  return res.success ? (res.data as ClientMsg) : null;
}
