import type {BattleEngine} from './engine';
import type {MetaModel} from '../analysis/model';
import type {PokemonSet, SimulationRequest, SimulationResult, TeamMember} from '../types';
import {ALGORITHM_VERSION, complete, draftHash, hash, sample, seededRandom} from '../domain';
import {InformationTree, legalActions, policyAction, type OpponentPolicy} from './policy';
import {observe, publicLog} from './observation';
import {beliefActions, type PolicyEvidence} from './belief-policy';
import {informationKey} from './information-state';
import type {PreviewPolicy} from './preview-policy';
import {opponentSources} from '../analysis/evidence';

export interface SimulationControl {cancelled: () => boolean; progress: (message: string, result?: SimulationResult) => void; preview: PreviewPolicy; createTree?: () => InformationTree}
interface GameResult {reward: number | null; turns: number; selected: number[]; trace: string[]; path: {key: string; command: string}[]; decisions: {turn: number; side: string; command: string; informationKey: string}[]; beliefEvidence: PolicyEvidence}
interface Opponent {id: string; sets: PokemonSet[]}
export class BattleRunError extends Error {
  constructor(cause: unknown, readonly failure: {seed: number; turn: number; trace: string[]}) {super(`${cause instanceof Error ? cause.message : String(cause)}（种子 ${failure.seed}，回合 ${failure.turn}）`, {cause});}
}

export function drawHiddenTeam(meta: MetaModel, engine: BattleEngine, species: string[], random: () => number, cancelled = () => false): PokemonSet[] {
  const bases = species.map(id => engine.dex.species.get(id).baseSpecies);
  if (engine.ruleTable.has('speciesclause') && new Set(bases).size !== bases.length) throw new Error('对手重复使用相同基础物种，违反物种条款。');
  const choices = species.map(id => meta.configurationPosterior(id, species).map(p => ({set: meta.configurationById.get(p.configurationId)!.set, weight: p.probability})));
  if (choices.some(c => !c.length)) throw new Error(`以下物种缺少合法配置观察：${species.filter((_, i) => !choices[i].length).map(s => engine.display(s)).join('、')}`);
  const walk = (position: number, chosen: PokemonSet[]): PokemonSet[] | null => {
    if (cancelled()) throw new Error('任务已取消。');
    if (position === choices.length) return engine.validator.validateTeam(chosen.map(s => engine.toPS(s))) ? null : chosen;
    let candidates = choices[position].filter(c => !engine.ruleTable.has('itemclause') || !c.set.itemId || !chosen.some(s => s.itemId === c.set.itemId));
    while (candidates.length) {const next = sample(candidates, candidates.map(c => c.weight), random); const result = walk(position + 1, [...chosen, next.set]); if (result) return result; candidates = candidates.filter(c => c !== next);}
    return null;
  };
  const result = walk(0, []);
  if (!result) throw new Error('对手的配置后验与物种／道具规则冲突，没有合法联合配置。');
  return result;
}

