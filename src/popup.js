const siteLabel = document.getElementById("siteLabel");
const pauseSiteBtn = document.getElementById("pauseSiteBtn");
const pauseHourBtn = document.getElementById("pauseHourBtn");
const restoreBtn = document.getElementById("restoreBtn");
const openOptionsBtn = document.getElementById("openOptionsBtn");
const statusEl = document.getElementById("status");

function normalizeHost(hostname) {
  return hostname.replace(/^www\./, "").toLowerCase();
}

function setStatus(text) {
  statusEl.textContent = text;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

function addAllowlistDomain(domain) {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ allowlist: "" }, (result) => {
      const existing = (result.allowlist || "")
        .split(/[,\n]/)
        .map((entry) => entry.trim())
        .filter(Boolean);

      if (!existing.includes(domain)) {
        existing.push(domain);
      }

      chrome.storage.sync.set({ allowlist: existing.join("\n") }, resolve);
    });
  });
}

function setTempPause(domain, durationMs) {
  return new Promise((resolve) => {
    chrome.storage.local.get({ temporaryPauses: {} }, (result) => {
      const pauses = result.temporaryPauses || {};
      pauses[domain] = Date.now() + durationMs;
      chrome.storage.local.set({ temporaryPauses: pauses }, resolve);
    });
  });
}

async function reloadActiveTab() {
  const tab = await getActiveTab();
  if (tab?.id) {
    await chrome.tabs.reload(tab.id);
  }
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab();
  if (!tab?.id) return false;

  try {
    await chrome.tabs.sendMessage(tab.id, message);
    return true;
  } catch (_error) {
    return false;
  }
}

async function init() {
  const tab = await getActiveTab();
  const host = (() => {
    try {
      return tab?.url ? normalizeHost(new URL(tab.url).hostname) : "";
    } catch (_error) {
      return "";
    }
  })();

  siteLabel.textContent = host ? `Current site: ${host}` : "Current site unavailable";

  pauseSiteBtn.addEventListener("click", async () => {
    if (!host) return;
    await addAllowlistDomain(host);
    setStatus("Paused on this site. Reloading...");
    await reloadActiveTab();
    window.close();
  });

  pauseHourBtn.addEventListener("click", async () => {
    if (!host) return;
    await setTempPause(host, 60 * 60 * 1000);
    setStatus("Paused for 1 hour. Reloading...");
    await reloadActiveTab();
    window.close();
  });

  restoreBtn.addEventListener("click", async () => {
    const ok = await sendToActiveTab({ type: "C2PA_RESTORE_ALL" });
    setStatus(ok ? "Restored flagged images on this tab." : "No content script on this page.");
  });

  openOptionsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}

init();
