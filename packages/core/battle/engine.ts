import {createRequire} from 'node:module';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {STAT_KEYS, type Stats, type PokemonSet, type EngineManifest, type EnvironmentSnapshot, type DexData, type SpeciesData, type TeamDraft, type ValidationIssue, type BattleField, type DamageResult} from '../types';
import {complete, hash, toID, zeros, setKey} from '../domain';
import {hitCounts} from './hit-counts';

// Dynamic upstream modules are isolated here. Domain code uses the typed adapter.
const requireModule = createRequire(typeof __filename !== 'undefined' ? __filename : import.meta.url);
type Upstream = Record<string, any>;
export class BattleEngine {
  readonly ps: Upstream;
  readonly calc: Upstream;
  readonly dex: any;
  readonly format: any;
  readonly validator: any;
  readonly ruleTable: any;
  readonly manifest: EngineManifest;
  readonly generation: any;
  private damageCache = new Map<string, DamageResult[]>();
  cacheSize(): number {return this.damageCache.size;}
  constructor(readonly engineDirectory: string, readonly formatId: string, readonly translations: Record<string, string> = {}) {
    this.manifest = JSON.parse(readFileSync(join(engineDirectory, 'manifest.json'), 'utf8'));
    this.ps = requireModule(join(engineDirectory, 'showdown/dist/sim/index.js'));
    this.calc = requireModule(join(engineDirectory, 'calc.cjs'));
    // The untrusted get() API silently drops invalid custom rules. Validate first so updates fail visibly.
    this.format = this.ps.Dex.formats.get(this.ps.Dex.formats.validate(formatId), true);
    if (!this.format.exists || !this.format.mod.startsWith('champions') || this.format.gameType !== 'doubles') throw new Error(`不支持的 Champions 双打格式：${formatId}`);
    this.dex = this.ps.Dex.forFormat(this.format);
    this.validator = this.ps.TeamValidator.get(formatId);
    this.ruleTable = this.dex.formats.getRuleTable(this.format);
    this.generation = this.calcGeneration();
  }

  name(kind: 'species' | 'moves' | 'items' | 'abilities' | 'natures', id: string): string {return this.dex[kind].get(id).name;}
  zh(name: string): string {return this.translations[name] ?? name;}
  display(id: string): string {return this.zh(this.dex.species.get(id).name);}
  initialSpeciesId(id: string): string {
    const species = this.dex.species.get(id);
    if (typeof species.battleOnly === 'string') return toID(species.battleOnly);
    if (species.isMega) return toID(species.changesFrom || species.baseSpecies);
    return species.id;
  }
  formats(): {id: string; name: string}[] {
    return this.ps.Dex.formats.all().filter((f: any) => f.mod?.startsWith('champions') && f.gameType === 'doubles' && /VGC/.test(f.name) && !/Bo3/.test(f.name)).map((f: any) => ({id: f.id, name: f.name}));
  }

  toPS(set: PokemonSet, requireComplete = true): any {
    if (requireComplete && !complete(set)) throw new Error(`${this.display(set.speciesId)} 的配置不完整，不能用于精算。`);
    const adjustLevel = this.ruleTable.adjustLevelDown && set.level >= this.ruleTable.adjustLevelDown ? this.ruleTable.adjustLevelDown : this.ruleTable.adjustLevel;
    return {
      name: this.name('species', set.speciesId), species: this.name('species', set.speciesId),
      item: set.itemId === null ? '' : this.name('items', set.itemId),
      ability: set.abilityId === null ? '' : this.name('abilities', set.abilityId),
      nature: set.natureId === null ? '' : this.name('natures', set.natureId),
      evs: set.points ? {...set.points} : undefined, ivs: {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31},
      // Battle does not run TeamValidator. Pass the format's level adjustment explicitly,
      // while retaining the submitted level so validation can still reject invalid input.
      moves: set.moves.map(m => this.name('moves', m)), level: set.level, adjustLevel: adjustLevel || undefined, gender: set.gender,
    };
  }

