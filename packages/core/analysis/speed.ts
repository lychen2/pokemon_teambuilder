import type {BattleEngine} from '../battle/engine';
import type {MetaModel} from './model';
import type {SpeedRequest, SpeedAnalysis} from '../types';
import {ALGORITHM_VERSION, complete, draftHash} from '../domain';

export function speedBenchmarks(engine: BattleEngine, meta: MetaModel, request: SpeedRequest): SpeedAnalysis {
  const {draft, field, memberId} = request;
  const own = draft.members.find(m => m.id === memberId);
  if (!own || !complete(own.set)) throw new Error('请先补全该成员的配点、性格、特性和招式，再比较速度。');
  const issues = engine.validateSet(own.set);
  if (issues.length) throw new Error(issues.join('；'));
  const rows = meta.configurations.filter(a => a.currentCount > 0).map(a => {
    const speed = engine.speeds(own.set, a.set, field);
    const direction = (speed.attacker - speed.defender) * (field.trickRoom ? -1 : 1);
    return {archetypeId: a.archetypeId, configurationId: a.id, speciesId: a.speciesId, set: a.set, label: [engine.zh(engine.name('items', a.set.itemId!)), ...a.roles].join(' · '), currentCount: a.currentCount,
      ownSpeed: speed.attacker, opponentSpeed: speed.defender, order: (direction > 0 ? 'before' : direction < 0 ? 'after' : 'tie') as 'before' | 'after' | 'tie'};
  }).sort((a, b) => Math.abs(a.ownSpeed - a.opponentSpeed) - Math.abs(b.ownSpeed - b.opponentSpeed) || b.currentCount - a.currentCount);
  return {draftId: draft.id, revision: draft.analysisRevision, environmentId: draft.environmentId, corpusVersion: meta.corpus.version, modelVersion: meta.model.version, algorithmVersion: ALGORITHM_VERSION,
    inputHash: draftHash(draft), memberId, field: {...field}, naturalSpeed: engine.stats(own.set, field.attackerMega ?? true).spe, rows,
    conditions: ['只比较相同优先度的行动；同速时随机决定先后，不视为稳定先手。', '按刚入场状态计算道具、特性与所选条件；匹配场地的种子会消耗并触发轻装，慢启动按未结束计算。', '天气与场地需实际建立；本页不自动假设队内场地手已成功入场。', '仅使用当前赛季完整合法配置；样本次数不表示排位使用率。']};
}
