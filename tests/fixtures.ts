import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {BootstrapData, PokemonSet} from '../packages/core/types';
import {BattleEngine} from '../packages/core/battle/engine';
import {MetaModel} from '../packages/core/analysis/model';
import {createDraft, member} from '../packages/core/domain';
export const bootstrap: BootstrapData = JSON.parse(readFileSync(resolve('assets/bootstrap.json'), 'utf8'));
export const engine = new BattleEngine(resolve('assets/engines', bootstrap.engine.id), bootstrap.environment.formatId, bootstrap.translations);
export const meta = new MetaModel(bootstrap.corpus, bootstrap.model, bootstrap.environment.season);
export function observed(species: string, predicate: (set: PokemonSet) => boolean = () => true): PokemonSet {const row = bootstrap.model.archetypes.find(a => a.speciesId === species && predicate(a.representative)); if (!row) throw new Error(`测试需要真实合法配置：${species}`); return structuredClone(row.representative);}
export function fullDraft(url = '73e5d6533b781089') {const team = bootstrap.corpus.teams.find(t => t.url.includes(url)); if (!team) throw new Error(`测试来源不存在：${url}`); return {...createDraft(engine.snapshot().id), members: engine.parse(team.raw).sets.map(member)};}
