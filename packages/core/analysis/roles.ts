import type {PokemonSet} from '../types';
import {setMechanisms, type MechanismGroup} from './mechanisms';

export function roles(set: PokemonSet): string[] {
  return [...new Set(setMechanisms(set).flatMap(rule => rule.role ? [rule.role] : []))];
}
export function roleGroups(set: PokemonSet): MechanismGroup[] {
  return [...new Set(setMechanisms(set).filter(rule => rule.role).map(rule => rule.group))];
}
export interface Mechanics {
  benefits: string[];
  conflicts: string[];
  benefitResources: string[];
  conflictResources: string[];
}

const weatherNames: Record<string, string> = {sun: '晴天', rain: '雨天', sand: '沙暴', snow: '雪天'};
const terrainNames: Record<string, string> = {grassy: '青草场地', psychic: '精神场地', electric: '电气场地', misty: '薄雾场地'};
const seeds: Record<string, string> = {grassy: 'grassyseed', psychic: 'psychicseed', electric: 'electricseed', misty: 'mistyseed'};
const weatherAbilities: Record<string, string[]> = {sun: ['chlorophyll', 'solarpower', 'flowergift'], rain: ['swiftswim', 'raindish', 'dryskin', 'hydration'], sand: ['sandrush', 'sandforce', 'sandveil'], snow: ['slushrush', 'icebody', 'snowcloak']};

export function directionalMechanics(field: PokemonSet, partner: PokemonSet): Mechanics {
  const benefits: string[] = []; const conflicts: string[] = [];
  const benefitResources = new Set<string>(); const conflictResources = new Set<string>();
  const benefit = (resource: string, text: string) => {benefitResources.add(resource); benefits.push(text);};
  const conflict = (resource: string, text: string) => {conflictResources.add(resource); conflicts.push(text);};
  const ownRules = setMechanisms(field); const partnerRules = setMechanisms(partner);
  const own = new Set(ownRules.map(rule => rule.id)); const other = new Set(partnerRules.map(rule => rule.id));
  const partnerRoles = new Set(partnerRules.flatMap(rule => rule.role ? [rule.role] : []));
  const window = partnerRoles.has('强化') || partner.moves.some(id => ['tailwind', 'trickroom', 'perishsong', 'revivalblessing'].includes(id));

  for (const [id, name] of Object.entries(weatherNames)) {
    if (!own.has(id)) continue;
    if (weatherAbilities[id].includes(partner.abilityId ?? '')) benefit('weather', `${name}成功建立后支持队友的天气特性；需要保持天气生效`);
    if (Object.keys(weatherNames).some(key => key !== id && other.has(key))) conflict('weather-overwrite', '不同天气会互相覆盖，需要分别安排出场与进化时机，不能同时获得收益');
    if (other.has('weatherdeny')) conflict('weather-suppression', '天气压制特性留场时，己方的天气增益也会失效');
    if (partner.moves.includes('weatherball')) benefit('weather', `${name}会改变气象球的属性与威力；需按实际天气核对目标`);
    if (id === 'sun' && partner.moves.some(move => ['solarbeam', 'solarblade'].includes(move))) benefit('weather', '晴天可省去日光束或日光刃的蓄力回合；天气被覆盖后要重新判断');
    if (id === 'rain' && partner.moves.some(move => ['thunder', 'hurricane'].includes(move))) benefit('weather', '雨天为打雷或暴风提供命中保障；仍需核对属性免疫');
    if (id === 'sun' && partner.moves.some(move => ['thunder', 'hurricane'].includes(move))) conflict('weather-accuracy', '晴天会降低打雷或暴风的命中率');
    if (id === 'snow' && partner.moves.includes('blizzard')) benefit('weather', '雪天为暴风雪提供命中保障；范围防守仍可能阻挡');
    if (id === 'snow' && partner.moves.includes('auroraveil')) benefit('screens', '雪天为极光幕提供建立条件；需要另外获得使用极光幕的行动窗口');
  }

  for (const [id, name] of Object.entries(terrainNames)) {
    if (!own.has(id)) continue;
    if (partner.itemId === seeds[id]) benefit('terrain', partner.abilityId === 'unburden'
      ? `${name}触发对应种子与轻装；需实际消耗道具且没有换出重置`
      : `${name}触发对应场地种子的防御能力提升`);
    if (Object.keys(terrainNames).some(key => key !== id && other.has(key))) conflict('terrain-overwrite', '不同场地会互相覆盖，需要选择本轮使用的场地路线');
    if (id === 'grassy' && partner.moves.includes('grassyglide')) benefit('terrain', '青草场地支持青草滑梯的先制路线；使用者需满足接地条件');
    if (id === 'grassy' && partner.moves.some(move => ['earthquake', 'bulldoze', 'magnitude'].includes(move))) conflict('terrain-damage', '青草场地会降低对接地目标的地震、重踏等伤害');
    if (id === 'psychic' && partner.moves.includes('expandingforce')) benefit('terrain', '精神场地支持广域战力的双目标输出；使用者需接地');
    if (id === 'psychic' && other.has('priority')) conflict('terrain-priority', '精神场地会阻挡对接地对手的先制攻击；需逐招核对实际优先度');
    if (id === 'electric' && partner.abilityId === 'surgesurfer') benefit('terrain', '电气场地支持冲浪之尾的速度提升');
    if ((id === 'electric' || id === 'misty') && other.has('sleep')) conflict('terrain-status', `${name}会阻碍对接地对手施加新的睡眠`);
    if (id === 'misty' && (other.has('burn') || other.has('paralysis') || partner.moves.includes('toxic'))) conflict('terrain-status', '薄雾场地会阻碍对接地对手施加新的异常状态');
  }

  if (own.has('redirection') && window) benefit('action-window', '掩护为强化、控速或关键支援创造行动窗口；范围招式和粉末免疫仍需单独处理');
  if (own.has('fakeout') && window) benefit('action-window', '击掌奇袭为强化、控速或关键支援创造行动窗口；需满足刚入场、有效目标和先制未被阻挡');
  if ((own.has('priorityblock') || own.has('quickguard')) && window) benefit('action-window', '先制阻断保护强化或空间行动；不能阻挡所有普通优先度攻击');
  if (own.has('wideguard') && partner.moves.some(move => ['earthquake', 'surf', 'discharge', 'bulldoze', 'boomburst', 'petalblizzard'].includes(move))) benefit('spread-safety', '广域防守可挡住队友范围招式的误伤；防守者当回合需选择广域防守');
  if ((own.has('screens') || own.has('veil') || own.has('friendguard')) && partnerRoles.has('强化')) benefit('screens', '减伤支援为强化后留场创造条件；屏障需先建立，友情防守需支援成员留场');
  if (own.has('allyheal')) benefit('healing', partner.abilityId === 'multiscale'
    ? '队友回复可帮助重新启用多重鳞片；必须实际回到满血且保持该特性'
    : '队友回复提供续航支援；需要可用的回复时机与受益目标');
  if (own.has('pivot') && (other.has('intimidate') || other.has('switchrecovery') || partner.abilityId === 'hospitality')) benefit('pivot', '轮转帮助再次利用威吓、再生力或款待；需要安全换入与可用后备');
  if (own.has('intimidate') && (partnerRoles.has('轮转') || partnerRoles.has('续航'))) benefit('pivot', '威吓与轮转延长防守资源；对免疫威吓或特殊输出的收益有限');
  if (own.has('perish') && other.has('trap')) benefit('perish', '灭亡之歌与限制换人建立倒数路线；需核对对手能否逃脱及己方撤退时机');
  if (own.has('revive')) benefit('revive', '复生祈祷可让倒下的关键队友重新参与；需要 PP、出手机会与安全换入');
  if (field.moves.includes('haze') && partnerRoles.has('强化')) conflict('setup-reset', '黑雾也会清除己方强化，需区分反制对手与保留自身强化的时机');
  if (field.moves.includes('tailwind') && partner.moves.includes('trickroom')) conflict('speed-plan', '顺风与戏法空间需要分开规划；空间内更快可能反而后手');
  return {benefits: [...new Set(benefits)], conflicts: [...new Set(conflicts)], benefitResources: [...benefitResources], conflictResources: [...conflictResources]};
}

