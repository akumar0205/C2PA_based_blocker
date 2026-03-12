# C2PA AI Image Blocker

A Chrome extension that cryptographically verifies C2PA metadata in images to detect AI-generated content and replaces flagged images with a warning placeholder.

## What this iteration includes

- **Manifest V3** extension scaffold with content script, background worker, and options page
- **Cryptographic C2PA verification** using Web Crypto API:
  - JUMBF (JPEG Universal Metadata Box Format) parsing
  - COSE (CBOR Object Signing and Encryption) signature extraction
  - X.509 certificate extraction from signatures
  - AI-generation assertion detection
- **Heuristic fallback** when cryptographic verification is unavailable
- Image scanning for:
  - `<img>` tags
  - Lazy image URL attributes (`data-src`, `data-original`, `data-lazy-src`)
  - CSS `background-image` usage
  - Dynamically inserted elements via `MutationObserver`
- Domain allowlist and strict-mode policy in options
- Soft-warning mode by default with per-image "Why flagged" explainability
- Popup quick actions (pause site, pause 1 hour, restore all on tab)
- Conservative auto-replace controls (mode + confidence threshold)
- Badge counter for number of replacements on the active tab

## C2PA Cryptographic Verification

This extension now includes a lightweight C2PA cryptographic signature verifier that:

1. **Parses JUMBF boxes** to locate C2PA manifest stores in image files
2. **Extracts COSE Sign1 signatures** from manifest structures
3. **Verifies X.509 certificate chains** embedded in signatures
4. **Detects AI-generation assertions** in manifest metadata

### Detection Logic

| C2PA State | AI Indicators | Signature | Confidence | Action |
|------------|--------------|-----------|------------|--------|
| Present | Yes | Valid | High | Replace |
| Present | Yes | Invalid/Unverified | Medium | Replace |
| Present | No | Valid | High | Keep |
| Present | No | Invalid | Medium | Keep (Strict: Replace) |
| Not Present | Yes | N/A | Low | Replace |
| Not Present | No | N/A | Low | Keep |

### AI Generation Indicators

The extension detects the following AI-related signals:
- `c2pa.ai_generated` assertions
- `c2pa.digital_source_type` with AI values
- Software agents: Firefly, Midjourney, DALL-E, Stable Diffusion, Imagen, GPT-Image
- Training/consent assertions for AI datasets

## Install locally

1. Clone this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this project directory.
5. Open extension options to configure verification settings and allowlist.

## Behavior

- **Default mode**: Soft-warning annotation for flagged images (no automatic replacement)
- **Strict mode**: In replace mode, also replace images where C2PA metadata exists but signature cannot be verified
- **Cryptographic verification**: Enable/disable cryptographic signature parsing (falls back to heuristics when disabled)
- **Allowlist**: Comma/newline-separated domains where scanning actions are disabled

## Manual validation

Use the test pages in `qa/samples/`.

### Serve local sample pages

From repo root:

```bash
python3 -m http.server 8080
```

Then open e.g.:

- `http://localhost:8080/qa/samples/ai-c2pa.html` - AI + C2PA markers
- `http://localhost:8080/qa/samples/non-ai.html` - No markers
- `http://localhost:8080/qa/samples/ai-url-only.html` - AI pattern in URL only
- `http://localhost:8080/qa/samples/c2pa-unverified.html` - C2PA without AI claim
- `http://localhost:8080/qa/samples/dynamic-image.html` - Dynamic insertion test

See full checklist: `qa/manual-checklist.md`.

## Technical Details

### C2PA Manifest Structure

C2PA manifests are embedded in images as JUMBF (JPEG Universal Metadata Box Format) boxes:

```
C2PA Manifest Store (JUMBF Superbox)
├── C2PA Manifest 1
│   ├── Assertion Store
│   │   ├── c2pa.actions (edit history)
│   │   ├── c2pa.ai_generated (AI indicators)
│   │   └── stds.schema-org.CreativeWork (authorship)
│   ├── Claim (cryptographic claims)
│   ├── Claim Signature (COSE Sign1)
│   └── Credential Store (X.509 certificates)
└── C2PA Manifest 2 (previous versions)...
```

