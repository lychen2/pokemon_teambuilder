const KO_LITERALS = {
  "It's a status move, it won't deal damage.": "变化招式，不会造成伤害。",
  "The battlers shared their pain!": "双方平分了痛苦！",
  "No damage for you": "没有伤害",
  "possibly the worst move ever": "几乎打不出伤害",
  "the Water-Type attack evaporated in the harsh sunlight": "大晴天下水系招式被蒸发",
  "the Fire-Type attack fizzled out in the heavy rain": "大雨下火系招式熄灭",
  "something broke; please tell nerd of now": "计算器异常，请反馈",
};

const KO_PATTERNS = [
  [/^guaranteed OHKO$/, "必然一回合击倒"],
  [/^guaranteed (\d+)HKO$/, (_, n) => `必然 ${n} 回合击倒`],
  [/^possible (\d+)HKO$/, (_, n) => `可能 ${n} 回合击倒`],
  [/^([\d<>.]+)% chance to OHKO$/, (_, p) => `${p}% 概率一回合击倒`],
  [/^([\d<>.]+)% chance to (\d+)HKO$/, (_, p, n) => `${p}% 概率 ${n} 回合击倒`],
];

const AFTER_PHRASES = {
  "Stealth Rock": "隐形岩伤害",
  "1 layer of Spikes": "1 层钉刺伤害",
  "2 layers of Spikes": "2 层钉刺伤害",
  "3 layers of Spikes": "3 层钉刺伤害",
  "Spikes": "钉刺伤害",
  "Leftovers recovery": "剩饭回复",
  "Black Sludge recovery": "黑色污泥回复",
  "Black Sludge damage": "黑色污泥伤害",
  "Grassy Terrain recovery": "青草场地回复",
  "poison damage": "中毒伤害",
  "toxic damage": "剧毒伤害",
  "burn damage": "灼伤伤害",
  "reduced burn damage": "减弱灼伤伤害",
  "sandstorm damage": "沙暴伤害",
  "hail damage": "冰雹伤害",
  "Dry Skin damage": "干燥皮肤伤害",
  "Dry Skin recovery": "干燥皮肤回复",
  "Solar Power damage": "太阳之力伤害",
  "Rain Dish recovery": "雨盘回复",
  "Ice Body recovery": "冰冻之躯回复",
  "Bad Dreams": "噩梦",
  "Poison Heal": "毒愈",
  "Sea of Fire damage": "火海伤害",
  "G-Max field damage": "极巨场地伤害",
  "Salt Cure damage": "盐腌伤害",
  "extra Salt Cure damage": "强化盐腌伤害",
};

const AFTER_PATTERNS = [
  [/^Ripen\s+(.+)\s+recovery$/, (_, inner) => `开花 ${translateBerryInner(inner)}`],
  [/^Gluttony\s+(.+)\s+recovery$/, (_, inner) => `贪吃 ${translateBerryInner(inner)}`],
  [/^(.+)\s+Berry recovery$/, (_, n) => `${n} 果实回复`],
];

function translateBerryInner(text) {
  const berryMatch = /^(.+)\s+Berry recovery$/.exec(text);
  if (berryMatch) {
    return `${berryMatch[1]} 果实回复`;
  }
  return `${text} 回复`;
}

function translateAfterFragment(fragment) {
  const trimmed = fragment.trim();
  if (AFTER_PHRASES[trimmed]) {
    return AFTER_PHRASES[trimmed];
  }
  for (const [pattern, replacement] of AFTER_PATTERNS) {
    if (pattern.test(trimmed)) {
      return trimmed.replace(pattern, replacement);
    }
  }
  return trimmed;
}

function translateAfterText(afterBody) {
  const parts = afterBody.split(/\s+and\s+/);
  return parts.map(translateAfterFragment).join("、");
}

function splitCore(text) {
  const afterIndex = text.indexOf(" after ");
  if (afterIndex === -1) {
    return [text, ""];
  }
  return [text.slice(0, afterIndex), text.slice(afterIndex + " after ".length)];
}

function applyKoPatterns(core) {
  if (KO_LITERALS[core]) {
    return KO_LITERALS[core];
  }
  for (const [pattern, replacement] of KO_PATTERNS) {
    if (pattern.test(core)) {
      return core.replace(pattern, replacement);
    }
  }
  return core;
}

export function translateDamageKoText(language, text) {
  const value = String(text || "");
  if (language !== "zh" || !value) {
    return value;
  }
  if (KO_LITERALS[value]) {
    return KO_LITERALS[value];
  }
  const [core, after] = splitCore(value);
  const translatedCore = applyKoPatterns(core);
  if (!after) {
    return translatedCore;
  }
  return `${translatedCore}（扣除 ${translateAfterText(after)}）`;
}

const DESCRIPTION_LITERAL_PAIRS = [
  ["Red Item-boosted ", "红道具加成 "],
  ["Blue Item-boosted ", "蓝道具加成 "],
  ["Ally Steely Spirit ", "盟友钢之意志 "],
  ["Helping Hand ", "帮助 "],
  ["Power Spot ", "能量点 "],
  ["Battery ", "蓄电池 "],
  ["Flower Gift ", "花之礼 "],
  ["Me First ", "抢先一步 "],
  ["Charged ", "充电 "],
  ["burned ", "灼伤 "],
  ["Tera-", "太晶-"],
  [" Dynamax ", " 极巨化 "],
  ["revealed ", "预知 "],
  ["(Super Effective)", "(效果绝佳)"],
  ["(Tera 60 BP Boost)", "(太晶 60 威力加成)"],
  ["(1.2x Mask Boost)", "(1.2x 面具加成)"],
  ["(1st Use)", "(首次使用)"],
  [" through Aurora Veil", " 穿透极光幕"],
  [" through Reflect", " 穿透反射壁"],
  [" through Light Screen", " 穿透光墙"],
  [" on a critical hit", "（暴击）"],
  [" under Gravity", "（重力下）"],
  [" after using Glaive Rush", "（使用猛刃冲锋后）"],
  [" with Friend Guard", "（带友情防守）"],
  [" through Protect", "（穿透守住）"],
  [" with custom modifiers", "（带自定义修正）"],
  [" Terrain", " 场地"],
  [" in ", " 场景 "],
  [" and ", " 搭配 "],
  ["vs.", "对位"],
];

const DESCRIPTION_REGEX_PATTERNS = [
  [/\((\d+) BP (\w+)\)/g, "($1 威力 $2)"],
  [/\((\d+) BP\)/g, "($1 威力)"],
  [/\((\d+) hits\)/g, "($1 连击)"],
  [/\b(\d+)\s+HP\b/g, "$1 HP"],
  [/\b(\d+)\s+Atk\b/g, "$1 攻击"],
  [/\b(\d+)\s+Def\b/g, "$1 防御"],
  [/\b(\d+)\s+SpA\b/g, "$1 特攻"],
  [/\b(\d+)\s+SpD\b/g, "$1 特防"],
  [/\b(\d+)\s+Spe\b/g, "$1 速度"],
  [/\bLv\.\s*(\d+)\b/g, "Lv.$1"],
];

export function translateDamageDescription(language, text) {
  let value = String(text || "");
  if (language !== "zh" || !value) {
    return value;
  }
  for (const [pattern, replacement] of DESCRIPTION_REGEX_PATTERNS) {
    value = value.replace(pattern, replacement);
  }
  for (const [source, target] of DESCRIPTION_LITERAL_PAIRS) {
    value = value.split(source).join(target);
  }
  return value;
}
