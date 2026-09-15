import {z} from 'zod';
import type {Method} from './types';
import {researchEntrySchema, sourceRegistrationSchema} from './research/schema';

const id = z.string().min(1);
const stats = z.object({hp: z.number().int().nonnegative(), atk: z.number().int().nonnegative(), def: z.number().int().nonnegative(), spa: z.number().int().nonnegative(), spd: z.number().int().nonnegative(), spe: z.number().int().nonnegative()});
const boosts = z.object({atk: z.number().int().min(-6).max(6), def: z.number().int().min(-6).max(6), spa: z.number().int().min(-6).max(6), spd: z.number().int().min(-6).max(6), spe: z.number().int().min(-6).max(6)}).partial();
export const setSchema = z.object({speciesId: id, itemId: z.string().nullable(), abilityId: z.string().nullable(), natureId: z.string().nullable(), points: stats.nullable(), moves: z.array(id), gender: z.enum(['M', 'F']).optional(), level: z.number().int().positive(), sourceKind: z.enum(['observed', 'historical', 'generated', 'manual']), sourceIds: z.array(id)});
const member = z.object({id, set: setSchema, lock: z.object({species: z.boolean(), fields: z.array(z.enum(['itemId', 'abilityId', 'natureId', 'moves', 'points']))})});
export const draftSchema = z.object({id, name: z.string(), revision: z.number().int().nonnegative(), analysisRevision: z.number().int().nonnegative(), environmentId: id, members: z.array(member), notes: z.string(), updatedAt: z.string()});
export const fieldSchema = z.object({weather: z.string().optional(), terrain: z.string().optional(), trickRoom: z.boolean().optional(), attackerTailwind: z.boolean().optional(), defenderTailwind: z.boolean().optional(), attackerMega: z.boolean().optional(), defenderMega: z.boolean().optional(), attackerBoosts: boosts.optional(), defenderBoosts: boosts.optional(), intimidateAttacker: z.boolean().optional(), intimidateDefender: z.boolean().optional(), helpingHand: z.boolean().optional(), reflect: z.boolean().optional(), lightScreen: z.boolean().optional(), friendGuard: z.boolean().optional(), defenderProtect: z.boolean().optional(), attackerStatus: z.string().optional(), defenderStatus: z.string().optional(), singleTarget: z.boolean().optional(), attackerHPPercent: z.number().positive().max(100).optional(), defenderHPPercent: z.number().positive().max(100).optional(), attackerItemConsumed: z.boolean().optional(), defenderItemConsumed: z.boolean().optional(), attackerAbilityActive: z.boolean().optional(), defenderAbilityActive: z.boolean().optional(), attackerFaintedAllies: z.number().int().nonnegative().optional(), defenderFaintedAllies: z.number().int().nonnegative().optional(), hits: z.number().int().positive().optional(), critical: z.boolean().optional(), defenderHelpingHand: z.boolean().optional(), attackerReflect: z.boolean().optional(), attackerLightScreen: z.boolean().optional(), attackerFriendGuard: z.boolean().optional(), attackerProtect: z.boolean().optional(), attackerAbilityId: id.optional(), defenderAbilityId: id.optional(), attackerItemId: z.string().optional(), defenderItemId: z.string().optional()});
const field = fieldSchema;
const metrics = z.object({pressure: z.number(), resilience: z.number(), speed: z.number(), coverage: z.number(), tailRisk: z.number()});
const proposal = z.object({id, draftId: id, inputHash: id, modelVersion: id, kind: z.enum(['add', 'complete', 'replace', 'spread']), title: z.string(), baseRevision: z.number().int().nonnegative(), environmentId: id, corpusVersion: id, algorithmVersion: id, members: z.array(member), benefits: z.array(z.string()), tradeoffs: z.array(z.string()), metrics, sourceUrls: z.array(z.string()), generated: z.boolean(), elapsedMs: z.number()});
const schemas: Record<Method, z.ZodType> = {
  documents: z.object({environmentId: id}), prepareDocument: z.object({environmentId: id, sourceType: z.enum(['rmt', 'forum', 'social', 'guide', 'replay']), url: z.string(), raw: z.string().optional()}).refine(value => !!value.raw?.trim() || /^https?:\/\//.test(value.url), '请输入公开来源链接或原文'),
  maintenance: z.undefined(), cleanStorage: z.object({planHash: id, analysisCache: z.boolean(), unusedVersions: z.boolean(), compact: z.boolean(), memoryCache: z.boolean()}),
  risk: z.object({environmentId: id, attacker: setSchema, defender: setSchema, field}),
  selections: z.object({draft: draftSchema, opponentSpecies: z.array(id).optional()}), roleKnowledge: z.object({environmentId: id}),
  scenarios: z.object({environmentId: id, attacker: setSchema, defender: setSchema, field, variants: z.array(z.object({name: id, defender: setSchema.optional(), field}))}),
  research: z.object({draftId: id, environmentId: id}), saveResearch: researchEntrySchema(setSchema, draftSchema, field), deleteResearch: z.object({id, revision: z.number().int().nonnegative()}),
  sources: z.object({environmentId: id}), saveSource: sourceRegistrationSchema,
  bootstrap: z.undefined(), environmentState: z.object({environmentId: id}), saveDraft: draftSchema, deleteDraft: z.object({id}), history: z.object({id}),
  parse: z.object({text: z.string(), environmentId: id}), export: draftSchema, validate: draftSchema, analyze: draftSchema,
  recommend: z.object({draft: draftSchema, kind: z.enum(['add', 'complete', 'replace']), memberId: id.optional(), limit: z.number().int().positive().optional(), options: z.object({candidateBudget: z.number().int().positive().optional(), beamWidth: z.number().int().positive().optional(), retainedConfigurationIds: z.array(id).optional(), allowHistorical: z.boolean().optional(), timeBudgetMs: z.number().positive().optional(), weights: metrics.optional()}).optional()}),
  optimizeSpread: z.object({draft: draftSchema, memberId: id, speedTarget: z.number().nonnegative().optional(), field: field.optional(), attackTarget: setSchema.optional(), attackMove: id.optional(), attackChance: z.number().positive().max(1).optional(), defendTarget: setSchema.optional(), defendMove: id.optional(), survivePercent: z.number().positive().optional(), speedBenchmark: z.object({opponent: setSchema, field, order: z.enum(['before', 'tie-or-before'])}).optional(), conditions: z.array(z.object({name: id, field, attackTarget: setSchema.optional(), defendTarget: setSchema.optional()})).optional(), previewOnly: z.boolean().optional()}),
  memberStats: z.object({environmentId: id, set: setSchema, field}),
  damage: z.object({attacker: setSchema, defender: setSchema, field, environmentId: id}),
  speed: z.object({draft: draftSchema, memberId: id, field}),
  posterior: z.object({speciesId: id, teammates: z.array(id), known: setSchema.partial().optional(), environmentId: id}),
  applyProposal: z.object({draft: draftSchema, proposal}),
  sync: z.object({sources: z.array(z.object({season: id, gid: z.string().regex(/^\d+$/), documentId: z.string().regex(/^[\w-]+$/).optional()})).min(1), environmentId: id}),
  checkUpdates: z.undefined(), prepareUpdate: z.object({source: z.enum(['official', 'local']), localPath: id.optional(), formatId: z.string().regex(/^[a-z0-9]+$/).optional()}),
  activateEnvironment: z.object({environmentId: id}), migrateDraft: z.object({draft: draftSchema, environmentId: id}),
  simulate: z.object({draft: draftSchema, opponentSpecies: z.array(id).optional(), opponentTeamId: id.optional(), opponentTeam: z.array(setSchema).optional(), allowHistoricalOpponents: z.boolean().optional(), seconds: z.number().positive(), seed: z.number().int(), mode: z.enum(['closed', 'open']), baseline: z.array(member).optional(), trials: z.number().int().positive().optional(), trainingTrials: z.number().int().nonnegative().optional(), strategy: z.enum(['pressure', 'control', 'mixed', 'damage', 'support']).optional(), opponentPolicies: z.array(z.enum(['pressure', 'control', 'mixed', 'damage', 'support'])).min(1).optional(), beliefSamples: z.number().int().positive().optional(), context: z.object({corpusVersion: id, modelVersion: id, algorithmVersion: id}).optional()}),
  replayJob: z.object({id}), cancelJob: z.object({id}), jobs: z.undefined(),
};

export function validateInput(method: string, input: unknown): unknown {
  if (!Object.hasOwn(schemas, method)) throw new Error(`未知操作：${method}`);
  const result = schemas[method as Method].safeParse(input);
  if (!result.success) throw new Error(`输入格式不正确：${result.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('；')}`);
  return result.data;
}
