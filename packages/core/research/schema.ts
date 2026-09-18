import {z} from 'zod';

const id = z.string().min(1);
const url = z.union([z.literal(''), z.url().refine(value => ['https:', 'http:'].includes(new URL(value).protocol), '仅支持网页链接')]);
export const sourceRegistrationSchema = z.object({id, environmentId: id, documentId: z.string().regex(/^[\w-]+$/), gid: z.string().regex(/^\d+$/), season: id, title: z.string(), enabled: z.boolean(), sampleMethod: z.string(), permissionNotes: z.string()});

export function researchEntrySchema(set: z.ZodType, draft: z.ZodType, field: z.ZodType) {
  const base = {id, revision: z.number().int().nonnegative(), updatedAt: z.string(), environmentId: id};
  const team = {draftId: id, snapshot: draft, opponentSpecies: z.array(id)};
  const selection = {selection: z.array(id), leads: z.array(id)};
  const route = z.object({id, name: id, ...selection, winCondition: z.string(), concerns: z.string(), status: z.enum(['idea', 'tested', 'rejected'])});
  return z.discriminatedUnion('kind', [
    z.object({...base, ...team, kind: z.literal('plan'), title: id, routes: z.array(route)}),
    z.object({...base, ...team, ...selection, kind: z.literal('match'), playedAt: z.string(), result: z.enum(['win', 'loss', 'tie', 'unknown']), category: z.enum(['practice', 'ranked', 'tournament']), reasons: z.array(id), notes: z.string(), replayUrl: url, planId: id.optional(), planContext: z.object({title: id, revision: z.number().int().nonnegative(), route}).optional()}),
    z.object({...base, draftId: id, kind: z.literal('condition'), title: id, attacker: set, defender: set, field, variants: z.array(z.object({name: id, defender: set.optional(), field}))}),
    z.object({...base, kind: z.literal('source'), sourceId: id, originalAuthor: z.string(), sharedBy: z.string(), parentSourceIds: z.array(id), maturity: z.enum(['unknown', 'early', 'tested']), changes: z.string(), intention: z.string(), evidence: z.array(z.object({url, quote: id}))}),
    z.object({...base, kind: z.literal('document'), url, title: id, author: z.string(), publishedAt: z.string(), sourceType: z.enum(['rmt', 'forum', 'social', 'guide', 'replay']), raw: z.string(), claims: z.array(z.object({quote: id, interpretation: z.string(), confirmed: z.boolean()})), sampleMethod: z.string(), replay: z.object({format: z.string(), players: z.array(z.string()), winner: z.string().nullable(), turns: z.number().int().nonnegative(), teams: z.array(z.object({side: id, species: z.array(id)}))}).optional()}),
    z.object({...base, kind: z.literal('preferences'), draftId: id, weights: z.object({pressure: z.number().nonnegative(), resilience: z.number().nonnegative(), speed: z.number().nonnegative(), coverage: z.number().nonnegative(), tailRisk: z.number().nonnegative()}), retainedConfigurationIds: z.array(id), allowHistorical: z.boolean().optional(), notes: z.string()}),
  ]);
}
