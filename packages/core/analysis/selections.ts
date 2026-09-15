import type {Evaluator, Evaluation, EvaluationTarget} from './evaluate';
import type {BattleField, TeamDraft, TeamMember, TeamAnalysis} from '../types';
import {ALGORITHM_VERSION, combinations, draftHash, hash} from '../domain';
import {directionalMechanics, pairMechanics, roles} from './roles';
import {canonicalOpponents} from './selection-context';
import {rankLineups} from './lineups';

export interface SelectionRoute {
  id: string;
  members: string[];
  leads: string[];
  title: string;
  megaId: string | null;
  field: BattleField;
  winConditions: string[];
  requirements: string[];
  dependencies: {supportId: string; beneficiaryId: string; reason: string}[];
  difficultOpponents: string[];
  metrics: TeamAnalysis['metrics'];
  score: number;
  leadOptions: {members: string[]; score: number; metrics: TeamAnalysis['metrics']; field: BattleField; megaId: string | null; benefits: string[]; concerns: string[]}[];
}
export interface SelectionAnalysis {
  draftId: string;
  revision: number;
  environmentId: string;
  modelVersion: string;
  corpusVersion: string;
  opponentSpecies: string[];
  lineup: {id: string; speciesId: string; itemId: string | null; gender?: 'M' | 'F'}[];
  inputHash: string;
  algorithmVersion: string;
  routes: SelectionRoute[];
  reserves: {memberId: string; appearance: number; explanation: string}[];
  conditions: string[];
}

export function compareLeads(evaluator: Evaluator, route: Evaluation, targets: EvaluationTarget[]): SelectionRoute['leadOptions'] {
  const members = route.members;
  return combinations(members, 2).map(leads => {
    const megaId = leads.some(lead => lead.id === route.megaId) ? route.megaId : null;
    const evaluation = evaluator.lineup(leads, targets, megaId);
    const pair = pairMechanics(evaluation.effectiveMembers[0].set, evaluation.effectiveMembers[1].set);
    const concerns = [...pair.conflicts];
    const support = route.effectiveMembers.filter(member => !leads.some(lead => lead.id === member.id));
    for (const lead of evaluation.effectiveMembers) {
      if (lead.set.abilityId === 'unburden' && /seed$/.test(lead.set.itemId ?? '') && !pair.benefits.some(text => text.includes('轻装'))) concerns.push(`${evaluator.engine.display(lead.set.speciesId)}首发时缺少对应场地，需要另外创造种子触发时机`);
      if (support.some(member => pairMechanics(lead.set, member.set).benefits.some(text => /掩护|控速|先制阻断/.test(text)))) concerns.push(`${evaluator.engine.display(lead.set.speciesId)}的部分支援留在后排，第一回合不能直接使用`);
    }
    if (route.megaId && !megaId) concerns.push('本路线的 Mega 使用者留在后排，首发不能使用其进化后特性或天气');
    return {members: leads.map(member => member.id), score: evaluation.score, metrics: evaluation.metrics, field: evaluation.field, megaId, benefits: pair.benefits, concerns: [...new Set(concerns)]};
  }).sort((a, b) => b.score - a.score || a.members.join(',').localeCompare(b.members.join(',')));
}