export function pairMechanics(a: PokemonSet, b: PokemonSet): Mechanics {
  const forward = directionalMechanics(a, b); const backward = directionalMechanics(b, a);
  return {
    benefits: [...new Set([...forward.benefits, ...backward.benefits])],
    conflicts: [...new Set([...forward.conflicts, ...backward.conflicts])],
    benefitResources: [...new Set([...forward.benefitResources, ...backward.benefitResources])],
    conflictResources: [...new Set([...forward.conflictResources, ...backward.conflictResources])],
  };
}

/** Group repeated descriptions and beneficiaries by their actual support resource. */
export function teamMechanics(sets: PokemonSet[]): Mechanics {
  const pairs = sets.flatMap((set, index) => sets.slice(index + 1).map(other => pairMechanics(set, other)));
  const benefits = new Set(pairs.flatMap(pair => pair.benefits));
  const benefitResources = new Set(pairs.flatMap(pair => pair.benefitResources));
  if (sets.some(set => set.moves.includes('perishsong') && roles(set).includes('限制换人'))) {
    benefits.add('同一成员以限制换人配合灭亡之歌；需要保留己方撤退路线并核对对手逃脱条件'); benefitResources.add('perish');
  }
  if (sets.some(set => set.moves.includes('auroraveil') && roles(set).includes('雪天'))) {
    benefits.add('雪天成员携带极光幕，可在雪天仍有效时建立屏障；仍需安全的出手机会'); benefitResources.add('screens');
  }
  return {benefits: [...benefits], conflicts: [...new Set(pairs.flatMap(pair => pair.conflicts))], benefitResources: [...benefitResources], conflictResources: [...new Set(pairs.flatMap(pair => pair.conflictResources))]};
}

export function fieldFromTeam(sets: PokemonSet[]): {weather?: string; terrain?: string} {
  const weatherMap: Record<string, string> = {drought: 'Sun', orichalcumpulse: 'Sun', drizzle: 'Rain', sandstream: 'Sand', snowwarning: 'Snow'};
  const terrainMap: Record<string, string> = {grassysurge: 'Grassy', psychicsurge: 'Psychic', electricsurge: 'Electric', hadronengine: 'Electric', mistysurge: 'Misty'};
  const weather = [...new Set(sets.map(s => weatherMap[s.abilityId || '']).filter(Boolean))];
  const terrain = [...new Set(sets.map(s => terrainMap[s.abilityId || '']).filter(Boolean))];
  // Conflicting setters require a turn context; setting moves are never assumed successful.
  return {weather: weather.length === 1 ? weather[0] : undefined, terrain: terrain.length === 1 ? terrain[0] : undefined};
}
