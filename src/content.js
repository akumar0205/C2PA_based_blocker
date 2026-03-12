(() => {
  const DEFAULT_OPTIONS = {
    enabled: true,
    strictMode: false,
    verifyCryptographic: true,
    allowlist: "",
    replaceMode: "annotate",
    autoReplaceConfidence: "high"
  };

  const processedElements = new WeakSet();
  const urlResults = new Map();
  const pendingQueue = [];
  const annotatedElements = new Set();
  let inFlight = 0;
  const maxConcurrent = 4;
  let replacementCount = 0;
  let userOptions = { ...DEFAULT_OPTIONS };

  function normalizeHost(hostname) {
    return hostname.replace(/^www\./, "").toLowerCase();
  }

  function isAllowlisted(options) {
    const current = normalizeHost(location.hostname);
    const entries = (options.allowlist || "")
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map(normalizeHost);

    return entries.some((domain) => current === domain || current.endsWith(`.${domain}`));
  }

  function shouldSkipImage(img) {
    if (processedElements.has(img)) return true;
    if (!img.isConnected) return true;
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (width > 0 && height > 0 && width * height < 2500) return true;
    return false;
  }

  function resolveCandidateUrl(img) {
    const candidates = [
      img.currentSrc,
      img.src,
      img.getAttribute("data-src"),
      img.getAttribute("data-original"),
      img.getAttribute("data-lazy-src")
    ].filter(Boolean);

    if (!candidates.length && img.srcset) {
      return img.srcset.split(",")[0]?.trim().split(" ")[0] || null;
    }

    return candidates[0] || null;
  }

  function shouldReplace(result, options) {
    if (options.replaceMode !== "replace") return false;
    if (result.verified && result.flagged && result.confidence === "high") return true;

    if (options.strictMode && result.metadataFound && !result.verified) {
      return true;
    }

    const confidenceOrder = ["low", "medium", "high"];
    const threshold = options.autoReplaceConfidence || "high";
    const resultLevel = confidenceOrder.indexOf(result.confidence || "low");
    const thresholdLevel = confidenceOrder.indexOf(threshold);

    return result.flagged && resultLevel >= thresholdLevel;
  }

  function createPlaceholder(original, reason) {
    const warningUrl = chrome.runtime.getURL("assets/ai-warning.svg");
    original.dataset.c2paOriginalSrc = original.src || "";
    original.dataset.c2paOriginalSrcset = original.srcset || "";
    original.dataset.c2paReason = reason || "flagged";
    original.src = warningUrl;
    original.srcset = "";
    original.alt = "This image was hidden due to AI-generation signals";
    original.title = `Replaced by C2PA AI Image Blocker (${reason})`;
    original.style.objectFit = "contain";
    original.style.background = "#fff";
  }

  function ensureAnnotationStyle() {
    if (document.getElementById("c2pa-annotation-style")) return;
    const style = document.createElement("style");
    style.id = "c2pa-annotation-style";
    style.textContent = `
      .c2pa-annotated { outline: 2px solid #f59e0b !important; outline-offset: 1px; }
      .c2pa-badge { position: absolute; top: 6px; right: 6px; z-index: 2147483647; border: 0; border-radius: 999px; font: 600 11px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 6px 8px; cursor: pointer; background: rgba(17,24,39,.9); color: #fff; }
      .c2pa-detail { position: absolute; top: 34px; right: 6px; z-index: 2147483647; width: 260px; background: rgba(17,24,39,.95); color: #fff; border-radius: 8px; padding: 8px 10px; font: 12px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.35); }
      .c2pa-detail[hidden] { display: none !important; }
      .c2pa-container { position: relative !important; }
    `;
    document.documentElement.appendChild(style);
  }

  function annotateImage(img, result, url) {
    if (img.dataset.c2paAnnotated === "true") return;
    ensureAnnotationStyle();
    const parent = img.parentElement;
    if (!parent) return;

    parent.classList.add("c2pa-container");
    img.classList.add("c2pa-annotated");
    img.dataset.c2paAnnotated = "true";

    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = "c2pa-badge";
    badge.textContent = "AI signal";
    badge.setAttribute("aria-label", "Why blocked");

    const detail = document.createElement("div");
    detail.className = "c2pa-detail";
    detail.hidden = true;
    detail.textContent = `Why flagged: ${result.reason}. Confidence: ${result.confidence}. Verified: ${result.verified ? "yes" : "no"}. Source: ${result.verified ? "cryptographic" : "heuristic/partial"}. URL: ${url}`;

    badge.addEventListener("click", (event) => {
      event.preventDefault();
      detail.hidden = !detail.hidden;
    });

    parent.appendChild(badge);
    parent.appendChild(detail);
    img.dataset.c2paBadgeId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    badge.dataset.c2paFor = img.dataset.c2paBadgeId;
    detail.dataset.c2paFor = img.dataset.c2paBadgeId;
    annotatedElements.add(img);
  }

  function clearAnnotationsAndRestore() {
    const images = document.querySelectorAll("img[data-c2pa-original-src], img[data-c2pa-annotated='true']");
    images.forEach((img) => {
      if (img.dataset.c2paOriginalSrc !== undefined) {
        img.src = img.dataset.c2paOriginalSrc || img.src;
        img.srcset = img.dataset.c2paOriginalSrcset || img.srcset;
      }

      if (img.dataset.c2paAnnotated === "true") {
        img.classList.remove("c2pa-annotated");
      }

      const key = img.dataset.c2paBadgeId;
      if (key) {
        img.parentElement?.querySelectorAll(`[data-c2pa-for='${key}']`).forEach((node) => node.remove());
      }

      delete img.dataset.c2paOriginalSrc;
      delete img.dataset.c2paOriginalSrcset;
      delete img.dataset.c2paReason;
      delete img.dataset.c2paAnnotated;
      delete img.dataset.c2paBadgeId;
      processedElements.delete?.(img);
    });

    replacementCount = 0;
    notifyBadge();
  }

  function notifyBadge() {
    chrome.runtime.sendMessage({ type: "SET_BADGE_COUNT", count: replacementCount }, () => {
      void chrome.runtime.lastError;
    });
  }

  async function analyzeUrl(url) {
    if (urlResults.has(url)) {
      return urlResults.get(url);
    }

    const result = await window.C2PADetector.analyzeImage(url, userOptions.verifyCryptographic);
    urlResults.set(url, result);
    return result;
  }

  function queueImage(img) {
    pendingQueue.push(img);
    processQueue();
  }

  function processQueue() {
    while (inFlight < maxConcurrent && pendingQueue.length > 0) {
      const img = pendingQueue.shift();
      inFlight += 1;
      processImage(img)
        .catch(() => {})
        .finally(() => {
          inFlight -= 1;
          processQueue();
        });
    }
  }

  async function processImage(img) {
    if (!userOptions.enabled || isAllowlisted(userOptions) || shouldSkipImage(img)) {
      processedElements.add(img);
      return;
    }

    const url = resolveCandidateUrl(img);
    if (!url || url.startsWith("data:")) {
      processedElements.add(img);
      return;
    }

    const result = await analyzeUrl(url);
    if (result.flagged) {
      annotateImage(img, result, url);
    }

    if (shouldReplace(result, userOptions)) {
      createPlaceholder(img, result.reason);
      replacementCount += 1;
      notifyBadge();
    }

    processedElements.add(img);
  }

  function scanImages(root = document) {
    const images = root.querySelectorAll?.("img") || [];
    images.forEach((img) => queueImage(img));

    const elements = root.querySelectorAll?.("[style*='background-image']") || [];
    elements.forEach((element) => {
      const style = getComputedStyle(element);
      const value = style.backgroundImage || "";
      const match = value.match(/url\(["']?(.*?)["']?\)/i);
      if (!match || !match[1]) return;

      const syntheticImg = new Image();
      syntheticImg.src = match[1];
      syntheticImg.width = element.clientWidth;
      syntheticImg.height = element.clientHeight;
      queueImage(syntheticImg);

      analyzeUrl(match[1]).then((result) => {
        if (!result.flagged) return;
        element.setAttribute("title", `AI signal (${result.confidence}) - ${result.reason}`);

        if (shouldReplace(result, userOptions)) {
          element.style.backgroundImage = `url('${chrome.runtime.getURL("assets/ai-warning.svg")}')`;
          element.style.backgroundSize = "contain";
          element.style.backgroundRepeat = "no-repeat";
          element.style.backgroundPosition = "center";
          replacementCount += 1;
          notifyBadge();
        }
      });
    });
  }

  function observeDomChanges() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.tagName === "IMG") {
            queueImage(node);
          } else {
            scanImages(node);
          }
        }
      }
    });

    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true
    });
  }

  function loadOptions() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULT_OPTIONS, (result) => {
        userOptions = result;
        resolve(result);
      });
    });
  }

  function isTemporarilyPaused() {
    return new Promise((resolve) => {
      const host = normalizeHost(location.hostname);
      chrome.storage.local.get({ temporaryPauses: {} }, (result) => {
        const pauses = result.temporaryPauses || {};
        const expiresAt = pauses[host];
        if (!expiresAt) {
          resolve(false);
          return;
        }

        if (Date.now() > expiresAt) {
          delete pauses[host];
          chrome.storage.local.set({ temporaryPauses: pauses }, () => resolve(false));
          return;
        }

        resolve(true);
      });
    });
  }

  function installMessageHandlers() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "C2PA_RESTORE_ALL") {
        clearAnnotationsAndRestore();
        sendResponse({ ok: true });
        return true;
      }

      if (message?.type === "C2PA_RESCAN") {
        scanImages(document);
        sendResponse({ ok: true });
        return true;
      }

      return false;
    });
  }

  async function init() {
    await loadOptions();
    installMessageHandlers();
    const paused = await isTemporarilyPaused();
    if (!userOptions.enabled || isAllowlisted(userOptions) || paused) return;
    scanImages(document);
    observeDomChanges();
  }

  init();
})();
