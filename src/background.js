chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: "#b00020" });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "SET_BADGE_COUNT") {
    return;
  }

  const tabId = sender?.tab?.id;
  if (typeof tabId !== "number") {
    sendResponse({ ok: false });
    return;
  }

  const count = Number(message.count || 0);
  chrome.action.setBadgeText({
    tabId,
    text: count > 0 ? String(Math.min(count, 999)) : ""
  });

  sendResponse({ ok: true });
});
