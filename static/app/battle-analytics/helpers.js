export function countResults(records) {
  let win = 0;
  let loss = 0;
  let timeout = 0;
  for (const r of records) {
    if (r.result === "win") win += 1;
    else if (r.result === "loss") loss += 1;
    else if (r.result === "timeout") timeout += 1;
  }
  return {win, loss, timeout, total: records.length};
}

export function safeRate(numerator, denominator) {
  if (!denominator) return 0;
  return numerator / denominator;
}

export function tallyFailureTags(records) {
  const counts = new Map();
  for (const r of records) {
    for (const tag of r.failureTags || []) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({tag, count}))
    .sort((a, b) => b.count - a.count);
}

export function tallyMembers(records, lineupKey) {
  const stats = new Map();
  for (const r of records) {
    const lineup = r[lineupKey] || [];
    const isWin = r.result === "win";
    for (const id of lineup) {
      if (!stats.has(id)) {
        stats.set(id, {speciesId: id, picks: 0, wins: 0});
      }
      const slot = stats.get(id);
      slot.picks += 1;
      if (isWin) slot.wins += 1;
    }
  }
  return [...stats.values()];
}

export function tallyLineupCombos(records, lineupKey) {
  const stats = new Map();
  for (const r of records) {
    const ids = [...(r[lineupKey] || [])].sort();
    if (ids.length === 0) continue;
    const key = ids.join("|");
    if (!stats.has(key)) {
      stats.set(key, {members: ids, count: 0, wins: 0});
    }
    const slot = stats.get(key);
    slot.count += 1;
    if (r.result === "win") slot.wins += 1;
  }
  return [...stats.values()];
}

export function tallyOpponentSpecies(records) {
  const stats = new Map();
  for (const r of records) {
    const seen = new Set();
    for (const id of r.opponentTeam || []) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (!stats.has(id)) {
        stats.set(id, {speciesId: id, appearances: 0, wins: 0});
      }
      const slot = stats.get(id);
      slot.appearances += 1;
      if (r.result === "win") slot.wins += 1;
    }
  }
  return [...stats.values()];
}

export function tallyKoChains(records) {
  const counts = new Map();
  for (const r of records) {
    for (const ko of r.keyKos || []) {
      const key = `${ko.attacker}>>${ko.target}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      const [attacker, target] = key.split(">>");
      return {attacker, target, count};
    })
    .sort((a, b) => b.count - a.count);
}
