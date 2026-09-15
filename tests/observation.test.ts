import {expect, test} from 'vitest';
import {healthFraction, observe} from '../packages/core/battle/observation';
import {informationKey} from '../packages/core/battle/information-state';

// Public events from the reported failure, seed 20775648, ending at turn 5.
const illusionLog = [
  '|switch|p2a: Sneasler|Sneasler, L50, F|100/100',
  '|switch|p2b: Armarouge|Armarouge, L50, M|100/100',
  '|turn|1',
  '|switch|p2b: Sneasler|Sneasler, L50, F|100/100',
  '|-enditem|p2b: Sneasler|Psychic Seed',
  '|-boost|p2b: Sneasler|spd|1|[from] item: Psychic Seed',
  '|move|p2a: Sneasler|Night Daze|p1b: Indeedee',
  '|-damage|p2b: Sneasler|0 fnt',
  '|faint|p2b: Sneasler',
  '|switch|p2b: Armarouge|Armarouge, L50, M|100/100',
  '|turn|2',
  '|move|p2a: Sneasler|Night Daze|p1b: Indeedee',
  '|move|p2b: Armarouge|Armor Cannon|p1a: Armarouge',
  '|-damage|p2b: Armarouge|53/100',
  '|turn|3',
  '|move|p2b: Armarouge|Wide Guard|p2b: Armarouge',
  '|move|p2a: Sneasler|Night Daze|p1a: Armarouge',
  '|-damage|p2a: Sneasler|94/100|[from] Sandstorm',
  '|-damage|p2b: Armarouge|47/100|[from] Sandstorm',
  '|turn|4',
  '|move|p2a: Sneasler|Night Daze|p1b: Tyranitar',
  '|-start|p2a: Sneasler|Encore',
  '|move|p2b: Armarouge|Armor Cannon|p1a: Ninetales',
  '|-unboost|p2b: Armarouge|def|1',
  '|-unboost|p2b: Armarouge|spd|1',
  '|-damage|p2a: Sneasler|42/100',
  '|replace|p2a: Zoroark|Zoroark, L50, M',
  '|-end|p2a: Zoroark|Illusion',
  '|-enditem|p2a: Zoroark|Choice Scarf|[from] move: Knock Off|[of] p1b: Tyranitar',
  '|turn|5',
];

test('种子 20775648：解除幻觉保留 HP、再来一次与原观察，不将同名成员混为一只', () => {
  const preview = ['meowsticf', 'sneasler', 'indeedeef', 'armarouge', 'cinderace', 'zoroark'];
  const before = observe('p1', {wait: true}, illusionLog.slice(0, 25), preview);
  expect(before.active.p2a.speciesId).toBe('sneasler');
  expect(Object.values(before.seen).some(p => p.speciesId === 'zoroark')).toBe(false);
  const state = observe('p1', {wait: true}, illusionLog, preview);
  const zoroark = state.active.p2a;
  expect(healthFraction(zoroark.condition)).toBe(0.42);
  expect(zoroark).toMatchObject({speciesId: 'zoroark', entered: 0, lastMove: 'nightdaze', moves: ['nightdaze'], boosts: {}, item: '', ability: 'illusion', volatiles: {encore: {started: 4}}});
  const sneaslers = Object.values(state.seen).filter(p => p.speciesId === 'sneasler');
  expect(sneaslers).toHaveLength(1);
  expect(sneaslers[0]).toMatchObject({condition: '0 fnt', moves: [], boosts: {spd: 1}, item: ''});
  expect(state.fainted.p2).toBe(1);
  expect(state.active.p2b).toMatchObject({speciesId: 'armarouge', condition: '47/100', boosts: {def: -1, spd: -1}});
  expect(informationKey(structuredClone(state))).toBe(informationKey(state));
});

test('幻觉仅更新公开身份；解除前后的强化、状态及换入回合连续，换出后重置临时状态', () => {
  const lines = ['|turn|2', '|switch|p2a: Partner|Sneasler, L50, F|72/100 par', '|-boost|p2a: Partner|spe|2', '|move|p2a: Partner|Night Daze|p1a: Target', '|-start|p2a: Partner|Encore', '|turn|4', '|replace|p2a: Zoroark|Zoroark, L50, M'];
  const revealed = observe('p1', {wait: true}, lines, ['sneasler', 'zoroark']);
  expect(revealed.active.p2a).toMatchObject({condition: '72/100 par', entered: 2, boosts: {spe: 2}, lastMove: 'nightdaze', volatiles: {encore: {started: 2}}});
  const returned = observe('p1', {wait: true}, [...lines, '|switch|p2a: Partner|Sneasler, L50, F|100/100', '|turn|6', '|switch|p2a: Zoroark|Zoroark, L50, M|72/100 par'], ['sneasler', 'zoroark']);
  expect(returned.active.p2a).toMatchObject({condition: '72/100 par', entered: 6, boosts: {}, moves: ['nightdaze'], volatiles: {}});
  expect(returned.active.p2a.lastMove).toBeUndefined();
});