function routeKnowledge(evaluator: Evaluator, members: TeamMember[], megaId: string | null) {
  const {engine} = evaluator;
  const dependencies: SelectionRoute['dependencies'] = [];
  const wins = new Set<string>(); const requirements = new Set<string>();
  const tagged = members.map(member => ({member, tags: roles(member.set)}));
  for (const {member, tags} of tagged) {
    const partners = members.filter(partner => partner.id !== member.id);
    if (tags.includes('灭歌')) {
      const trappers = tagged.filter(row => row.tags.includes('限制换人'));
      wins.add(trappers.length ? '限制换人后以灭亡倒数结束对局' : '用灭亡倒数迫换，夺回位置或清除强化');
      requirements.add('核对隔音、幽灵与逃脱条件；倒数结束前保留自己的撤退路线');
      for (const trapper of trappers) dependencies.push({supportId: trapper.member.id, beneficiaryId: member.id, reason: '限制换人让灭亡倒数可能转化为击倒'});
    }
    if (tags.includes('复活')) {
      wins.add('倒下的关键成员复活后重新执行主路线'); requirements.add('复生祈祷需要倒下队友、PP 和出手机会；复活不是无条件增加一个攻击回合');
      const key = partners.filter(partner => partner.set.moves.some(id => engine.dex.moves.get(id).category !== 'Status'))
        .sort((a, b) => Math.max(engine.stats(b.set, b.id === megaId).atk, engine.stats(b.set, b.id === megaId).spa) - Math.max(engine.stats(a.set, a.id === megaId).atk, engine.stats(a.set, a.id === megaId).spa))[0];
      if (key) dependencies.push({supportId: member.id, beneficiaryId: key.id, reason: '复活这位进攻成员是需要验证的资源路线'});
    }
    if (tags.includes('强化')) {
      wins.add('创造强化窗口，再由强化成员收割');
      for (const cover of tagged.filter(row => row.tags.includes('掩护') || row.tags.includes('先制阻断') || row.member.set.moves.includes('fakeout'))) {
        if (cover.member.id !== member.id) dependencies.push({supportId: cover.member.id, beneficiaryId: member.id, reason: '掩护或限制先制保护强化行动'});
      }
    }
    if (member.set.moves.includes('trickroom')) {
      wins.add('在戏法空间内争取低速行动优势'); requirements.add('空间不改变招式优先度；比较对手速度与封印、挑衅路线');
      for (const partner of partners.filter(partner => partner.set.moves.includes('fakeout'))) dependencies.push({supportId: partner.id, beneficiaryId: member.id, reason: '击掌奇袭为戏法空间创造行动窗口；需要可用的首回合、有效目标且未被场地或特性阻挡'});
      for (const partner of partners.filter(partner => roles(partner.set).includes('强化'))) {
        const speeds = engine.speeds(partner.set, member.set, {attackerMega: partner.id === megaId, defenderMega: member.id === megaId});
        if (speeds.attacker < speeds.defender) dependencies.push({supportId: member.id, beneficiaryId: partner.id, reason: '低速强化成员可在空间成立后争取同优先度先手；仍需逐一核对对手速度'});
      }
      for (const partner of partners.filter(partner => partner.set.itemId === 'choicescarf')) {
        wins.add(`空间结束后由${engine.display(partner.set.speciesId)}接手高速路线`);
        requirements.add('讲究围巾的高速路线与空间内低速路线分开执行；围巾还会锁定招式');
      }
    }
    if (member.set.abilityId === 'hospitality') {
      for (const partner of partners) {
        const multiscale = partner.set.abilityId === 'multiscale';
        dependencies.push({supportId: member.id, beneficiaryId: partner.id, reason: multiscale ? '款待换入回复队友最大 HP 的四分之一；实际回满后可重新启用多重鳞片' : '款待换入回复在场队友最大 HP 的四分之一，依赖可用的轮转窗口'});
        if (multiscale) {wins.add('通过换入恢复满血减伤，保留关键进攻成员'); requirements.add('多重鳞片需要当前形态拥有该特性且实际满血；回复不足或持续伤害会使这条路线失效');}
      }
    }
    for (const partner of partners) {
      for (const reason of directionalMechanics(member.set, partner.set).benefits.filter(text => /场地|天气/.test(text))) dependencies.push({supportId: member.id, beneficiaryId: partner.id, reason});
    }
  }
  const megas = members.filter(member => engine.dex.items.get(member.set.itemId ?? '').megaStone?.[engine.name('species', member.set.speciesId)]);
  if (megas.length > 1) requirements.add(`本组选出有 ${megas.length} 位可用 Mega 的成员，本场只能选择其中一位进化；两条 Mega 路线不能同时成立`);
  requirements.add(megaId ? `本路线由${engine.display(members.find(member => member.id === megaId)!.set.speciesId)}使用 Mega，其余成员保留初始形态` : '本路线保留 Mega 资源，特性与伤害按初始形态计算');
  if (!wins.size) wins.add('通过伤害、速度与换人交换建立人数优势');
  return {dependencies: dependencies.filter((entry, i, all) => all.findIndex(other => JSON.stringify(other) === JSON.stringify(entry)) === i), winConditions: [...wins], requirements: [...requirements]};
}

