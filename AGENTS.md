# C2PA AI Image Blocker - Agent Guide

## Project Overview

This is a **Chrome Extension (Manifest V3)** that scans web pages for images containing C2PA metadata, cryptographically verifies C2PA signatures, detects AI-generation signals, and replaces flagged images with a warning placeholder.

**Key feature:** This version includes **cryptographic C2PA signature verification** using a lightweight JUMBF parser and COSE signature handler implemented in vanilla JavaScript with the Web Crypto API.

## Technology Stack

- **Platform:** Chrome Extension Manifest V3
- **Languages:** Vanilla JavaScript (ES6+), HTML, CSS, SVG
- **No build tools:** Directly loadable extension (no webpack, vite, etc.)
- **No dependencies:** No npm packages or external libraries
- **Crypto:** Web Crypto API for signature verification

## Project Structure

```
.
├── manifest.json          # Extension manifest (Manifest V3)
├── README.md              # Human-facing documentation
├── AGENTS.md              # This file - AI agent guide
├── assets/
│   └── ai-warning.svg     # Replacement warning image
├── src/
│   ├── background.js      # Service worker - badge counter
│   ├── c2pa-verifier.js   # NEW: Cryptographic C2PA verification module
│   ├── c2pa-detector.js   # Detection heuristics + crypto integration
│   ├── content.js         # Content script - image scanning
│   ├── options.html       # Options page markup
│   ├── options.js         # Options page logic
│   └── options.css        # Options page styles
└── qa/
    ├── manual-checklist.md       # Manual testing guide
    └── samples/                  # Test pages and assets
        ├── ai-c2pa.html
        ├── ai-url-only.html
        ├── c2pa-unverified.html
        ├── dynamic-image.html
        ├── non-ai.html
        └── assets/
            ├── ai-c2pa-signal.svg
            ├── c2pa-only.svg
            └── non-ai.svg
```

## Core Components

### 1. C2PA Verifier (`src/c2pa-verifier.js`) - NEW

**Purpose:** Cryptographic verification of C2PA manifests

**Key functions:**
- `verifyManifest(bytes)` - Main entry point for manifest verification
- `parseJUMBFBox(bytes)` - Parses JUMBF (JPEG Universal Metadata Box Format) structures
- `parseCOSESign1(data)` - Parses COSE (CBOR Object Signing and Encryption) signatures
- `extractCertificate(coseData)` - Extracts X.509 certificates from COSE headers
- `checkAIGeneration(assertions, rawBytes)` - Detects AI-generation assertions

**JUMBF Box Structure:**
```
JUMBF Superbox
├── Description Box (label, UUID)
├── Content Boxes
└── Nested Superboxes
```

**C2PA UUIDs:**
- Manifest Store: `63327061-0011-0010-8000-00AA00389B71`
- Manifest: `63326D61-0011-0010-8000-00AA00389B71`
- Assertion Store: `63326173-0011-0010-8000-00AA00389B71`
- Claim: `6332636C-0011-0010-8000-00AA00389B71`
- Signature: `63326373-0011-0010-8000-00AA00389B71`

**COSE_Sign1 Structure:**
```
[
  protectedHeaders:   { 1: algorithm, 3: contentType }
  unprotectedHeaders: { 33: [x5c certificates] }
  payload:           claimBytes
  signature:         signatureBytes
]
```

**API:**
```javascript
window.C2PAVerifier = {
  verifyManifest,
  extractManifestJSON,
  _internal: { parseJUMBFBox, parseCBOR, parseCOSESign1, findC2PAManifestStore }
}
```

### 2. C2PA Detector (`src/c2pa-detector.js`)

**Purpose:** High-level detection API integrating cryptographic and heuristic analysis

**Key functions:**
- `analyzeImage(url, useCryptographic)` - Main analysis function
- `analyzeWithCryptographicVerification(bytes, urlSignal)` - Crypto-based detection
- `analyzeWithHeuristics(bytes, urlSignal)` - Fallback heuristic detection
- `getManifestDetails(url)` - Get detailed manifest info for debugging

**Detection flow:**
1. Fetch image bytes
2. If `useCryptographic=true` and `C2PAVerifier` available:
   - Call `verifyManifest()`
   - Check for AI-generation assertions
   - Return verified/unverified result with confidence
3. Fallback to heuristic detection:
   - Search for C2PA markers (`c2pa`, `jumb`, `manifeststore`)
   - Search for AI markers (`firefly`, `midjourney`, `dall-e`, etc.)

**API:**
```javascript
window.C2PADetector = {
  analyzeImage,
  getManifestDetails,
  isCryptographicVerifierAvailable
}
```

### 3. Content Script (`src/content.js`)

**Runs on:** All web pages (`<all_urls>`)
**Entry point:** `document_idle`

