import {Worker} from 'node:worker_threads';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

interface Task {id: string; method: string; input: unknown; environmentId: string; cancel: SharedArrayBuffer; resolve: (value: any) => void; reject: (error: Error) => void; progress?: (value: any) => void}
class Lane {
  private worker: Worker;
  private pending: Task[] = [];
  private current?: Task;
  private failure?: Error;
  constructor(directory: string, assets: string) {
    this.worker = new Worker(join(__dirname, 'compute-worker.cjs'), {workerData: {directory, assets}});
    this.worker.on('message', message => {
      if (!this.current || message.id !== this.current.id) return;
      if (message.type === 'progress') {this.current.progress?.(message.value); return;}
      if (message.error) this.current.reject(Object.assign(new Error(message.error), {failure: message.failure})); else this.current.resolve(message.result);
      this.current = undefined; this.next();
    });
    this.worker.on('error', error => this.fail(error instanceof Error ? error : new Error(String(error))));
    this.worker.on('exit', code => {if (code) this.fail(new Error(`计算线程异常退出（${code}）`));});
  }
  private fail(error: Error) {this.failure = error; this.current?.reject(error); this.current = undefined; for (const task of this.pending) task.reject(error); this.pending = [];}
  private next() {if (this.current || !this.pending.length || this.failure) return; this.current = this.pending.shift()!; const {id, method, input, environmentId, cancel} = this.current; this.worker.postMessage({id, method, input, environmentId, cancel});}
  run(method: string, input: unknown, environmentId: string, options: {cancel?: SharedArrayBuffer; progress?: (value: any) => void} = {}): Promise<any> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {this.pending.push({id: randomUUID(), method, input, environmentId, cancel: options.cancel ?? new SharedArrayBuffer(4), resolve, reject, progress: options.progress}); this.next();});
  }
  close() {this.fail(new Error('应用正在关闭。')); void this.worker.terminate();}
}

export class ComputePool {
  readonly fast: Lane; readonly deep: Lane; readonly maintenance: Lane;
  constructor(directory: string, assets: string) {this.fast = new Lane(directory, assets); this.deep = new Lane(directory, assets); this.maintenance = new Lane(directory, assets);}
  close() {this.fast.close(); this.deep.close(); this.maintenance.close();}
}
