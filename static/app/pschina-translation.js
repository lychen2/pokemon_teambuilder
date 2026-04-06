const PSCHINA_SCRIPT_PATH = new URL("../../PSChina%20Server%20Translation%20SV-1.7.2.user.js", import.meta.url).href;
const AUTO_RUN_PATTERN = /\(function\(\)\s*\{[\s\S]*$/;
const JQUERY_NO_CONFLICT_PATTERN = /var QQ = \$\.noConflict\(\);/;

let translatorPromise = null;

function buildTranslator(source) {
  const normalizedSource = source
    .replaceAll("NodeFilter.SHOW_Element", "NodeFilter.SHOW_ELEMENT")
    .replace(JQUERY_NO_CONFLICT_PATTERN, "var QQ = null;")
    .replace(AUTO_RUN_PATTERN, "");
  const factory = new Function(`${normalizedSource}\nreturn {translateElement, translateNode, t};`);
  return factory();
}

function shouldSkipTextNode(node) {
  const parentTag = node.parentElement?.tagName;
  return parentTag === "SCRIPT" || parentTag === "STYLE" || parentTag === "TEXTAREA";
}

function translatePlainText(translator, originalValue) {
  if (!translator.t) {
    return originalValue;
  }
  return translator.t(String(originalValue || "").replaceAll("é", "e"));
}

function walkAndTranslateTextNodes(translator) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
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

export async function applyPsChinaTranslation(language) {
  if (language !== "zh") {
    return;
  }
  const translator = await loadTranslator();
  if (!translator?.translateNode || !document.body) {
    return;
  }
  if (translator.translateElement) {
    translator.translateElement(document.body);
  }
  walkAndTranslateTextNodes(translator);
}
