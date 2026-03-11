(() => {
  const C2PA_MARKERS = ["c2pa", "jumb", "manifeststore", "contentcredentials"];
  const AI_MARKERS = [
    "generated",
    "ai",
    "synthetic",
    "firefly",
    "midjourney",
    "dall-e",
    "stable diffusion",
    "imagen",
    "gpt-image"
  ];

  async function fetchBytes(url, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal, credentials: "omit" });
      if (!response.ok) {
        return { ok: false, reason: `HTTP ${response.status}` };
      }
      const buffer = await response.arrayBuffer();
      return { ok: true, bytes: new Uint8Array(buffer) };
    } catch (error) {
      return { ok: false, reason: error?.message || "fetch_failed" };
    } finally {
      clearTimeout(timer);
    }
  }

  function decodePreview(bytes, limit = 512 * 1024) {
    const slice = bytes.slice(0, Math.min(limit, bytes.length));
    return new TextDecoder("utf-8", { fatal: false }).decode(slice).toLowerCase();
  }

  function hasAny(text, markers) {
    return markers.some((marker) => text.includes(marker));
  }

  function estimateFromUrl(url) {
    const lower = url.toLowerCase();
    if (lower.includes("ai") || lower.includes("generated") || lower.includes("synthetic")) {
      return {
        flagged: true,
        confidence: "low",
        verified: false,
        metadataFound: false,
        reason: "url_pattern_heuristic"
      };
    }

    return {
      flagged: false,
      confidence: "low",
      verified: false,
      metadataFound: false,
      reason: "no_url_signal"
    };
  }

  async function analyzeImage(url) {
    const urlSignal = estimateFromUrl(url);
    const fetched = await fetchBytes(url);

    if (!fetched.ok) {
      return {
        ...urlSignal,
        reason: `fetch_unavailable:${fetched.reason}`
      };
    }

    const preview = decodePreview(fetched.bytes);
    const hasC2PA = hasAny(preview, C2PA_MARKERS);
    const hasAIClaim = hasAny(preview, AI_MARKERS);

    if (hasC2PA && hasAIClaim) {
      return {
        flagged: true,
        confidence: "medium",
        verified: false,
        metadataFound: true,
        reason: "c2pa_and_ai_markers_found"
      };
    }

    if (hasC2PA) {
      return {
        flagged: false,
        confidence: "medium",
        verified: false,
        metadataFound: true,
        reason: "c2pa_found_without_ai_claim"
      };
    }

    if (hasAIClaim) {
      return {
        flagged: true,
        confidence: "low",
        verified: false,
        metadataFound: false,
        reason: "ai_markers_found_without_c2pa"
      };
    }

    return {
      ...urlSignal,
      reason: "no_metadata_signal"
    };
  }

  window.C2PADetector = {
    analyzeImage
  };
})();