export function runGame(options: {
  engine: BattleEngine; own: PokemonSet[]; opponent: PokemonSet[]; seed: number; tree: InformationTree;
  training: boolean; policy: OpponentPolicy; mode: 'closed' | 'open'; stop: () => boolean;
  meta?: MetaModel; ownPolicy?: OpponentPolicy; beliefSamples?: number;
  preview: PreviewPolicy; previewSeed: number;
}): GameResult {
  const {engine, own, opponent, tree, training} = options;
  const random = seededRandom(options.seed ^ 0x41c64e6d);
  const opponentRandom = seededRandom(options.seed ^ 0x6a09e667);
  const battleRandom = seededRandom(options.seed);
  let format = engine.format;
  if (options.mode === 'closed' && engine.ruleTable.has('openteamsheets')) {
    const rules = [...(engine.format.customRules ?? []), '!Open Team Sheets'];
    const id = engine.ps.Dex.formats.validate(`${engine.format.id}@@@${rules.join(',')}`);
    format = engine.ps.Dex.formats.get(id, true);
  }
  const battle = new engine.ps.Battle({format, seed: Array.from({length: 4}, () => Math.floor(battleRandom() * 65536)), p1: {name: '构筑方案', team: own.map(s => engine.toPS(s))}, p2: {name: '对照策略', team: opponent.map(s => engine.toPS(s))}});
  const path: {key: string; command: string}[] = [];
  const decisions: GameResult['decisions'] = [];
  const beliefEvidence: PolicyEvidence = {beliefs: 0, generated: 0, queries: 0};
  let selected: number[] = [];
  const sheet = (sets: PokemonSet[]) => options.mode === 'open' ? sets.map(({speciesId, moves, abilityId, itemId}) => ({speciesId, moves, abilityId, itemId})) : undefined;
  const observation = (side: 'p1' | 'p2') => observe(side, battle[side].activeRequest, publicLog(battle.log), (side === 'p1' ? opponent : own).map(s => s.speciesId), sheet(side === 'p1' ? opponent : own));
  const actionsFor = (side: 'p1' | 'p2', observed = observation(side)) => {
    const policy = side === 'p1' ? options.ownPolicy ?? 'mixed' : options.policy;
    const actions = legalActions(engine, observed, policy);
    if (observed.request?.teamPreview) {
      const result = options.preview({observation: observed, own: side === 'p1' ? own : opponent, actions, seed: options.previewSeed, samples: options.beliefSamples ?? 4});
      for (const key of ['beliefs', 'generated', 'queries'] as const) beliefEvidence[key] += result.evidence[key];
      return result.actions;
    }
    if (!['damage', 'support'].includes(policy)) return actions;
    if (!options.meta) throw new Error('伤害与支援策略需要显式提供配置模型。');
    const result = beliefActions({engine, meta: options.meta, observation: observed, own: side === 'p1' ? own : opponent, actions, policy, random: side === 'p1' ? random : opponentRandom, samples: options.beliefSamples ?? 4});
    for (const key of ['beliefs', 'generated', 'queries'] as const) beliefEvidence[key] += result.evidence[key];
    return result.actions;
  };
  try {
    while (!battle.ended) {
      if (options.stop()) return {reward: null, turns: battle.turn, selected, trace: publicLog(battle.log), path, decisions, beliefEvidence};
      const a = observation('p1'); const b = observation('p2');
      const decision = tree.choose(a, actionsFor('p1', a), random, training);
      const opponentDecision = policyAction(actionsFor('p2', b), opponentRandom, options.policy);
      // Both decisions are made from the same pre-action state. No policy receives the other command.
      for (const [side, firstDecision] of [['p1', decision], ['p2', {action: opponentDecision, key: ''}]] as const) {
        let next = firstDecision;
        while (next.action.command) {
          const oldRequest = JSON.stringify(battle[side].activeRequest);
          if (battle.choose(side, next.action.command)) {
            decisions.push({turn: a.turn, side, command: next.action.command, informationKey: next.key || informationKey(b)});
            if (side === 'p1') {
              path.push({key: next.key, command: next.action.command});
              if (next.action.command.startsWith('team ')) selected = next.action.command.slice(5).split(',').map(n => Number(n) - 1);
            }
            break;
          }
          // Trapping/disable can reveal new legal choices. Re-query only the affected player's request.
          if (oldRequest === JSON.stringify(battle[side].activeRequest)) throw new Error(`Showdown 拒绝行动 ${side}: ${next.action.command} — ${battle[side].choice.error}`);
          const updated = observation(side);
          next = side === 'p1' ? tree.choose(updated, actionsFor(side, updated), random, training) : {action: policyAction(actionsFor(side, updated), opponentRandom, options.policy), key: informationKey(updated)};
        }
      }
    }
    const reward = !battle.winner ? 0.5 : battle.winner === '构筑方案' ? 1 : 0;
    return {reward, turns: battle.turn, selected, trace: publicLog(battle.log), path, decisions, beliefEvidence};
  } catch (error) {throw new BattleRunError(error, {seed: options.seed, turn: battle.turn, trace: publicLog(battle.log)});}
  finally {battle.destroy();}
}