**Responsibilities:**
- Scans `<img>` tags for C2PA/AI signals
- Detects CSS `background-image` properties
- Watches for dynamically inserted images via `MutationObserver`
- Replaces flagged images with warning placeholder
- Manages concurrent image processing (max 4 in-flight)
- Skips tiny images (< 2500 pixels) for performance

**Options used:**
- `enabled` - Enable/disable replacement
- `strictMode` - Replace when C2PA exists but unverified
- `verifyCryptographic` - Enable/disable crypto verification
- `allowlist` - Domain exclusions

### 4. Background Service Worker (`src/background.js`)

**Type:** Service worker (Manifest V3)

**Responsibilities:**
- Sets badge background color on install
- Receives `SET_BADGE_COUNT` messages from content script
- Updates extension badge with replacement count

### 5. Options Page (`src/options.html`, `src/options.js`, `src/options.css`)

**Storage:** `chrome.storage.sync`

**Settings:**
- `enabled` (boolean): Enable/disable image replacement
- `strictMode` (boolean): Replace when C2PA metadata exists but cannot be verified
- `verifyCryptographic` (boolean): Enable cryptographic signature verification
- `allowlist` (string): Comma/newline-separated domain allowlist

## Detection Logic

### Image Replacement Rules

| C2PA Present | AI Indicators | Signature Valid | Strict Mode | Result |
|--------------|---------------|-----------------|-------------|--------|
| Yes | Yes | Yes | Any | Replace (High confidence) |
| Yes | Yes | No | Any | Replace (Medium confidence) |
| Yes | No | Yes | Any | Keep (Verified authentic) |
| Yes | No | No | On | Replace (Unverified) |
| Yes | No | No | Off | Keep |
| No | Yes | N/A | Any | Replace (Low confidence) |
| No | No | N/A | Any | Keep |

### Confidence Levels

- **High** - C2PA present with valid cryptographic signature
- **Medium** - C2PA present but signature unverified or heuristic match
- **Low** - Heuristic detection only (URL patterns, byte markers)

### AI Generation Indicators

**Assertions checked:**
- `c2pa.actions.v2` with AI actions
- `c2pa.ai_generated` flag
- `c2pa.digital_source_type` with values:
  - `trainedAlgorithmicMedia`
  - `compositeWithTrainedAlgorithmicMedia`
  - `computationalMedia`
- Software agents: `firefly`, `midjourney`, `dall-e`, `stable diffusion`, `imagen`, `gpt-image`

## Installation & Testing

### Load Extension Locally
1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the project root directory

### Run Test Server
```bash
python3 -m http.server 8080
```

### Test Pages
- `http://localhost:8080/qa/samples/ai-c2pa.html` - AI + C2PA markers
- `http://localhost:8080/qa/samples/non-ai.html` - No markers
- `http://localhost:8080/qa/samples/ai-url-only.html` - AI pattern in URL only
- `http://localhost:8080/qa/samples/c2pa-unverified.html` - C2PA without AI claim
- `http://localhost:8080/qa/samples/dynamic-image.html` - Dynamic insertion test

### Manual QA Checklist
See `qa/manual-checklist.md` for detailed test scenarios.

## Development Conventions

### Code Style
- Use vanilla JavaScript (no frameworks)
- IIFE pattern for module isolation
- `const`/`let` preferred over `var`
- Early return pattern for guard clauses
- Comments in English

### Error Handling
- Fetch timeouts: 5 seconds
- Failed fetches gracefully fall back to URL-only heuristics
- `chrome.runtime.lastError` checked to suppress errors
- Crypto verification errors fall back to heuristic detection

### Performance Considerations
- Max 4 concurrent image fetches (`maxConcurrent = 4`)
- Images smaller than 2500 pixels are skipped
- `WeakSet` used for processed element tracking
- `Map` used for URL result caching
- Crypto verification skipped if option disabled

## Security Considerations

1. **Lightweight crypto verification** - Full X.509 chain validation to trust anchors is not implemented
2. **Credentials omitted** in fetch requests (`credentials: "omit"`)
3. **AbortController** used to prevent hanging requests
4. **CSP-compliant** - No inline scripts in HTML
5. **No remote manifests** - Remote manifest fetching disabled to prevent tracking beacons

## Permissions Required

- `storage` - Persist user options
- `tabs` - Access tab info for badge updates
- `host_permissions: <all_urls>` - Scan images on all websites

## Future Improvements

- Full X.509 certificate chain validation to trust anchors
- Integration with official c2pa-js library for production use
- Remote manifest support with privacy-preserving proxy
- Support for additional image formats (AVIF, HEIC)
- Hardware security module (HSM) integration for signing

## File Modification Guidelines

When modifying code:
1. Maintain Manifest V3 compatibility
2. Keep crypto verification logic in `c2pa-verifier.js`
3. Keep detection orchestration in `c2pa-detector.js`
4. Keep DOM manipulation in `content.js`
5. Update `manifest.json` if adding new permissions
6. Add test cases to `qa/samples/` for new detection scenarios
7. Update this file if architecture changes significantly
