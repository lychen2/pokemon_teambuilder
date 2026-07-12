import {t} from "./i18n.js";
import {analyzeMatchup} from "./matchup-analysis.js";
import {setInnerHTMLIfChanged} from "./render-cache.js";
import {spriteMarkup} from "./sprites.js";

const FOUR_SELECTION_SIZE = 4;
const LEAD_SIZE = 2;
const FEEDBACK_LIMIT = 80;
const STARTER_ABILITIES = new Map([
  ["drizzle", "rain"],
  ["drought", "sun"],
  ["sandstream", "sand"],
  ["snowwarning", "snow"],
  ["megasol", "sun"],
]);
const STARTER_MOVES = new Map([
  ["trickroom", "trickroom"],
  ["tailwind", "tailwind"],
  ["raindance", "rain"],
  ["sunnyday", "sun"],
  ["sandstorm", "sand"],
  ["snowscape", "snow"],
  ["hail", "snow"],
]);
const WEATHER_PAYOFF_ABILITIES = Object.freeze({
  rain: new Set(["swiftswim", "raindish", "hydration"]),
  sun: new Set(["chlorophyll", "solarpower", "protosynthesis", "flowergift", "orichalcumpulse"]),
  sand: new Set(["sandrush", "sandforce", "sandveil"]),
  snow: new Set(["slushrush", "icebody", "snowcloak"]),
});
const WEATHER_PAYOFF_MOVES = Object.freeze({
  rain: new Set(["electroshot", "thunder", "hurricane", "weatherball"]),
  sun: new Set(["solarbeam", "solarblade", "growth", "morningsun", "synthesis", "weatherball"]),
  sand: new Set(["weatherball"]),
  snow: new Set(["auroraveil", "blizzard", "weatherball"]),
});
const MIN_WEATHER_PAYOFFS = 1;
const MIN_TRICK_ROOM_PAYOFFS = 2;
const MIN_TAILWIND_PAYOFFS = 3;
const SLOW_SPEED_POINTS = 5;
const FAST_SPEED_POINTS = 20;
const ATTACK_POINTS = 20;

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeId(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function memberKey(member = {}) {
  return member.id || `${member.speciesId}:${member.slot || ""}`;
}

function localizedName(state, member = {}) {
  if (state.language === "zh") {
    return state.localizedSpeciesNames?.get(member.speciesId) || member.species || member.speciesName || member.label || member.speciesId || "";
  }
  return member.species || member.speciesName || member.label || member.speciesId || "";
}

function normalizePracticeMember(config = {}, teamId = "") {
  return {
    ...config,
    id: `${teamId}:${config.slot || config.speciesId}`,
    displayName: config.species || config.speciesName || config.speciesId || "",
    speciesName: config.species || config.speciesName || config.speciesId || "",
    moveNames: Array.isArray(config.moves) ? config.moves : [],
  };
}

function normalizePracticeTeam(team = {}) {
  return {
    teamId: team.teamId || "",
    description: team.description || "",
    owner: team.owner || "",
    dateShared: team.dateShared || "",
    configs: (team.configs || []).map((config) => normalizePracticeMember(config, team.teamId || "team")),
  };
}

function getRandomPair(teams = []) {
  if (teams.length < 2) return null;
  const firstIndex = Math.floor(Math.random() * teams.length);
  let secondIndex = Math.floor(Math.random() * (teams.length - 1));
  if (secondIndex >= firstIndex) secondIndex += 1;
  return [teams[firstIndex], teams[secondIndex]];
}

export function createSelectionPracticeRound(teams = []) {
  const pair = getRandomPair(teams.filter((team) => Array.isArray(team?.configs) && team.configs.length >= FOUR_SELECTION_SIZE));
  if (!pair) return null;
  const [allyTeam, opponentTeam] = pair.map(normalizePracticeTeam);
  return {
    roundId: `practice:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    allyTeam,
    opponentTeam,
    leadIds: [],
    backIds: [],
    result: null,
  };
}

function findMember(team = {}, id = "") {
  return (team.configs || []).find((member) => memberKey(member) === id) || null;
}

function idsToMembers(team, ids = []) {
  return ids.map((id) => findMember(team, id)).filter(Boolean);
}

function lineupIdsFromLeadPair(leadPair = {}) {
  return (leadPair.lineupMembers || leadPair.members || []).map((member) => member.id || `${member.speciesId}:${member.slot || ""}`).filter(Boolean).slice(0, FOUR_SELECTION_SIZE);
}

function getBestLineupIds(matchup) {
  return lineupIdsFromLeadPair(matchup?.leadPairs?.[0] || {});
}

function scoreSelectionAgainstOpponent(lineup = [], leadIds = [], opponent = [], datasets, fieldState) {
  if (!lineup.length || !opponent.length) return 0;
  const analysis = analyzeMatchup(lineup, opponent, datasets, {fieldState});
  if (!analysis?.leadPairs?.length) return 0;
  const selectedIds = new Set(lineup.map((member) => memberKey(member)));
  const selectedLeadIds = new Set(leadIds);
  const matchingLead = analysis.leadPairs.find((entry) => {
    const entryLineupIds = new Set((entry.lineupMembers || []).map((member) => member.id));
    const entryLeadIds = new Set((entry.members || []).map((member) => member.id));
    return selectedIds.size === entryLineupIds.size
      && selectedLeadIds.size === entryLeadIds.size
      && [...selectedIds].every((id) => entryLineupIds.has(id))
      && [...selectedLeadIds].every((id) => entryLeadIds.has(id));
  });
  return Number((matchingLead || analysis.leadPairs[0]).lineupScore || 0);
}

function moveIds(member = {}) {
  return (member.moves || member.moveNames || []).map(normalizeId);
}

function starterModes(member = {}) {
  const modes = [];
  const abilityMode = STARTER_ABILITIES.get(normalizeId(member.ability));
  if (abilityMode) modes.push(abilityMode);
  moveIds(member).forEach((moveId) => {
    const moveMode = STARTER_MOVES.get(moveId);
    if (moveMode && !modes.includes(moveMode)) modes.push(moveMode);
  });
  return modes;
}

function attackPoints(member = {}) {
  const points = member.points || {};
  return Math.max(Number(points.atk || 0), Number(points.spa || 0));
}

function speedPoints(member = {}) {
  return Number((member.points || {}).spe || 0);
}

function isWeatherPayoff(member = {}, weather = "") {
  if (STARTER_ABILITIES.get(normalizeId(member.ability)) === weather) return false;
  if (WEATHER_PAYOFF_ABILITIES[weather]?.has(normalizeId(member.ability))) return true;
  const moves = new Set(moveIds(member));
  return [...(WEATHER_PAYOFF_MOVES[weather] || [])].some((moveId) => moves.has(moveId));
}

function hasWeatherCore(team = {}, weather = "") {
  const members = team.configs || [];
  const hasSetter = members.some((member) => starterModes(member).includes(weather));
  if (!hasSetter) return false;
  return members.filter((member) => isWeatherPayoff(member, weather)).length >= MIN_WEATHER_PAYOFFS;
}

function hasTrickRoomCore(team = {}) {
  const members = team.configs || [];
  if (!members.some((member) => starterModes(member).includes("trickroom"))) return false;
  return members.filter((member) => speedPoints(member) <= SLOW_SPEED_POINTS && attackPoints(member) >= ATTACK_POINTS).length >= MIN_TRICK_ROOM_PAYOFFS;
}

function hasTailwindCore(team = {}) {
  const members = team.configs || [];
  if (!members.some((member) => starterModes(member).includes("tailwind"))) return false;
  return members.filter((member) => speedPoints(member) >= FAST_SPEED_POINTS && attackPoints(member) >= ATTACK_POINTS).length >= MIN_TAILWIND_PAYOFFS;
}

function isCoreMode(team = {}, mode = "") {
  if (["rain", "sun", "sand", "snow"].includes(mode)) return hasWeatherCore(team, mode);
  if (mode === "trickroom") return hasTrickRoomCore(team);
  if (mode === "tailwind") return hasTailwindCore(team);
  return false;
}

export function getSelectionPracticeStarterModes(team = {}, member = {}) {
  return starterModes(member).filter((mode) => isCoreMode(team, mode));
}

function isModeStarter(team = {}, member = {}) {
  return getSelectionPracticeStarterModes(team, member).length > 0;
}

function starterGap(lineup = [], algorithmLineup = [], team = {}) {
  const selected = new Set(lineup.map((member) => memberKey(member)));
  return algorithmLineup.filter((member) => isModeStarter(team, member) && !selected.has(memberKey(member)));
}

export function solveSelectionPracticeRound(round, datasets, fieldState = {}) {
  if (!round?.allyTeam?.configs?.length || !round?.opponentTeam?.configs?.length) return null;
  const userLineup = idsToMembers(round.allyTeam, [...(round.leadIds || []), ...(round.backIds || [])]);
  if (userLineup.length !== FOUR_SELECTION_SIZE || (round.leadIds || []).length !== LEAD_SIZE || (round.backIds || []).length !== LEAD_SIZE) {
    return null;
  }
  const opponentAnalysis = analyzeMatchup(round.opponentTeam.configs, round.allyTeam.configs, datasets, {fieldState});
  const opponentIds = getBestLineupIds(opponentAnalysis);
  const opponentLineup = idsToMembers(round.opponentTeam, opponentIds);
  const opponentSelection = opponentLineup.length === FOUR_SELECTION_SIZE ? opponentLineup : round.opponentTeam.configs.slice(0, FOUR_SELECTION_SIZE);
  const allyAnalysis = analyzeMatchup(round.allyTeam.configs, opponentSelection, datasets, {fieldState});
  const algorithmIds = getBestLineupIds(allyAnalysis);
  const algorithmLineup = idsToMembers(round.allyTeam, algorithmIds);
  const algorithmSelection = algorithmLineup.length === FOUR_SELECTION_SIZE ? algorithmLineup : round.allyTeam.configs.slice(0, FOUR_SELECTION_SIZE);
  const algorithmLeadIds = (allyAnalysis?.leadPairs?.[0]?.members || []).map((member) => member.id).filter(Boolean);
  const userScore = scoreSelectionAgainstOpponent(userLineup, round.leadIds, opponentSelection, datasets, fieldState);
  const algorithmScore = scoreSelectionAgainstOpponent(algorithmSelection, algorithmLeadIds, opponentSelection, datasets, fieldState);
  return {
    solvedAt: new Date().toISOString(),
    opponentSelection: opponentSelection.map(memberKey),
    algorithmSelection: algorithmSelection.map(memberKey),
    userSelection: userLineup.map(memberKey),
    userScore,
    algorithmScore,
    scoreDelta: algorithmScore - userScore,
    missedStarters: starterGap(userLineup, algorithmSelection, round.allyTeam).map(memberKey),
  };
}

export function recordSelectionPracticeFeedback(state, verdict) {
  const round = state.selectionPractice?.round;
  if (!round?.result || !["algorithm", "user", "uncertain"].includes(verdict)) return false;
  const entry = {
    id: `selection-feedback:${Date.now()}`,
    verdict,
    roundId: round.roundId,
    allyTeamId: round.allyTeam.teamId,
    opponentTeamId: round.opponentTeam.teamId,
    userSelection: round.result.userSelection,
    algorithmSelection: round.result.algorithmSelection,
    opponentSelection: round.result.opponentSelection,
    userScore: round.result.userScore,
    algorithmScore: round.result.algorithmScore,
    scoreDelta: round.result.scoreDelta,
    missedStarters: round.result.missedStarters,
    savedAt: new Date().toISOString(),
  };
  state.selectionPractice.feedback = [entry, ...(state.selectionPractice.feedback || [])].slice(0, FEEDBACK_LIMIT);
  return true;
}

function teamHeaderMarkup(team = {}) {
  const title = [team.teamId, team.owner].filter(Boolean).join(" · ");
  const subtitle = [team.description, team.dateShared].filter(Boolean).join(" · ");
  return `<div><h3>${escapeHtml(title || "VGCPastes")}</h3>${subtitle ? `<p class="muted">${escapeHtml(subtitle)}</p>` : ""}</div>`;
}

function memberButtonMarkup(member, state, selectedKind = "") {
  const label = localizedName(state, member);
  const active = Boolean(selectedKind);
  return `
    <button type="button" class="selection-practice-member ${active ? "active" : ""}" data-practice-member-id="${escapeHtml(memberKey(member))}" aria-pressed="${active ? "true" : "false"}">
      ${spriteMarkup(member, state)}
      <span>${escapeHtml(label)}</span>
      ${selectedKind ? `<strong>${escapeHtml(selectedKind)}</strong>` : ""}
    </button>
  `;
}

function teamPickerMarkup(team, state, round) {
  const leadIds = new Set(round.leadIds || []);
  const backIds = new Set(round.backIds || []);
  return `
    <section class="subpanel selection-practice-team">
      <div class="section-head">${teamHeaderMarkup(team)}</div>
      <div class="selection-practice-grid">
        ${(team.configs || []).map((member) => {
          const key = memberKey(member);
          const kind = leadIds.has(key) ? t(state.language, "selectionPractice.lead") : backIds.has(key) ? t(state.language, "selectionPractice.back") : "";
          return memberButtonMarkup(member, state, kind);
        }).join("")}
      </div>
    </section>
  `;
}

function readonlyLineupMarkup(title, ids, team, state) {
  const members = idsToMembers(team, ids);
  return `
    <div class="selection-practice-lineup">
      <div class="analysis-label">${escapeHtml(title)}</div>
      <div class="selection-practice-minirow">
        ${members.map((member) => `<span class="mini-pill">${escapeHtml(localizedName(state, member))}</span>`).join("") || `<span class="muted">${escapeHtml(t(state.language, "common.none"))}</span>`}
      </div>
    </div>
  `;
}

function resultMarkup(round, state) {
  const result = round.result;
  const language = state.language;
  if (!result) return `<p class="muted">${escapeHtml(t(language, "selectionPractice.unready"))}</p>`;
  const delta = Number(result.scoreDelta || 0);
  const deltaLabel = `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`;
  return `
    <section class="subpanel selection-practice-result">
      <div class="section-head">
        <div>
          <h3>${escapeHtml(t(language, "selectionPractice.resultTitle"))}</h3>
          <p class="muted">${escapeHtml(t(language, "selectionPractice.resultCopy"))}</p>
        </div>
        <strong class="selection-practice-score">${escapeHtml(deltaLabel)}</strong>
      </div>
      <div class="selection-practice-results-grid">
        ${readonlyLineupMarkup(t(language, "selectionPractice.opponentAlgorithm"), result.opponentSelection, round.opponentTeam, state)}
        ${readonlyLineupMarkup(t(language, "selectionPractice.allyAlgorithm"), result.algorithmSelection, round.allyTeam, state)}
        ${readonlyLineupMarkup(t(language, "selectionPractice.userSelection"), result.userSelection, round.allyTeam, state)}
        ${readonlyLineupMarkup(t(language, "selectionPractice.missedStarters"), result.missedStarters, round.allyTeam, state)}
      </div>
      <div class="action-row">
        <button type="button" class="ghost-button" data-practice-feedback="algorithm">${escapeHtml(t(language, "selectionPractice.algorithmBetter"))}</button>
        <button type="button" class="ghost-button" data-practice-feedback="user">${escapeHtml(t(language, "selectionPractice.userBetter"))}</button>
        <button type="button" class="ghost-button" data-practice-feedback="uncertain">${escapeHtml(t(language, "selectionPractice.uncertain"))}</button>
      </div>
    </section>
  `;
}

function feedbackMarkup(feedback = [], language = "zh") {
  if (!feedback.length) return `<p class="muted">${escapeHtml(t(language, "selectionPractice.feedbackEmpty"))}</p>`;
  return `
    <div class="stack-list compact-list">
      ${feedback.slice(0, 8).map((entry) => `
        <div class="list-card compact-card">
          <div class="entry-main">
            <strong>${escapeHtml(entry.allyTeamId)} vs ${escapeHtml(entry.opponentTeamId)}</strong>
            <span class="muted">${escapeHtml(entry.verdict)} · Δ ${Number(entry.scoreDelta || 0).toFixed(2)}</span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

export function renderSelectionPractice(state) {
  const root = document.getElementById("selection-practice-root");
  if (!root) return;
  const practice = state.selectionPractice || {};
  const round = practice.round;
  const language = state.language;
  const body = !round ? `
    <section class="subpanel selection-practice-empty">
      <p class="muted">${escapeHtml(t(language, "selectionPractice.empty"))}</p>
      <button type="button" id="selection-practice-new-round-btn">${escapeHtml(t(language, "selectionPractice.start"))}</button>
    </section>
  ` : `
    <div class="selection-practice-toolbar action-row">
      <button type="button" id="selection-practice-new-round-btn" class="ghost-button">${escapeHtml(t(language, "selectionPractice.newRound"))}</button>
      <button type="button" id="selection-practice-solve-btn" ${round.leadIds.length === 2 && round.backIds.length === 2 ? "" : "disabled"}>${escapeHtml(t(language, "selectionPractice.solve"))}</button>
      <span class="muted">${escapeHtml(t(language, "selectionPractice.instructions"))}</span>
    </div>
    <div class="analysis-detail-grid selection-practice-board">
      ${teamPickerMarkup(round.allyTeam, state, round)}
      <section class="subpanel selection-practice-team">
        <div class="section-head">${teamHeaderMarkup(round.opponentTeam)}</div>
        <div class="selection-practice-grid readonly">
          ${(round.opponentTeam.configs || []).map((member) => memberButtonMarkup(member, state, "")).join("")}
        </div>
      </section>
    </div>
    ${resultMarkup(round, state)}
  `;
  setInnerHTMLIfChanged(root, `
    <div class="section-head">
      <h2>${escapeHtml(t(language, "selectionPractice.title"))}</h2>
    </div>
    ${body}
    <section class="subpanel selection-practice-feedback">
      <div class="section-head"><h3>${escapeHtml(t(language, "selectionPractice.feedbackTitle"))}</h3><span class="muted">${(practice.feedback || []).length}</span></div>
      ${feedbackMarkup(practice.feedback || [], language)}
    </section>
  `);
}
