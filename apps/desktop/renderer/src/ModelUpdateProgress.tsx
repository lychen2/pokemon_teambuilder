import type {JobProgress} from '../../../../packages/core/types';
import {Spinner} from './ui';

export function ModelUpdateProgress({job, onError}: {job: JobProgress; onError: (error: unknown) => void}) {
  return <div className="notice neutral" aria-live="polite">
    <Spinner label="正在更新配置分析"/>
    <p>{job.message}</p>
    <p className="field-help">原始资料、旧模型和队伍仍保留。完成后继续使用当前队伍。</p>
    <button className="button secondary" onClick={() => void window.poke.call('cancelJob', {id: job.id}).catch(onError)}>取消模型重建</button>
  </div>;
}