export function analyzeSelections(evaluator: Evaluator, draft: TeamDraft, opponentSpecies: string[] = []): SelectionAnalysis {
  const errors = evaluator.engine.validateDraft(draft).filter(issue => issue.severity === 'error' || issue.memberId);
  if (errors.length) throw new Error(errors.map(issue => issue.message).join('；'));
  const picked = evaluator.engine.ruleTable.pickedTeamSize;
  if (draft.members.length < picked) throw new Error(`还需要 ${picked - draft.members.length} 位成员才能比较 ${picked} 人选出。`);
  const opponents = canonicalOpponents(opponentSpecies);
  const missing = opponents.filter(species => !evaluator.meta.configurationsBySpecies.has(species));
  if (missing.length) throw new Error(`以下对手缺少合法配置证据：${missing.map(id => evaluator.engine.display(id)).join('、')}`);
  const targets = opponents.length ? opponents.flatMap(species => evaluator.meta.configurationPosterior(species, opponents).map(p => ({configuration: evaluator.meta.configurationById.get(p.configurationId)!, weight: p.probability / opponents.length}))) : evaluator.threats;
  const routes = rankLineups(evaluator, draft.members, targets).map((evaluation): SelectionRoute => {
    const members = evaluation.effectiveMembers;
    const knowledge = routeKnowledge(evaluator, members, evaluation.megaId);
    const leadOptions = compareLeads(evaluator, evaluation, targets);
    const title = members.some(m => m.set.moves.includes('perishsong')) ? '灭歌路线' : members.some(m => m.set.moves.includes('trickroom')) ? '空间路线' : members.some(m => m.set.moves.includes('revivalblessing')) ? '复活资源路线' : members.some(m => roles(m.set).includes('强化')) ? '强化路线' : '进攻与轮转路线';
    return {id: hash([members.map(m => m.id), evaluation.megaId]), members: members.map(m => m.id), leads: leadOptions[0].members, leadOptions, title, megaId: evaluation.megaId, field: evaluation.field,
      ...knowledge, metrics: evaluation.metrics, score: evaluation.score, difficultOpponents: [...new Set([...evaluation.threats].sort((a, b) => b.difficulty - a.difficulty).map(threat => threat.speciesId))].slice(0, 3)};
  }).sort((a, b) => b.score - a.score);
  const competitive = routes.filter(route => route.score >= routes[0].score - .2);
  return {draftId: draft.id, revision: draft.analysisRevision, environmentId: draft.environmentId, corpusVersion: evaluator.meta.corpus.version, modelVersion: evaluator.meta.model.version, opponentSpecies: opponents, lineup: draft.members.map(member => ({id: member.id, speciesId: member.set.speciesId, itemId: member.set.itemId, gender: member.set.gender})), inputHash: hash([draftHash(draft), opponents]), algorithmVersion: ALGORITHM_VERSION, routes,
    reserves: draft.members.map(member => ({memberId: member.id, appearance: competitive.filter(route => route.members.includes(member.id)).length, explanation: '在与最高快速评分差距 0.2 内的路线中出现次数；这不是实际选出率，需结合个人战绩检查'})),
    conditions: [`${picked} 人路线分别比较唯一 Mega 使用者及全部双打首发组合；首发仅使用在场两人的条件，尚未推进完整回合`, opponentSpecies.length ? '对手配置采用当前模型的全部合法真实变体及条件概率，包含历史先验' : `对手来自 ${evaluator.referenceSeasons.join('、') || '尚无样本'} 共享构筑的流派代表对照`, '灭歌、复活与强化说明是可执行条件清单，其成功率需完整回合模拟或实战验证']};
}
