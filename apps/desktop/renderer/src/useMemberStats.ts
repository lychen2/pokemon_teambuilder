import {useEffect, useState} from 'react';
import type {BattleField, MemberStats, PokemonSet} from '../../../../packages/core/types';

export function useMemberStats(environmentId: string | undefined, set: PokemonSet | undefined, field: BattleField) {
  const key = JSON.stringify([environmentId, set, field]);
  const [result, setResult] = useState<{key: string; data?: MemberStats; error?: string} | null>(null);
  useEffect(() => {
    if (!environmentId || !set) return;
    let active = true;
    const timer = setTimeout(() => {
      void window.poke.call('memberStats', {environmentId, set: {...set, moves: set.moves.filter(Boolean)}, field})
        .then(data => {if (active) setResult({key, data});})
        .catch(error => {if (active) setResult({key, error: error.message});});
    }, 30);
    return () => {active = false; clearTimeout(timer);};
  }, [key]);
  return {data: result?.key === key ? result.data : undefined, error: result?.key === key ? result.error : undefined, pending: !!set && result?.key !== key};
}
