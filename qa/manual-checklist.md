# Manual QA Checklist

## Setup
1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and choose this repository folder.
4. Open extension options and verify defaults:
   - [ ] Enable image replacement: **checked**
   - [ ] Strict mode: **unchecked**
   - [ ] Cryptographic verification: **checked**
   - [ ] Allowlist: **empty**

## Scenarios

### Basic Detection

| Scenario | Sample page | Strict mode | Crypto verify | Expected result |
|---|---|---|---|---|
| AI marker and C2PA-style marker in payload | `qa/samples/ai-c2pa.html` | Off | On | Image is replaced with warning image (high confidence) |
| Non-AI image | `qa/samples/non-ai.html` | Off | On | Image is not replaced |
| Missing metadata but AI-like URL | `qa/samples/ai-url-only.html` | Off | On | Image is replaced (low-confidence heuristic) |
| Metadata present but not verifiable | `qa/samples/c2pa-unverified.html` | Off | On | Image is not replaced |
| Metadata present but not verifiable | `qa/samples/c2pa-unverified.html` | On | On | Image is replaced |
| Dynamic image insertion | `qa/samples/dynamic-image.html` | Off | On | Newly inserted image is processed and replaced if flagged |

### Cryptographic Verification Tests

| Scenario | Settings | Expected result |
|---|---|---|
| C2PA manifest with valid AI claim | Crypto: On, Strict: Off | Image replaced, reason: `ai_generated_verified_signature` |
| C2PA manifest with valid non-AI claim | Crypto: On, Strict: Off | Image NOT replaced, reason: `c2pa_verified_no_ai_claim` |
| C2PA manifest with invalid signature | Crypto: On, Strict: Off | Image replaced, reason: `c2pa_signature_invalid` |
| Crypto verification disabled | Crypto: Off | Falls back to heuristic detection |
| C2PA present, AI indicators, no signature | Crypto: On, Strict: On | Image replaced (unverified C2PA + strict mode) |

### Options Page Tests

| Setting | Test | Expected |
|---|---|---|
| Enable image replacement | Uncheck and reload page | No images replaced, badge not shown |
| Strict mode | Check, load c2pa-unverified.html | Unverified C2PA images are replaced |
| Cryptographic verification | Uncheck, load ai-c2pa.html | Falls back to heuristic detection (lower confidence) |
| Allowlist | Add `localhost` to allowlist | Images on localhost not replaced |

## Verification Steps

### To verify cryptographic detection is working:
1. Open Chrome DevTools on a test page
2. Go to Console tab
3. Look for detection results with `verified: true` and confidence level
4. Check reason field shows `*_verified_signature` for crypto-verified images

### To check detailed manifest info:
```javascript
// In console on a page with C2PA images
await window.C2PADetector.getManifestDetails('URL_OF_IMAGE');
```

## Additional checks
- [ ] Confirm extension badge count increments when images are replaced
- [ ] Confirm allowlisted domains bypass replacement
- [ ] Confirm tiny icons are skipped (performance guardrail)
- [ ] Confirm cryptographic verification can be disabled via options
- [ ] Confirm fallback to heuristics works when crypto is disabled
- [ ] Confirm high confidence images (crypto verified) are prioritized

## Sample C2PA Test Images

For testing with real C2PA images, you can use:
- [Content Authenticity Initiative examples](https://contentauthenticity.org/examples)
- [C2PA Viewer test images](https://c2paviewer.com)
- Images exported from Adobe Photoshop with Content Credentials
- Images from AI tools that support C2PA (Firefly, Midjourney, etc.)

## Troubleshooting

### No cryptographic verification happening
- Check that `verifyCryptographic` option is enabled
- Check that `c2pa-verifier.js` is loaded (no console errors)
- Verify image actually contains C2PA manifest (not all do)

### False positives (images incorrectly flagged)
- Check the `reason` field in detection results
- If `url_pattern_heuristic`, consider refining URL patterns
- If `ai_markers_found_no_c2pa`, image may have AI metadata without C2PA

### False negatives (AI images not caught)
- Check if image has C2PA metadata
- If no C2PA, verify AI markers are present in image bytes
- Consider enabling strict mode for unverified C2PA detection