### COSE Signature Verification

Signatures use COSE_Sign1 structure (RFC 8152):
- Protected headers (algorithm, content type)
- Unprotected headers (X.509 certificate chain)
- Payload (the C2PA claim)
- Signature (ECDSA or RSA)

### Limitations

- This implementation provides lightweight C2PA parsing suitable for Chrome extensions
- Full X.509 certificate chain validation to trust anchors is complex in vanilla JS
- For production-grade verification, consider integrating the official [c2pa-js](https://opensource.contentauthenticity.org/docs/c2pa-js/) library
- Remote manifest fetching is disabled for privacy (beacon tracking prevention)


## Adoption Friction & UX Improvements

If you are evaluating this extension, here are practical reasons some users may hesitate to install it, and concrete fixes to make it friendlier.

### Why some users may not want to use it

1. **False positives can feel disruptive**  
   The extension can replace images based on low-confidence URL or marker heuristics when no signed C2PA metadata is available, which may hide legitimate content.
2. **Hard to understand "why this image was replaced"**  
   The current UX replaces the image with a warning but does not expose a simple per-image explanation panel in-page.
3. **Trust model is lightweight, not full PKI validation**  
   The implementation notes that full trust-anchor certificate validation is not performed, so security-sensitive users may question assurance levels.
4. **Privacy/performance concerns on all pages**  
   Content scripts scan images broadly (`<all_urls>` host permissions) and may fetch image bytes, which can concern users who are sensitive to extension data access and page performance.
5. **Controls are hidden in options page**  
   There is no popup for quick temporary disable, site-level pause, or one-click "show original" recovery.
6. **Default behavior may be too opinionated**  
   Automatic replacement is enabled by default; some users prefer annotate-only mode first.

### How to make it more user-friendly

1. **Add a "soft warning" mode (default)**  
   Instead of immediate replacement, overlay a badge and let users click to hide/show or inspect details.
2. **Add per-image explainability UI**  
   Include a small "Why blocked?" link showing reason code, confidence, verification status, and detection source (crypto vs heuristic).
3. **Add quick controls in extension popup**  
   Provide:
   - Pause for this site
   - Pause for 1 hour
   - Show all blocked images on current tab
4. **Improve precision defaults**  
   Start in conservative mode: only auto-replace on verified C2PA AI assertions (high confidence), and visually flag medium/low confidence without replacing.
5. **Improve allowlist UX**  
   Convert free-text allowlist into tokenized domain chips with validation and import/export support.
6. **Expose transparent privacy language**  
   Add a plain-language data handling section in options/README: what is fetched, what is stored, and what is never sent remotely.
7. **Performance safety rails**  
   Add optional limits (max image size, max scans per page, pause scanning on heavy pages) and a small performance indicator in the popup.
8. **Accessibility and recovery**  
   Improve placeholder alt text/context and always offer one-click "restore original" for mistaken blocks.
9. **Trust clarity**  
   Label verification outcomes distinctly: `Verified AI`, `Unverified C2PA`, `Heuristic only`, with recommended user action per class.

## Project Structure

```
.
├── manifest.json          # Extension manifest (Manifest V3)
├── README.md              # This file
├── assets/
│   └── ai-warning.svg     # Replacement warning image
├── src/
│   ├── background.js      # Service worker - badge counter
│   ├── c2pa-verifier.js   # NEW: Cryptographic C2PA verification
│   ├── c2pa-detector.js   # Detection heuristics + crypto integration
│   ├── content.js         # Content script - image scanning
│   ├── options.html       # Options page markup
│   ├── options.js         # Options page logic
│   └── options.css        # Options page styles
└── qa/
    ├── manual-checklist.md
    └── samples/
```

## Version History

- **v0.2.0** - Added cryptographic C2PA signature verification
- **v0.1.0** - Initial release with heuristic detection only

## License

MIT License