export function wilson(wins: number, trials: number): [number, number] | null {
  if (!trials) return null;
  const z = 1.95996398454; const p = wins / trials; const denom = 1 + z * z / trials;
  const center = (p + z * z / (2 * trials)) / denom;
  const margin = z * Math.sqrt(p * (1 - p) / trials + z * z / (4 * trials * trials)) / denom;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

export function simulate(engine: BattleEngine, meta: MetaModel, request: SimulationRequest, control: SimulationControl): SimulationResult {
  if (request.context && (request.context.algorithmVersion !== ALGORITHM_VERSION || request.context.corpusVersion !== meta.corpus.version || request.context.modelVersion !== meta.model.version)) throw new Error('模拟上下文版本不一致；请使用原版本引擎与算法重放。');
  if (request.opponentSpecies && request.opponentSpecies.length !== engine.ruleTable.maxTeamSize) throw new Error(`请提供对手完整的 ${engine.ruleTable.maxTeamSize} 只宝可梦。`);
  if (request.opponentTeam) {const problems = engine.validator.validateTeam(request.opponentTeam.map(set => engine.toPS(set))); if (problems?.length) throw new Error(`对手队伍不合法：${problems.join('；')}`);}
  const issues = engine.validateDraft(request.draft);
  if (issues.length) throw new Error(`深入模拟需要合法的完整队伍：${issues.map(i => i.message).join('；')}`);
  if (request.baseline) {const errors = engine.validateDraft({...request.draft, members: request.baseline}); if (errors.length) throw new Error(`对照队伍不完整或不合法：${errors.map(i => i.message).join('；')}`);}
  const start = performance.now(); const deadline = start + request.seconds * 1000;
  const sources = opponentSources(meta.corpus.teams, meta.season, request.allowHistoricalOpponents);
  if (!sources.length && !request.opponentSpecies && !request.opponentTeam) throw new Error(request.allowHistoricalOpponents === false ? '当前赛季没有完整合法对手队伍；可开启历史对手参考或指定对手。' : '当前与历史来源均无通过本规则校验的完整对手队伍。');
  const given = request.opponentTeamId ? sources.find(t => t.id === request.opponentTeamId) : null;
  if (request.opponentTeamId && !given) throw new Error('选择的对手不属于本次参考赛季，或未通过当前规则的完整队伍校验。');
  const draw = (random: () => number, training: boolean): Opponent => {
    if (request.opponentTeam) return {id: `team:${hash(request.opponentTeam)}`, sets: training && request.mode === 'closed' ? drawHiddenTeam(meta, engine, request.opponentTeam.map(set => set.speciesId), random, control.cancelled) : request.opponentTeam};
    if (request.opponentSpecies?.length) return {id: `species:${request.opponentSpecies.join(',')}`, sets: drawHiddenTeam(meta, engine, request.opponentSpecies, random, control.cancelled)};
    const source = given ?? sources[Math.floor(random() * sources.length)];
    const original = source.observationIds.map(id => meta.observationById.get(id)!.set);
    return {id: source.id, sets: training && request.mode === 'closed' ? drawHiddenTeam(meta, engine, original.map(s => s.speciesId), random, control.cancelled) : original};
  };
  const own = request.draft.members.map(m => m.set);
  const baseline = request.baseline?.map(m => m.set);
  const tree = control.createTree?.() ?? new InformationTree(); const baselineTree = control.createTree?.() ?? new InformationTree();
  const policies: OpponentPolicy[] = request.opponentPolicies ?? ['pressure', 'control', 'mixed'];
  const result: SimulationResult = {draftId: request.draft.id, inputHash: draftHash(request.draft), modelVersion: meta.model.version, environmentId: request.draft.environmentId, revision: request.draft.analysisRevision, corpusVersion: meta.corpus.version, algorithmVersion: ALGORITHM_VERSION, seed: request.seed, mode: request.mode, completed: 0, wins: 0, losses: 0, ties: 0, unfinished: 0, winRate: null, interval: null, meanTurns: 0, elapsedMs: 0, policies, selections: [], opponents: [], trace: [], trainingGames: 0, baselineTrainingGames: 0, searchNodes: 0, tailRisk: null, cancelled: false, replays: [], strategy: request.strategy ?? 'mixed', beliefEvidence: {beliefs: 0, generated: 0, queries: 0}};
  const selectedSources = request.opponentTeam || request.opponentSpecies ? [] : given ? [given] : sources;
  result.opponentEvidence = {seasons: [...new Set(selectedSources.map(source => source.season))], historical: selectedSources.some(source => source.season !== meta.season), sourceCount: selectedSources.length, mode: request.opponentTeam ? 'provided' : request.opponentSpecies ? 'species' : 'sources'};
  if (baseline) result.paired = {wins: 0, losses: 0, ties: 0, trials: 0, delta: 0};
  const cancelled = () => control.cancelled();
  let lastProgress = start; let trainingIndex = 0;
  const trainingDeadline = start + request.seconds * 1000 * 0.45;
  const fixedTraining = request.trainingTrials ?? (request.trials === undefined ? undefined : request.trials * 2);
  while (!cancelled() && (fixedTraining === undefined ? performance.now() < trainingDeadline : trainingIndex < fixedTraining)) {
    const seed = request.seed + trainingIndex * 7919;
    const opponent = draw(seededRandom(seed ^ 0x9e3779b9), true);
    const stop = () => cancelled() || (fixedTraining === undefined && performance.now() >= trainingDeadline);
    const options = {engine, meta, preview: control.preview, previewSeed: request.seed, ownPolicy: request.strategy, beliefSamples: request.beliefSamples, opponent: opponent.sets, seed, training: true, policy: policies[trainingIndex % policies.length], mode: request.mode, stop};
    const game = runGame({...options, own, tree});
    const before = baseline && !stop() ? runGame({...options, own: baseline, tree: baselineTree}) : undefined;
    // Commit paired training only when both complete, keeping learning budgets equal.
    if (game.reward !== null && (!baseline || before?.reward != null)) {
      tree.backpropagate(game.path, game.reward); result.trainingGames++;
      if (before?.reward != null) {baselineTree.backpropagate(before.path, before.reward); result.baselineTrainingGames++;}
    }
    trainingIndex++;
    if (performance.now() - lastProgress > 700) {control.progress(`信息集搜索：${result.trainingGames} 场训练对局，${tree.nodes.size} 个信息状态`); lastProgress = performance.now();}
  }
  let evalIndex = 0; let totalTurns = 0; let pairedDelta = 0;
  while (!cancelled() && (request.trials === undefined ? performance.now() < deadline : evalIndex < request.trials)) {
    // Evaluation uses independent seeds; the baseline shares the same opponent, policy and battle seed.
    const seed = request.seed ^ (0x5bd1e995 + evalIndex * 104729);
    const opponent = draw(seededRandom(seed), false);
    const stop = () => cancelled() || (request.trials === undefined && performance.now() >= deadline);
    const options = {engine, meta, preview: control.preview, previewSeed: request.seed, ownPolicy: request.strategy, beliefSamples: request.beliefSamples, opponent: opponent.sets, seed, training: false, policy: policies[evalIndex % policies.length], mode: request.mode, stop};
    const game = runGame({...options, own, tree});
    evalIndex++;
    if (game.reward === null) {result.unfinished++; continue;}
    result.completed++; totalTurns += game.turns;
    if (game.reward === 1) result.wins++; else if (game.reward === 0) result.losses++; else result.ties++;
    let matchup = result.opponents.find(o => o.teamId === opponent.id);
    if (!matchup) {matchup = {teamId: opponent.id, trials: 0, wins: 0}; result.opponents.push(matchup);}
    matchup.trials++; if (game.reward === 1) matchup.wins++;
    const selected = game.selected.map(i => request.draft.members[i].id);
    let selection = result.selections.find(s => s.members.join(',') === selected.join(','));
    if (!selection) {selection = {members: selected, leads: selected.slice(0, 2), count: 0, wins: 0}; result.selections.push(selection);}
    selection.count++; if (game.reward === 1) selection.wins++;
    if (baseline && !stop()) {
      const before = runGame({...options, own: baseline, tree: baselineTree});
      if (before.reward !== null) {const delta = game.reward - before.reward; const p = result.paired!; p.trials++; pairedDelta += delta; if (delta > 0) p.wins++; else if (delta < 0) p.losses++; else p.ties++; p.delta = pairedDelta / p.trials;}
      else result.unfinished++;
    }
    if (!result.trace.length) result.trace = game.trace;
    result.replays!.push({index: evalIndex, seed, opponentId: opponent.id, policy: options.policy, reward: game.reward, turns: game.turns, selected, trace: game.trace, decisions: game.decisions});
    for (const key of ['beliefs', 'generated', 'queries'] as const) result.beliefEvidence![key] += game.beliefEvidence[key];
    result.winRate = result.wins / result.completed; result.interval = wilson(result.wins, result.completed);
    result.meanTurns = totalTurns / result.completed; result.elapsedMs = performance.now() - start;
    if (performance.now() - lastProgress > 700) {control.progress(`独立种子复评：${result.completed} 场，${result.wins} 胜 / ${result.losses} 负 / ${result.ties} 平`, structuredClone(result)); lastProgress = performance.now();}
  }
  const tail = result.opponents.map(o => o.wins / o.trials).sort((a, b) => a - b).slice(0, Math.ceil(result.opponents.length * 0.2));
  result.tailRisk = tail.length ? 1 - tail.reduce((a, b) => a + b, 0) / tail.length : null;
  result.cancelled = cancelled(); result.searchNodes = [...tree.nodes.values()].filter(node => node.visits > 0).length; result.elapsedMs = performance.now() - start;
  result.treeDiagnostics = tree.diagnostics();
  result.selections.sort((a, b) => b.count - a.count);
  return result;
}