  parse(text: string, kind: PokemonSet['sourceKind'] = 'manual'): {sets: PokemonSet[]; issues: string[]} {
    const blocks = text.trim().split(/\r?\n\s*\r?\n/).filter(b => b.trim() && !b.trim().startsWith('==='));
    const sets: PokemonSet[] = [];
    const issues: string[] = [];
    for (const [i, block] of blocks.entries()) {
      const cleaned = block.replace(/^Points:/gm, 'EVs:');
      const imported = this.ps.Teams.import(cleaned);
      if (!imported?.length) {issues.push(`第 ${i + 1} 段没有可识别的 Showdown 配置。`); continue;}
      const p = imported[0];
      const species = this.dex.species.get(p.species);
      if (!species.exists) {issues.push(`未知宝可梦：${p.species}`); continue;}
      const set: PokemonSet = {
        speciesId: species.id, itemId: toID(p.item || ''), abilityId: /^Ability:/m.test(cleaned) ? toID(p.ability) : null,
        natureId: / Nature\s*$/m.test(cleaned) ? toID(p.nature) : null,
        points: /^EVs:/m.test(cleaned) ? {...zeros(), ...p.evs} : null,
        moves: p.moves.map((name: string) => this.dex.moves.get(name).id), gender: p.gender || undefined,
        level: /^Level:/m.test(cleaned) ? p.level : this.ruleTable.adjustLevel || this.ruleTable.defaultLevel, sourceKind: kind, sourceIds: [],
      };
      // Imported Mega-only forms cannot erase the original switch-in ability.
      if (species.isMega) {
        const base = this.dex.species.get(this.initialSpeciesId(species.id));
        const ability = this.dex.abilities.get(set.abilityId ?? '');
        if (!Object.values(base.abilities).some(a => toID(String(a)) === ability.id)) {
          issues.push(`${species.name} 需要补充 Mega 前的特性。`);
          set.abilityId = null;
        }
        set.speciesId = base.id;
      }
      sets.push(set);
    }
    return {sets, issues};
  }

