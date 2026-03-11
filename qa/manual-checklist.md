# Manual QA Checklist

## Setup
1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and choose this repository folder.
4. Open extension options and verify defaults.

## Scenarios

| Scenario | Sample page | Strict mode | Expected result |
|---|---|---|---|
| AI marker and C2PA-style marker in payload | `qa/samples/ai-c2pa.html` | Off | Image is replaced with warning image |
| Non-AI image | `qa/samples/non-ai.html` | Off | Image is not replaced |
| Missing metadata but AI-like URL | `qa/samples/ai-url-only.html` | Off | Image is replaced (low-confidence heuristic) |
| Metadata present but not verifiable | `qa/samples/c2pa-unverified.html` | Off | Image is not replaced |
| Metadata present but not verifiable | `qa/samples/c2pa-unverified.html` | On | Image is replaced |
| Dynamic image insertion | `qa/samples/dynamic-image.html` | Off | Newly inserted image is processed and replaced if flagged |

## Additional checks
- Confirm extension badge count increments when images are replaced.
- Confirm allowlisted domains bypass replacement.
- Confirm tiny icons are skipped (performance guardrail).
