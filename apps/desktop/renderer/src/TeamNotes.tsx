import {NotebookPen} from 'lucide-react';
import type {Workspace} from './useWorkspace';

const template = '成员任务\n• \n\n常见首发与后排\n• 对手：\n  首发：\n  后排：\n\n主要胜利路线\n• \n\n困难对局与可接受的代价\n• \n\n待实战验证的假设\n• ';
export function TeamNotes({workspace: w}: {workspace: Workspace}) {
  if (!w.draft) return null;
  return <section className="team-notes"><div className="notes-heading"><div><h3><NotebookPen size={18}/>写下这支队伍的想法</h3><p>记录成员任务、选出与胜利路线。笔记随队伍自动保存，并保留在历史版本中。</p></div>{!w.draft.notes.trim() && <button className="button secondary small" onClick={() => w.edit(d => ({...d, notes: template}))}>插入思考模板</button>}</div><textarea aria-label="构筑与对局笔记" value={w.draft.notes} onChange={e => w.edit(d => ({...d, notes: e.target.value}))} placeholder={'例如：这套种子轻装路线需要先建立场地。\n遇到对面空间队时，我打算…'}/><p className="field-help">这是你的构筑记录；推荐不会替你填写或覆盖这些判断。</p></section>;
}