  export(sets: PokemonSet[]): string {
    return sets.map(set => {
      const label = this.name('species', set.speciesId) + (set.gender ? ` (${set.gender})` : '');
      const lines = [label + (set.itemId ? ` @ ${this.name('items', set.itemId)}` : '')];
      if (set.abilityId) lines.push(`Ability: ${this.name('abilities', set.abilityId)}`);
      lines.push(`Level: ${set.level}`);
      const statLabels = {hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe'};
      if (set.points) lines.push(`EVs: ${STAT_KEYS.filter(k => set.points![k] > 0).map(k => `${set.points![k]} ${statLabels[k]}`).join(' / ') || '0 HP'}`);
      if (set.natureId) lines.push(`${this.name('natures', set.natureId)} Nature`);
      lines.push(...set.moves.map(m => `- ${this.name('moves', m)}`));
      return lines.join('\n');
    }).join('\n\n') + '\n';
  }

  validateSet(set: PokemonSet): string[] {
    if (!complete(set)) return ['配置存在未知字段或不足四个招式。'];
    const numbers = STAT_KEYS.map(k => set.points![k]);
    if (numbers.some(n => !Number.isInteger(n) || n < 0)) return ['配点必须是非负整数。'];
    return this.validator.validateSet(this.toPS(set)) ?? [];
  }

  validateKnownSet(set: PokemonSet): string[] {
    if (complete(set)) return this.validateSet(set);
    const species = this.dex.species.get(set.speciesId);
    if (!species.exists) return [`未知物种：${set.speciesId}`];
    const raw = this.toPS(set, false);
    const errors: string[] = [];
    const speciesProblem = this.validator.checkSpecies(raw, species, species, {});
    if (speciesProblem) errors.push(speciesProblem);
    if (set.points && (STAT_KEYS.some(stat => !Number.isInteger(set.points![stat]) || set.points![stat] < 0 || set.points![stat] > 32) || Object.values(set.points).reduce((sum, n) => sum + n, 0) > this.ruleTable.evLimit)) errors.push('已提供的能力点超出规则范围。');
    if (set.itemId !== null) {
      const item = this.dex.items.get(set.itemId);
      if (set.itemId && !item.exists) errors.push(`未知道具：${set.itemId}`);
      const problem = this.validator.checkItem(raw, item, {}); if (problem) errors.push(problem);
    }
    if (set.abilityId !== null && !Object.values(species.abilities).some(ability => toID(String(ability)) === set.abilityId)) errors.push(`${species.name} 不能拥有所提供的特性。`);
    if (set.natureId !== null && !this.dex.natures.get(set.natureId).exists) errors.push('所提供的性格不存在。');
    if (new Set(set.moves).size !== set.moves.length || set.moves.length > this.ruleTable.maxMoveCount) errors.push('已知招式重复或超出规则数量。');
    if (errors.length || !set.moves.length) return errors;
    // Existential legality witness only: validator defaults are never saved or used for statistics/damage.
    const abilities = set.abilityId === null ? Object.values(species.abilities) as string[] : [this.name('abilities', set.abilityId)];
    const natures = set.natureId === null ? this.dex.natures.all().map((nature: any) => nature.name) as string[] : [raw.nature];
    const problems = new Set<string>();
    for (const ability of abilities) for (const nature of natures) {
      const check = this.validator.validateSet({...structuredClone(raw), ability, nature});
      if (!check?.length) return [];
      for (const problem of check) problems.add(problem);
    }
    return [...problems];
  }

  validateDraft(draft: TeamDraft): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    for (const m of draft.members) {
      if (!complete(m.set)) {issues.push({memberId: m.id, severity: 'incomplete', message: '请补全配点、性格、特性和四个招式。'}); continue;}
      issues.push(...this.validateSet(m.set).map(message => ({memberId: m.id, severity: 'error' as const, message})));
    }
    const species = draft.members.map(m => this.dex.species.get(m.set.speciesId).baseSpecies);
    if (this.ruleTable.has('speciesclause') && new Set(species).size !== species.length) issues.push({severity: 'error', message: '当前规则不允许重复物种。'});
    const items = draft.members.map(m => m.set.itemId).filter(Boolean);
    if (this.ruleTable.has('itemclause') && new Set(items).size !== items.length) issues.push({severity: 'error', message: '当前规则不允许重复携带相同道具。'});
    if (draft.members.length > this.ruleTable.maxTeamSize) issues.push({severity: 'error', message: `队伍最多 ${this.ruleTable.maxTeamSize} 只。`});
    if (draft.members.length < this.ruleTable.minTeamSize) issues.push({severity: 'incomplete', message: `还需要 ${this.ruleTable.minTeamSize - draft.members.length} 只宝可梦。`});
    if (!issues.length) issues.push(...(this.validator.validateTeam(draft.members.map(m => this.toPS(m.set))) ?? []).map((message: string) => ({severity: 'error' as const, message})));
    return issues;
  }

  legalSpecies(): any[] {
    return this.dex.species.all().filter((s: any) => s.exists && s.num > 0 && !s.battleOnly && !s.isMega && !s.isPrimal && !this.validator.checkSpecies({species: s.name, item: ''}, s, s, {}));
  }

  snapshot(verified = false): EnvironmentSnapshot {
    const speciesIds = this.legalSpecies().map(s => s.id).sort();
    const rules = [...this.ruleTable.keys()].sort() as string[];
    const ruleHash = hash({rules, values: [...this.ruleTable.valueRules], speciesIds, source: this.manifest.hashes.showdown});
    return {
      id: `${this.formatId}-${hash([ruleHash, this.manifest.id, this.manifest.hashes.calc])}`, engineId: this.manifest.id, formatId: this.formatId, name: this.format.name,
      season: this.format.name.match(/Reg\s+(M-[A-Z]+)/)?.[1] ?? this.format.id,
      mod: this.format.mod, rules, ruleHash, generatedAt: new Date().toISOString(), sourceRevision: this.manifest.showdownRevision,
      calcRevision: this.manifest.calcRevision, points: {total: this.ruleTable.evLimit, perStat: 32},
      teamSize: this.ruleTable.maxTeamSize, pickedTeamSize: this.ruleTable.pickedTeamSize, speciesIds, verified,
    };
  }

