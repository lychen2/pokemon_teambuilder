import {BattleEngine} from './battle/engine';
import {MetaModel} from './analysis/model';
import {Store} from './storage';
import {Evaluator} from './analysis/evaluate';
import {ALGORITHM_VERSION} from './domain';
export class Contexts {
  private contexts = new Map<string, {engine: BattleEngine; meta: MetaModel; evaluator: Evaluator}>();
  constructor(readonly store: Store) {}
  statistics() {return [...this.contexts].map(([key, context]) => ({key, observations: context.meta.corpus.observations.length, archetypes: context.meta.model.archetypes.length, damageEntries: context.engine.cacheSize()}));}
  clear(): void {this.contexts.clear();}
  get(environmentId: string, versions?: {corpusVersion: string; modelVersion: string}) {
    const record = this.store.environment(environmentId);
    const corpusVersion = versions?.corpusVersion ?? record.corpusVersion;
    const modelVersion = versions?.modelVersion ?? record.modelVersion;
    const key = [environmentId, corpusVersion, modelVersion].join(':');
    let value = this.contexts.get(key);
    if (!value) {
      const engine = new BattleEngine(this.store.engineDirectory(record.engine.id), record.environment.formatId, record.translations);
      const model = this.store.model(modelVersion);
      if (model.corpusVersion !== corpusVersion) throw new Error('模型与语料版本不一致。');
      if (model.algorithmVersion !== ALGORITHM_VERSION) throw new Error(`配置模型需要为算法 ${ALGORITHM_VERSION} 重建。旧版本保留用于对应版本的应用。`);
      const meta = new MetaModel(this.store.corpus(corpusVersion), model, record.environment.season);
      value = {engine, meta, evaluator: new Evaluator(engine, meta)}; this.contexts.set(key, value);
    }
    return value;
  }
}
