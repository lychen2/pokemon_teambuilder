import {parseHTML} from 'linkedom';
import {randomUUID} from 'node:crypto';
import type {ResearchDocument} from './types';
import {publicLog} from '../battle/observation';

export interface DocumentInput {environmentId: string; sourceType: ResearchDocument['sourceType']; url: string; raw?: string}
export function extractArticle(html: string): {title: string; author: string; publishedAt: string; raw: string} {
  const {document} = parseHTML(html);
  const title = document.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? document.querySelector('title')?.textContent ?? '';
  const author = document.querySelector('meta[name="author"]')?.getAttribute('content') ?? '';
  const publishedAt = document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ?? '';
  document.querySelectorAll('script,style,nav,header,footer,noscript,template,form,iframe').forEach(node => node.remove());
  const messages = [...document.querySelectorAll('.message-body')];
  const roots = messages.length ? messages : [document.querySelector('article') ?? document.querySelector('main') ?? document.querySelector('body') ?? document];
  const text = (node: any): string => {
    if (node.nodeType === 3) return node.textContent ?? '';
    const block = /^(P|DIV|SECTION|H[1-6]|LI|TR|BR|BLOCKQUOTE|PRE)$/.test(node.nodeName);
    return `${block ? '\n' : ''}${[...node.childNodes].map(text).join('')}${block ? '\n' : ''}`;
  };
  const raw = roots.map(text).join('\n\n').replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!raw) throw new Error('页面未包含可读取正文；可粘贴已公开的原文后再整理。');
  return {title: title.trim(), author: author.trim(), publishedAt, raw};
}

export function evidenceCandidates(raw: string): ResearchDocument['claims'] {
  const relevant = /outspeed|surviv|speed|spread|lead|matchup|perish|revival|support|change|replace|chose|choose|intimidat|protect|速度|配点|首发|选出|对局|灭歌|复活|支援|替换|改动|威吓/i;
  return [...new Set(raw.split(/\n\s*\n|\n/).map(line => line.trim()).filter(line => line.length >= 30 && relevant.test(line)))].map(quote => ({quote, interpretation: '', confirmed: false}));
}

export function replayEvidence(raw: string): NonNullable<ResearchDocument['replay']> {
  const lines = publicLog(raw.split(/\r?\n/));
  if (!lines.some(line => line.startsWith('|start')) || !lines.some(line => line.startsWith('|turn|'))) throw new Error('没有识别到 Showdown 实际对局日志（缺少 start 或 turn）。');
  const teams = ['p1', 'p2'].map(side => ({side, species: [...new Set(lines.filter(line => line.startsWith(`|poke|${side}|`)).map(line => line.split('|')[3].split(',')[0]))]}));
  const winner = lines.find(line => line.startsWith('|win|'))?.split('|')[2] ?? (lines.some(line => line === '|tie') ? 'tie' : null);
  return {format: lines.find(line => line.startsWith('|tier|'))?.split('|')[2] ?? '', players: lines.filter(line => /^\|player\|p[12]\|/.test(line)).map(line => line.split('|')[3]), winner, turns: Math.max(...lines.filter(line => line.startsWith('|turn|')).map(line => Number(line.split('|')[2]))), teams};
}

/** Preparation never adds observations or frequency counts; save only after reviewing source and quotes. */
export async function prepareDocument(input: DocumentInput, fetcher: typeof fetch = fetch): Promise<ResearchDocument> {
  let title = ''; let author = ''; let publishedAt = ''; let raw = input.raw?.trim() ?? '';
  if (!raw) {
    const url = new URL(input.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只支持公开网页链接。');
    if (input.sourceType === 'replay') {
      if (url.hostname !== 'replay.pokemonshowdown.com') throw new Error('在线回放请使用 replay.pokemonshowdown.com 链接；其他对局可粘贴公开日志。');
      url.pathname = url.pathname.replace(/\.(json|log)$/, '') + '.json'; url.hash = '';
      const response = await fetcher(url); if (!response.ok) throw new Error(`回放读取失败：HTTP ${response.status}`);
      const data = await response.json() as Record<string, unknown>;
      if (typeof data.log !== 'string') throw new Error('回放接口没有返回实际日志。');
      raw = data.log; title = typeof data.format === 'string' ? `${data.format} 对局回放` : 'Showdown 对局回放';
      publishedAt = typeof data.uploadtime === 'number' ? new Date(data.uploadtime * 1000).toISOString() : '';
    } else {
      const social = input.sourceType === 'social' && ['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'].includes(url.hostname);
      const target = social ? `https://publish.twitter.com/oembed?omit_script=true&url=${encodeURIComponent(url.href)}` : url;
      const response = await fetcher(target); if (!response.ok) throw new Error(`来源读取失败：HTTP ${response.status}`);
      const content = social ? await response.json() as {html?: string; author_name?: string} : {html: await response.text()};
      if (typeof content.html !== 'string') throw new Error('来源未返回可读正文。');
      ({title, author, publishedAt, raw} = extractArticle(content.html));
      if (social) author = (content as {author_name?: string}).author_name ?? author;
    }
  }
  const replay = input.sourceType === 'replay' ? replayEvidence(raw) : undefined;
  return {kind: 'document', id: randomUUID(), revision: 0, updatedAt: new Date().toISOString(), environmentId: input.environmentId, url: input.url, title: title || (input.sourceType === 'replay' ? '对局回放' : '独立研究资料'), author, publishedAt,
    sourceType: input.sourceType, raw, claims: input.sourceType === 'replay' ? [] : evidenceCandidates(raw), sampleMethod: input.sourceType === 'replay' ? '单场公开回放；主动分享样本，不能据此推断总体胜率' : '作者主动发表的经验资料；不计入共享构筑频率', replay};
}
