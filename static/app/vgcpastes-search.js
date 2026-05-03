import {normalizeLookupText, normalizeName} from "./utils.js";

const SEARCH_TEXT_CACHE = new WeakMap();

function lookup(map, key) {
  return key ? (map?.get(key) || "") : "";
}

function localizedSpeciesName(state, member = {}) {
  if (state?.language !== "zh") return "";
  const speciesId = member.speciesId || normalizeName(member.species || "");
  return lookup(state.localizedSpeciesNames, speciesId);
}

function localizedItemName(state, member = {}) {
  return lookup(state.localizedItemNames, normalizeName(member.item));
}

function localizedAbilityName(state, member = {}) {
  return lookup(state.localizedAbilityNames, normalizeName(member.ability));
}

function localizedMoveNames(state, member = {}) {
  return (member.moves || []).map((move) => lookup(state.localizedMoveNames, normalizeName(move)));
}

function memberSearchTerms(member = {}, state = {}) {
  return [
    member.speciesId,
    member.species,
    localizedSpeciesName(state, member),
    member.item,
    localizedItemName(state, member),
    member.ability,
    localizedAbilityName(state, member),
    member.nature,
    ...(member.moves || []),
    ...localizedMoveNames(state, member),
  ];
}

function buildTeamSearchText(team = {}, state = {}) {
  return normalizeLookupText([
    team.teamId,
    team.description,
    team.owner,
    team.dateShared,
    ...(team.memberSpeciesIds || []),
    ...(team.memberSpeciesNames || []),
    ...(team.configs || []).flatMap((member) => memberSearchTerms(member, state)),
  ].join(" "));
}

function getTeamSearchText(team, state) {
  const cached = SEARCH_TEXT_CACHE.get(team);
  if (cached && cached.lang === state.language) {
    return cached.value;
  }
  const value = buildTeamSearchText(team, state);
  SEARCH_TEXT_CACHE.set(team, {lang: state.language, value});
  return value;
}

export function filterVgcpastesTeams(teams = [], query = "", state = {}) {
  const token = normalizeLookupText(query);
  if (!token) {
    return teams;
  }
  return teams.filter((team) => getTeamSearchText(team, state).includes(token));
}
