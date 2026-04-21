const PSCHINA_SCRIPT_PATH = new URL("../../PSChina%20Server%20Translation%20SV-1.7.2.user.js", import.meta.url).href;
const AUTO_RUN_PATTERN = /\(function\(\)\s*\{[\s\S]*$/;
const JQUERY_NO_CONFLICT_PATTERN = /var QQ = \$\.noConflict\(\);/;
const CUSTOM_MEGA_STONE_DESC_PATTERN = /^If held by (.+), this item allows it to Mega Evolve in battle\.$/;

let translatorPromise = null;
let cachedTranslator = null;
let translationQueue = Promise.resolve();

function buildTranslator(source) {
  const normalizedSource = source
    .replaceAll("NodeFilter.SHOW_Element", "NodeFilter.SHOW_ELEMENT")
    .replace(JQUERY_NO_CONFLICT_PATTERN, "var QQ = null;")
    .replace(AUTO_RUN_PATTERN, "");
  const factory = new Function(`${normalizedSource}\nreturn {translateElement, translateNode, t, translations};`);
  return factory();
}

function shouldSkipTextNode(node) {
  const parentTag = node.parentElement?.tagName;
  return parentTag === "SCRIPT" || parentTag === "STYLE" || parentTag === "TEXTAREA";
}

function translateNameList(translator, value) {
  return String(value || "")
    .split(/(\s*,\s*|\s+or\s+)/)
    .map((part) => {
      if (!part.trim()) {
        return part;
      }
      if (/^\s*,\s*$/.test(part)) {
        return "、";
      }
      if (/^\s+or\s+$/.test(part)) {
        return "或";
      }
      if (!translator?.t) {
        return part;
      }
      return translator.t(part.replaceAll("é", "e"));
    })
    .join("");
}

function translateCustomText(translator, originalValue) {
  const normalizedValue = String(originalValue || "");
  const megaStoneMatch = normalizedValue.match(CUSTOM_MEGA_STONE_DESC_PATTERN);
  if (megaStoneMatch) {
    const translatedNameList = translateNameList(translator, megaStoneMatch[1]);
    return `${translatedNameList}携带时可在战斗中进行超级进化。`;
  }
  return normalizedValue;
}

function translatePlainText(translator, originalValue) {
  const customTranslation = translateCustomText(translator, originalValue);
  if (customTranslation !== String(originalValue || "")) {
    return customTranslation;
  }
  if (!translator.t) {
    return originalValue;
  }
  return translator.t(String(originalValue || "").replaceAll("é", "e"));
}

function translateElementAttributes(translator, root) {
  const elements = [
    ...(root instanceof Element ? [root] : []),
    ...root.querySelectorAll?.("[title], [aria-label]") || [],
  ];
  elements.forEach((element) => {
    ["title", "aria-label"].forEach((attributeName) => {
      if (!element.hasAttribute(attributeName)) {
        return;
      }
      const originalValue = element.getAttribute(attributeName);
      const translatedValue = translatePlainText(translator, originalValue);
      if (translatedValue && translatedValue !== originalValue) {
        element.setAttribute(attributeName, translatedValue);
      }
    });
  });
}

function walkAndTranslateTextNodes(translator, root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();
  while (currentNode) {
    if (!shouldSkipTextNode(currentNode)) {
      const originalValue = currentNode.nodeValue;
      translator.translateNode(currentNode);
      if (currentNode.nodeValue === originalValue) {
        currentNode.nodeValue = translatePlainText(translator, originalValue);
      }
    }
    currentNode = walker.nextNode();
  }
}

async function loadTranslator() {
  if (translatorPromise) {
    return translatorPromise;
  }
  translatorPromise = fetch(PSCHINA_SCRIPT_PATH)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load: ${PSCHINA_SCRIPT_PATH}`);
      }
      return response.text();
    })
    .then(buildTranslator)
    .catch((error) => {
      console.error("PSChina 翻译脚本加载失败", error);
      translatorPromise = null;
      return null;
    });
  return translatorPromise;
}

function normalizeRoots(roots) {
  const rootList = Array.isArray(roots) ? roots : [roots];
  return [...new Set(rootList.filter((root) => root instanceof Element || root === document.body))];
}

async function translateRoots(language, roots) {
  if (language !== "zh") {
    return;
  }
  const normalizedRoots = normalizeRoots(roots);
  if (!normalizedRoots.length) {
    return;
  }
  const translator = await loadTranslator();
  if (!translator?.translateNode) {
    return;
  }
  normalizedRoots.forEach((root) => {
    if (translator.translateElement) {
      translator.translateElement(root);
    }
    translateElementAttributes(translator, root);
    walkAndTranslateTextNodes(translator, root);
  });
}

export function applyPsChinaTranslation(language, roots = document.body) {
  translationQueue = translationQueue
    .catch(() => {})
    .then(() => translateRoots(language, roots));
  return translationQueue;
}

export async function translatePsChinaBatch(language, values = []) {
  if (language !== "zh") {
    return values;
  }
  const translator = await loadTranslator();
  if (!translator) {
    return values;
  }
  return values.map((value) => translatePlainText(translator, value));
}

export async function translatePsChinaText(language, text) {
  if (language !== "zh") {
    return text;
  }
  const translator = await loadTranslator();
  if (!translator) {
    return text;
  }
  return translatePlainText(translator, text);
}
