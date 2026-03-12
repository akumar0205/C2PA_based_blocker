(() => {
  const DEFAULT_OPTIONS = {
    enabled: true,
    strictMode: false,
    verifyCryptographic: true,
    allowlist: ""
  };

  const processedElements = new WeakSet();
  const urlResults = new Map();
  const pendingQueue = [];
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

  function shouldReplace(result, strictMode) {
    if (result.verified && result.flagged) return true;
    if (result.metadataFound && !result.verified && strictMode) return true;
    return result.flagged;
  }

  function createPlaceholder(original, reason) {
    const warningUrl = chrome.runtime.getURL("assets/ai-warning.svg");
    original.dataset.c2paOriginalSrc = original.src || "";
    original.dataset.c2paReason = reason || "flagged";
    original.src = warningUrl;
    original.srcset = "";
    original.alt = "This image was AI generated";
    original.title = `Replaced by C2PA AI Image Blocker (${reason})`;
    original.style.objectFit = "contain";
    original.style.background = "#fff";
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
    if (shouldReplace(result, userOptions.strictMode)) {
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
        if (shouldReplace(result, userOptions.strictMode)) {
          element.style.backgroundImage = `url('${chrome.runtime.getURL("assets/ai-warning.svg")}')`;
          element.style.backgroundSize = "contain";
          element.style.backgroundRepeat = "no-repeat";
          element.style.backgroundPosition = "center";
          element.setAttribute("title", `Replaced by C2PA AI Image Blocker (${result.reason})`);
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

  async function init() {
    await loadOptions();
    if (!userOptions.enabled || isAllowlisted(userOptions)) return;
    scanImages(document);
    observeDomChanges();
  }

  init();
})();
