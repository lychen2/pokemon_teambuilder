import {useEffect, useState} from 'react';
import {Plus, Save, X} from 'lucide-react';
import type {BattleField, PokemonSet} from '../../../../packages/core/types';
import type {ConditionTemplate} from '../../../../packages/core/research/types';
import type {ScenarioResult} from '../../../../packages/core/analysis/scenarios';
import type {Workspace} from './useWorkspace';
import {useResearch} from './useResearch';
import {IconButton, SearchSelect, Spinner, useDex} from './ui';

export function ConditionTemplates({w, attacker, defender, field, onLoad}: {w: Workspace; attacker: PokemonSet; defender: PokemonSet; field: BattleField; onLoad: (a: PokemonSet, d: PokemonSet, f: BattleField) => void}) {
  const dex = useDex(); const research = useResearch(w);
  const [selected, setSelected] = useState<ConditionTemplate | null>(null); const [title, setTitle] = useState('我的对照条件');
  const [variants, setVariants] = useState<ConditionTemplate['variants']>([]);
  const [results, setResults] = useState<ScenarioResult[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const templates = research.data?.entries.filter((entry): entry is ConditionTemplate => entry.kind === 'condition') ?? [];
  useEffect(() => {
    let active = true; setBusy(true); setError(''); setResults([]);
    const timer = setTimeout(() => {void window.poke.call('scenarios', {environmentId: w.draft!.environmentId, attacker, defender, field, variants}).then(result => {if (active) setResults(result);}).catch(e => {if (active) setError(e.message);}).finally(() => {if (active) setBusy(false);});}, 150);
    return () => {active = false; clearTimeout(timer);};
  }, [attacker, defender, field, variants, w.draft!.environmentId]);
  const save = async () => {
    try {
      const entry: ConditionTemplate = {kind: 'condition', id: selected?.id ?? crypto.randomUUID(), revision: selected?.revision ?? 0, environmentId: w.draft!.environmentId, draftId: w.draft!.id, updatedAt: new Date().toISOString(), title, attacker, defender, field, variants};
      setSelected(await research.save(entry) as ConditionTemplate);
    } catch (error) {w.report(error);}
  };
  return <section className="condition-templates"><h3>保存条件，检查结果是否稳健</h3><p className="field-help">基准与每个变化使用相同引擎；同时显示失去天气、削血和不同配置时的结果。</p>
    <div className="form-grid"><label className="form-field">条件模板名称<input aria-label="条件模板名称" value={title} onChange={e => setTitle(e.target.value)}/></label><label className="form-field">读取已存模板<select aria-label="读取条件模板" value={selected?.id ?? ''} onChange={e => {const entry = templates.find(t => t.id === e.target.value); if (!entry) {setSelected(null); return;} setSelected(entry); setTitle(entry.title); setVariants(entry.variants); onLoad(entry.attacker, entry.defender, entry.field);}}><option value="">新的模板</option>{templates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label></div>
    <div className="button-row wrap">{[{name: '失去天气', field: {weather: ''}}, {name: '失去场地', field: {terrain: ''}}, {name: '我方剩余 75% HP', field: {attackerHPPercent: 75}}, {name: '对手剩余 90% HP', field: {defenderHPPercent: 90}}].map(row => <button className="button small secondary" key={row.name} onClick={() => setVariants([...variants, row])}><Plus size={13}/>{row.name}</button>)}</div>
    <SearchSelect label="增加对手的另一种流派" value={null} options={w.state!.model.archetypes.filter(a => a.speciesId === defender.speciesId).map(a => ({id: a.id, name: a.label, zh: a.label}))} onChange={id => {const a = w.state!.model.archetypes.find(a => a.id === id)!; setVariants([...variants, {name: a.label, defender: a.representative, field: {}}]);}}/>
    <div className="chip-list">{variants.map((v, i) => <span className="badge neutral" key={i}>{v.name}<IconButton label={`移除条件${i + 1}`} onClick={() => setVariants(variants.filter((_, j) => i !== j))}><X size={12}/></IconButton></span>)}</div>
    <button className="button secondary small" disabled={research.busy} onClick={() => void save()}><Save size={14}/>保存条件模板</button>
    {busy && <Spinner label="对照各个条件"/>}{error && <p className="notice warning" role="alert">{error}</p>}
    <div className="scenario-results">{results.map((row, index) => <article className="scenario-row" key={index}><h4>{row.name}</h4><p className="field-help">速度 {row.speeds.attacker} / {row.speeds.defender}{row.field.trickRoom ? ' · 空间内低速先行' : ' · 同优先度'}</p>{row.damage.filter(d => d.max > 0).map(d => <div key={d.moveId}><span>{dex.names('moves', d.moveId)}</span><span>{d.minPercent.toFixed(1)}–{d.maxPercent.toFixed(1)}%</span><b className={d.ohko === 1 ? 'success-text' : 'muted'}>{d.ohko === 1 ? '全部乱数击杀' : `${(d.ohko * 100).toFixed(1)}% 击杀`}</b></div>)}</article>)}</div>
  </section>;
}