  dexData(): DexData {
    const named = (row: any) => ({id: row.id, name: row.name, zh: this.zh(row.name), description: this.zh(row.shortDesc || row.desc || '')});
    const species: SpeciesData[] = this.legalSpecies().map(s => {
      const learnsets = this.dex.species.getFullLearnset(s.id);
      const moves = [...new Set<string>(learnsets.flatMap((entry: any) => Object.keys(entry.learnset)))].filter(m => this.dex.moves.get(m).exists && !this.dex.moves.get(m).isNonstandard);
      const megaForms = this.dex.items.all().filter((i: any) => i.megaStone?.[s.name] && !i.isNonstandard).map((i: any) => {
        const mega = this.dex.species.get(i.megaStone[s.name]);
        return {speciesId: mega.id, itemId: i.id, abilityId: toID(mega.abilities['0']), name: mega.name, zh: this.zh(mega.name), types: [...mega.types], stats: {...mega.baseStats}};
      });
      return {...named(s), baseSpeciesId: toID(s.baseSpecies), types: [...s.types], stats: {...s.baseStats}, abilities: Object.values(s.abilities).map(v => toID(String(v))), moves, megaForms};
    });
    return {
      species,
      items: this.dex.items.all().filter((r: any) => !r.isNonstandard && !this.validator.checkItem({species: 'Rillaboom'}, r, {})).map(named),
      abilities: this.dex.abilities.all().filter((r: any) => !r.isNonstandard).map(named),
      moves: this.dex.moves.all().filter((r: any) => !r.isNonstandard).map((r: any) => ({...named(r), type: r.type, category: r.category, basePower: r.basePower, priority: r.priority, target: r.target, accuracy: r.accuracy})),
      natures: this.dex.natures.all().map((r: any) => ({...named(r), plus: r.plus, minus: r.minus})),
    };
  }

  private calcGeneration(): any {
    const base = this.calc.Generations.get(0);
    const overlay = (kind: string) => {
      // Metadata belongs to this engine snapshot; the calc clones combat state.
      const rows = new Map<string, any>();
      return {
        get: (id: string) => {
          if (rows.has(id)) return rows.get(id);
          const old = base[kind].get(id);
          const current = this.dex[kind].get(id);
          if (!current.exists) return undefined;
          if (!old && ['moves', 'abilities', 'items'].includes(kind)) throw new Error(`伤害引擎尚未支持 ${current.name}；请更新并验证引擎。`);
          const row = kind === 'species' ? {...old, kind: 'Species', id: current.id, name: current.name, baseStats: {...current.baseStats}, types: current.types, weightkg: current.weightkg, abilities: current.abilities, otherFormes: current.otherFormes, baseSpecies: current.baseSpecies} : {...old, ...current};
          rows.set(id, row);
          return row;
        },
        *[Symbol.iterator]() {yield* base[kind];},
      };
    };
    const typeRows = this.dex.types.all();
    const types = new Map<string, any>(typeRows.map((type: any) => [type.id, {
      ...base.types.get(type.id), kind: 'Type', id: type.id, name: type.name,
      effectiveness: {...base.types.get(type.id)?.effectiveness, ...Object.fromEntries(typeRows.map((defender: any) => [defender.name,
        this.dex.getImmunity(type.name, defender.name) ? Math.pow(2, this.dex.getEffectiveness(type.name, defender.name)) : 0]))},
    }]));
    // Struggle is typeless in battle. Showdown implements it on the move, outside its type chart.
    types.set('', {...base.types.get(''), effectiveness: Object.fromEntries(typeRows.map((type: any) => [type.name, 1]))});
    return {num: 0, species: overlay('species'), moves: overlay('moves'), abilities: overlay('abilities'), items: overlay('items'), natures: overlay('natures'), types: {get: (id: string) => types.get(id), *[Symbol.iterator]() {yield* types.values();}}};
  }

