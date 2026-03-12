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

  /**
   * Fetch image bytes with timeout
   */
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

  /**
   * Decode bytes to lowercase text for marker detection
   */
  function decodePreview(bytes, limit = 512 * 1024) {
    const slice = bytes.slice(0, Math.min(limit, bytes.length));
    return new TextDecoder("utf-8", { fatal: false }).decode(slice).toLowerCase();
  }

  /**
   * Check if any marker exists in text
   */
  function hasAny(text, markers) {
    return markers.some((marker) => text.includes(marker));
  }

  /**
   * Estimate AI probability from URL patterns (fallback heuristic)
   */
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

  /**
   * Check if C2PA cryptographic verifier is available and enabled
   */
  function isCryptographicVerifierAvailable(enabled = true) {
    if (!enabled) return false;
    return typeof window.C2PAVerifier !== "undefined" && 
           typeof window.C2PAVerifier.verifyManifest === "function";
  }

  /**
   * Analyze image using cryptographic C2PA verification
   */
  async function analyzeWithCryptographicVerification(bytes, urlSignal) {
    try {
      const verificationResult = await window.C2PAVerifier.verifyManifest(bytes);
      
      if (!verificationResult.hasC2PA) {
        // No C2PA found, fall back to heuristic detection
        if (urlSignal.flagged) {
          return {
            flagged: true,
            confidence: "low",
            verified: false,
            metadataFound: false,
            reason: "ai_markers_in_url_no_c2pa"
          };
        }
        
        // Check for AI markers in bytes without C2PA
        const preview = decodePreview(bytes);
        const hasAIMarkers = hasAny(preview, AI_MARKERS);
        
        if (hasAIMarkers) {
          return {
            flagged: true,
            confidence: "low",
            verified: false,
            metadataFound: false,
            reason: "ai_markers_found_no_c2pa"
          };
        }
        
        return {
          flagged: false,
          confidence: "low",
          verified: false,
          metadataFound: false,
          reason: "no_c2pa_metadata"
        };
      }

      // C2PA manifest found
      const hasSignature = verificationResult.hasSignature;
      const signatureValid = verificationResult.signatureValid;
      const isAIGenerated = verificationResult.aiGenerated;
      
      // Decision logic based on verification results
      if (isAIGenerated) {
        return {
          flagged: true,
          confidence: hasSignature && signatureValid ? "high" : "medium",
          verified: hasSignature && signatureValid,
          metadataFound: true,
          reason: hasSignature && signatureValid 
            ? `ai_generated_verified_signature (${verificationResult.aiIndicators.join(", ")})`
            : `ai_generated_unverified (${verificationResult.aiIndicators.join(", ")})`,
          details: verificationResult.details
        };
      }

      // C2PA present but no AI indicators
      if (hasSignature && signatureValid) {
        return {
          flagged: false,
          confidence: "high",
          verified: true,
          metadataFound: true,
          reason: "c2pa_verified_no_ai_claim",
          details: verificationResult.details
        };
      }

      if (hasSignature && !signatureValid) {
        return {
          flagged: true,
          confidence: "medium",
          verified: false,
          metadataFound: true,
          reason: "c2pa_signature_invalid",
          details: verificationResult.details
        };
      }

      return {
        flagged: false,
        confidence: "low",
        verified: false,
        metadataFound: true,
        reason: "c2pa_present_no_signature",
        details: verificationResult.details
      };
      
    } catch (error) {
      // Fallback to heuristic detection on error
      return {
        flagged: urlSignal.flagged,
        confidence: "low",
        verified: false,
        metadataFound: false,
        reason: `cryptographic_verification_error: ${error.message}`,
        fallback: true
      };
    }
  }

  /**
   * Analyze image using heuristic detection (original method)
   */
  async function analyzeWithHeuristics(bytes, urlSignal) {
    const preview = decodePreview(bytes);
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

  /**
   * Main image analysis function
   * Tries cryptographic verification first, falls back to heuristics
   * @param {string} url - Image URL to analyze
   * @param {boolean} useCryptographic - Whether to use cryptographic verification (default: true)
   */
  async function analyzeImage(url, useCryptographic = true) {
    const urlSignal = estimateFromUrl(url);
    const fetched = await fetchBytes(url);

    if (!fetched.ok) {
      return {
        ...urlSignal,
        reason: `fetch_unavailable:${fetched.reason}`
      };
    }

    // Try cryptographic verification if available and enabled
    if (isCryptographicVerifierAvailable(useCryptographic)) {
      return await analyzeWithCryptographicVerification(fetched.bytes, urlSignal);
    }

    // Fall back to heuristic detection
    return await analyzeWithHeuristics(fetched.bytes, urlSignal);
  }

  /**
   * Get detailed manifest information for display/debugging
   */
  async function getManifestDetails(url) {
    const fetched = await fetchBytes(url);
    if (!fetched.ok) {
      return { error: `Failed to fetch: ${fetched.reason}` };
    }

    if (!isCryptographicVerifierAvailable()) {
      return { error: "Cryptographic verifier not available" };
    }

    const verificationResult = await window.C2PAVerifier.verifyManifest(fetched.bytes);
    const manifestJSON = window.C2PAVerifier.extractManifestJSON(fetched.bytes);

    return {
      verification: verificationResult,
      extractedJSON: manifestJSON
    };
  }

  // Expose public API
  window.C2PADetector = {
    analyzeImage,
    getManifestDetails,
    isCryptographicVerifierAvailable
  };
})();
