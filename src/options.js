const DEFAULT_OPTIONS = {
  enabled: true,
  strictMode: false,
  verifyCryptographic: true,
  allowlist: "",
  replaceMode: "annotate",
  autoReplaceConfidence: "high"
};

const enabledInput = document.getElementById("enabled");
const strictModeInput = document.getElementById("strictMode");
const verifyCryptographicInput = document.getElementById("verifyCryptographic");
const allowlistInput = document.getElementById("allowlist");
const replaceModeInput = document.getElementById("replaceMode");
const autoReplaceConfidenceInput = document.getElementById("autoReplaceConfidence");
const saveButton = document.getElementById("saveButton");
const statusEl = document.getElementById("status");

function updateReplaceControls() {
  const isReplaceMode = replaceModeInput.value === "replace";
  autoReplaceConfidenceInput.disabled = !isReplaceMode;
  strictModeInput.disabled = !isReplaceMode;
}

function restoreOptions() {
  chrome.storage.sync.get(DEFAULT_OPTIONS, (options) => {
    enabledInput.checked = !!options.enabled;
    strictModeInput.checked = !!options.strictMode;
    verifyCryptographicInput.checked = options.verifyCryptographic !== false;
    allowlistInput.value = options.allowlist || "";
    replaceModeInput.value = options.replaceMode || "annotate";
    autoReplaceConfidenceInput.value = options.autoReplaceConfidence || "high";
    updateReplaceControls();
  });
}

function saveOptions() {
  const payload = {
    enabled: enabledInput.checked,
    strictMode: strictModeInput.checked,
    verifyCryptographic: verifyCryptographicInput.checked,
    allowlist: allowlistInput.value,
    replaceMode: replaceModeInput.value,
    autoReplaceConfidence: autoReplaceConfidenceInput.value
  };

  chrome.storage.sync.set(payload, () => {
    statusEl.textContent = "Options saved.";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 1200);
  });
}

document.addEventListener("DOMContentLoaded", restoreOptions);
replaceModeInput.addEventListener("change", updateReplaceControls);
saveButton.addEventListener("click", saveOptions);