  pokemon(set: PokemonSet, mega = true, boosts: Partial<Stats> = {}, status?: string): any {
    if (!set.points || !set.natureId) throw new Error('能力值计算需要已知的能力点与性格。');
    // Move slots do not affect stats; incomplete moves must not block live editing.
    const raw = this.toPS(set, false);
    const item = this.dex.items.get(set.itemId || '');
    const species = this.dex.species.get(set.speciesId);
    const megaName = mega ? item.megaStone?.[species.name] : null;
    const form = megaName ? this.dex.species.get(megaName) : species;
    const pokemon = new this.calc.Pokemon(this.generation, form.name, {...raw, ability: megaName ? form.abilities['0'] : raw.ability, evs: {...set.points}, boosts: {...boosts}, status});
    // Intimidate is an entry event, not a permanent property of every damage query.
    if (pokemon.ability === 'Intimidate') pokemon.abilityOn = false;
    return pokemon;
  }
  stats(set: PokemonSet, mega = false): Stats {return {...this.pokemon(set, mega).rawStats};}

  private fieldPokemon(set: PokemonSet, field: BattleField, side: 'attacker' | 'defender'): any {
    if (set.itemId === null || set.abilityId === null) throw new Error('对局计算需要已知的道具与特性。');
    const lostShieldForm = field[`${side}AbilityActive`] === false ? ({mimikyu: 'mimikyubusted', eiscue: 'eiscuenoice'} as Record<string, string>)[set.speciesId] : undefined;
    const currentSet = lostShieldForm ? {...set, speciesId: lostShieldForm} : set;
    const pokemon = this.pokemon(currentSet, field[`${side}Mega`] ?? true, field[`${side}Boosts`], field[`${side}Status`]);
    const abilityId = field[`${side}AbilityId`]; const itemId = field[`${side}ItemId`];
    if (abilityId !== undefined) {if (!this.dex.abilities.get(abilityId).exists) throw new Error(`未知特性状态：${abilityId}`); pokemon.ability = this.name('abilities', abilityId);}
    if (itemId !== undefined) {if (itemId && !this.dex.items.get(itemId).exists) throw new Error(`未知道具状态：${itemId}`); pokemon.item = itemId ? this.name('items', itemId) : '';}
    // The calc consumes terrain seeds, but Unburden's activation belongs to battle state.
    if (pokemon.ability === 'Unburden' && field.terrain && pokemon.item === `${field.terrain} Seed`) pokemon.abilityOn = true;
    if (pokemon.ability === 'Slow Start') pokemon.abilityOn = true;
    const health = field[`${side}HPPercent`];
    if (health !== undefined) {
      if (!(health > 0 && health <= 100)) throw new Error('当前 HP 百分比必须大于 0 且不超过 100。');
      pokemon.originalCurHP = Math.max(1, Math.floor(pokemon.rawStats.hp * health / 100));
    }
    if (field[`${side}ItemConsumed`]) {pokemon.item = ''; if (pokemon.ability === 'Unburden') pokemon.abilityOn = true;}
    if (field[`${side}AbilityActive`] !== undefined) pokemon.abilityOn = field[`${side}AbilityActive`];
    pokemon.alliesFainted = field[`${side}FaintedAllies`] ?? 0;
    return pokemon;
  }

  speeds(attacker: PokemonSet, defender: PokemonSet, field: BattleField = {}): {attacker: number; defender: number} {
    const a = this.fieldPokemon(attacker, field, 'attacker');
    const d = this.fieldPokemon(defender, field, 'defender');
    const result = this.calc.calculate(this.generation, a, d, new this.calc.Move(this.generation, 'Protect'), new this.calc.Field({
      gameType: 'Doubles', weather: field.weather, terrain: field.terrain,
      attackerSide: {isTailwind: field.attackerTailwind}, defenderSide: {isTailwind: field.defenderTailwind},
    }));
    return {attacker: result.attacker.stats.spe, defender: result.defender.stats.spe};
  }

