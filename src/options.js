const DEFAULT_OPTIONS = {
  enabled: true,
  strictMode: false,
  allowlist: ""
};

const enabledInput = document.getElementById("enabled");
const strictModeInput = document.getElementById("strictMode");
const allowlistInput = document.getElementById("allowlist");
const saveButton = document.getElementById("saveButton");
const statusEl = document.getElementById("status");

function restoreOptions() {
  chrome.storage.sync.get(DEFAULT_OPTIONS, (options) => {
    enabledInput.checked = !!options.enabled;
    strictModeInput.checked = !!options.strictMode;
    allowlistInput.value = options.allowlist || "";
  });
}

function saveOptions() {
  const payload = {
    enabled: enabledInput.checked,
    strictMode: strictModeInput.checked,
    allowlist: allowlistInput.value
  };

  chrome.storage.sync.set(payload, () => {
    statusEl.textContent = "Options saved.";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 1200);
  });
}

document.addEventListener("DOMContentLoaded", restoreOptions);
saveButton.addEventListener("click", saveOptions);