  damage(attacker: PokemonSet, defender: PokemonSet, field: BattleField = {}, moves: readonly string[] = attacker.moves): DamageResult[] {
    const key = `${setKey(attacker)}>${setKey(defender)}:${JSON.stringify(field)}:${moves.join(',')}`;
    const cached = this.damageCache.get(key);
    if (cached) return cached;
    const a = this.fieldPokemon(attacker, field, 'attacker');
    const d = this.fieldPokemon(defender, field, 'defender');
    const intimidate = (target: any, source: any) => {
      // Let the same Champions implementation resolve immunity, Contrary, Defiant and Competitive.
      const trigger = source.clone(); trigger.ability = 'Intimidate'; trigger.abilityOn = true;
      const event = this.calc.calculate(this.generation, trigger, target.clone(), new this.calc.Move(this.generation, 'Protect'), new this.calc.Field());
      target.boosts = {...event.defender.boosts};
    };
    if (field.intimidateAttacker) intimidate(a, d);
    if (field.intimidateDefender) intimidate(d, a);
    const results = moves.map(moveId => {
      const counts = hitCounts(this.dex.moves.get(moveId).multihit, a.ability, a.item, field.hits);
      const move = new this.calc.Move(this.generation, this.name('moves', moveId), {ability: a.ability, item: a.item, hits: counts.at(-1)!.hits, isCrit: field.critical});
      const battleField = new this.calc.Field({
        gameType: field.singleTarget ? 'Singles' : 'Doubles', weather: field.weather, terrain: field.terrain,
        attackerSide: {isHelpingHand: field.helpingHand, isTailwind: field.attackerTailwind},
        defenderSide: {isReflect: field.reflect, isLightScreen: field.lightScreen, isFriendGuard: field.friendGuard, isProtected: field.defenderProtect, isTailwind: field.defenderTailwind},
      });
      const result = this.calc.calculate(this.generation, a, d, move, battleField);
      const hp = d.rawStats.hp;
      const ability = result.defender.ability;
      const distribution = new Map<number, number>(); let ohko = 0; let hits = 1;
      for (const count of counts) {
        const rolled = counts.length === 1 ? result : this.calc.calculate(this.generation, a, d, new this.calc.Move(this.generation, move.name, {ability: a.ability, item: a.item, hits: count.hits, isCrit: field.critical}), battleField);
        const chunks = hitDistributions(rolled.damage, rolled.move.hits || 1);
        if (chunks[0].some(v => v > 0) && ability === 'Disguise' && !/Busted/.test(result.defender.name) && field.defenderAbilityActive !== false) chunks[0] = [Math.floor(hp / 8)];
        if (chunks[0].some(v => v > 0) && ability === 'Ice Face' && !/Noice/.test(result.defender.name) && result.move.category === 'Physical' && field.defenderAbilityActive !== false) chunks[0] = [0];
        for (const [damage, probability] of convolve(chunks)) distribution.set(damage, (distribution.get(damage) ?? 0) + probability * count.probability);
        ohko += count.probability * directKO(chunks, hp, result.defender.item, ability, result.attacker.ability, d.curHP());
        hits = Math.max(hits, chunks.length);
      }
      const rolls = [...distribution.keys()].sort((a, b) => a - b);
      const min = rolls[0]; const max = rolls.at(-1)!;
      return {moveId, rolls, min, max, defenderHP: hp, currentHP: d.curHP(), expectedDamage: [...distribution].reduce((sum, [damage, probability]) => sum + damage * probability, 0), hitCounts: counts, minPercent: min / hp * 100, maxPercent: max / hp * 100, ohko: Math.min(1, ohko), description: max > 0 ? `${result.attacker.name} (${result.attacker.ability}, ${result.attacker.item || 'No item'}) ${move.name} → ${result.defender.name} (${ability}, ${result.defender.item || 'No item'}): ${result.moveDesc()}` : `${move.name}：当前条件下无直接伤害`, hits, condition: `我方 ${a.curHP()}/${a.rawStats.hp} HP；对手 ${d.curHP()}/${hp} HP；${counts.length > 1 ? `按连击分布 ${counts.map(c => `${c.hits} 次 ${(100 * c.probability).toFixed(0)}%`).join(' / ')}` : hits > 1 ? `按 ${hits} 次全部命中` : '招式命中'}；${result.move.isCrit ? '要害' : '非要害'}；不含回合末伤害`};
    });
    this.damageCache.set(key, results);
    return results;
  }
}

export function hitDistributions(damage: number | number[] | number[][], hits: number): number[][] {
  if (typeof damage === 'number') return [[damage]];
  if (Array.isArray(damage[0])) return (damage as number[][]).map(row => [...row]);
  if (damage.length < 16) return (damage as number[]).map(d => [d]);
  return Array.from({length: hits}, () => [...damage as number[]]);
}
export function convolve(chunks: number[][]): Map<number, number> {
  let totals = new Map([[0, 1]]);
  for (const chunk of chunks) {
    const next = new Map<number, number>();
    for (const [total, probability] of totals) for (const roll of chunk) next.set(total + roll, (next.get(total + roll) || 0) + probability / chunk.length);
    totals = next;
  }
  return totals;
}
export function directKO(chunks: number[][], hp: number, item: string, ability: string, attackerAbility = '', initialHP = hp): number {
  // Track HP and consumed healing items between actual hits. End-of-turn weather is excluded.
  let states = new Map<string, number>([[`${initialHP}:0`, 1]]);
  for (const chunk of chunks) {
    const next = new Map<string, number>();
    for (const [key, probability] of states) {
      const [currentHP, used] = key.split(':').map(Number);
      if (currentHP === 0) {next.set(key, (next.get(key) || 0) + probability); continue;}
      for (const damage of chunk) {
        let remaining = Math.max(0, currentHP - damage); let consumed = used;
        if (currentHP === hp && remaining === 0 && (item === 'Focus Sash' && !used || ability === 'Sturdy')) {remaining = 1; if (item === 'Focus Sash') consumed = 1;}
        if (remaining > 0 && !used && !['Unnerve', 'As One (Glastrier)', 'As One (Spectrier)'].includes(attackerAbility)) {
          if (item === 'Sitrus Berry' && remaining <= Math.floor(hp / 2)) {remaining = Math.min(hp, remaining + Math.floor(hp / 4) * (ability === 'Ripen' ? 2 : 1)); consumed = 1;}
          else if (item === 'Oran Berry' && remaining <= Math.floor(hp / 2)) {remaining = Math.min(hp, remaining + (ability === 'Ripen' ? 20 : 10)); consumed = 1;}
          else if (['Figy Berry', 'Wiki Berry', 'Mago Berry', 'Aguav Berry', 'Iapapa Berry'].includes(item) && remaining <= Math.floor(hp / (ability === 'Gluttony' ? 2 : 4))) {remaining = Math.min(hp, remaining + Math.floor(hp / 3) * (ability === 'Ripen' ? 2 : 1)); consumed = 1;}
        }
        const probabilityOfRoll = probability / chunk.length;
        if (remaining === 0 && item === 'Focus Band') {const aliveKey = `1:${consumed}`; next.set(aliveKey, (next.get(aliveKey) || 0) + probabilityOfRoll * 0.1);}
        const state = `${remaining}:${consumed}`; next.set(state, (next.get(state) || 0) + probabilityOfRoll * (remaining === 0 && item === 'Focus Band' ? 0.9 : 1));
      }
    }
    states = next;
  }
  if ([...states.keys()].every(key => key.startsWith('0:'))) return 1;
  const chance = [...states].filter(([key]) => key.startsWith('0:')).reduce((sum, [, probability]) => sum + probability, 0);
  return Math.min(1, Math.max(0, chance));
}
