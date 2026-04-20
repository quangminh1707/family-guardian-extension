// Import config
// Note: In manifest v3, we need to use dynamic import or inline the config

const domainCache = new Map(); // domain → { allowed, reason, websiteId, time }

// Configuration (duplicated from config.js for service worker)
const CONFIG = {
  API_BASE: "http://localhost:5247/api/extension",
  CACHE_TTL_MS: 5 * 60 * 1000,
  HEARTBEAT_INTERVAL_MS: 30000,
  BLOCK_PAGE_URL: "http://localhost:5247/blocked"
};

// ─── Cache Helpers ─────────────────────────────────────────
function isCacheValid(entry) {
  return entry && (Date.now() - entry.time) < CONFIG.CACHE_TTL_MS;
}

// ─── Google Token ─────────────────────────────────────────
async function getGoogleToken() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError) {
        console.warn("Failed to get auth token:", chrome.runtime.lastError?.message);
        resolve(null);
      } else {
        resolve(token);
      }
    });
  });
}

// ─── Check domain with backend ────────────────────────────
async function checkDomain(domain) {
  // Check cache first
  const cached = domainCache.get(domain);
  if (isCacheValid(cached)) {
    console.log(`[CACHE HIT] Domain: ${domain}, Allowed: ${cached.allowed}`);
    return cached;
  }

  const token = await getGoogleToken();
  if (!token) {
    console.warn("No auth token available");
    return { allowed: true, reason: "Chưa đăng nhập" };
  }

  try {
    const response = await fetch(`${CONFIG.API_BASE}/check?domain=${encodeURIComponent(domain)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      console.error(`Backend error: ${response.status}`);
      return { allowed: true, reason: "Lỗi server" };
    }

    const data = await response.json();
    const entry = {
      allowed: data.allowed,
      reason: data.reason || "",
      websiteId: data.allowed_website_id || null,
      time: Date.now()
    };

    domainCache.set(domain, entry);
    console.log(`[API CALL] Domain: ${domain}, Allowed: ${entry.allowed}`);
    return entry;
  } catch (error) {
    console.error(`Network error checking domain ${domain}:`, error);
    return { allowed: true, reason: "Lỗi mạng" };
  }
}

// ─── Handle Tab Updates (Manifest V3 compatible) ─────────
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "loading" || !tab.url) return;

  // ─── THÊM DÒNG NÀY ───────────────────────────────────────
  if (tab.url.startsWith("chrome") || tab.url.startsWith("about")) return;
  // ─────────────────────────────────────────────────────────

  try {
    const url = new URL(tab.url);
    const domain = url.hostname.replace(/^www\./, "");

    if (
      domain === "localhost" ||
      domain === "127.0.0.1" ||
      /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(domain)
    ) {
      return;
    }

    // Check access
    const result = await checkDomain(domain);

    if (!result.allowed) {
      const blockedUrl =
        chrome.runtime.getURL("blocked.html") +
        `?domain=${encodeURIComponent(domain)}&reason=${encodeURIComponent(
          result.reason
        )}`;

      console.log(`[BLOCKED] ${domain} - Redirecting to blocked page`);
      chrome.tabs.update(tabId, { url: blockedUrl });
    } else {
      console.log(`[ALLOWED] ${domain}`);
    }
  } catch (error) {
    console.error("Error handling tab update:", error);
  }
});

// ─── Track Active Tab for Heartbeat ────────────────────────
let activeTab = null;

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (!tab.url) {
      activeTab = null;
      return;
    }

    const url = new URL(tab.url);
    const domain = url.hostname.replace(/^www\./, "");

    const cached = domainCache.get(domain);
    if (cached?.allowed && cached?.websiteId) {
      activeTab = {
        tabId: activeInfo.tabId,
        domain: domain,
        websiteId: cached.websiteId,
        startTime: Date.now()
      };
      console.log(`[ACTIVE TAB] ${domain}`);
    } else {
      activeTab = null;
    }
  } catch (error) {
    console.error("Error handling tab activation:", error);
    activeTab = null;
  }
});

// ─── Send Heartbeat ───────────────────────────────────────
chrome.alarms.create("heartbeat", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "heartbeat" || !activeTab) {
    return;
  }

  const token = await getGoogleToken();
  if (!token) {
    console.warn("No token for heartbeat");
    return;
  }

  try {
    const response = await fetch(`${CONFIG.API_BASE}/heartbeat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        domain: activeTab.domain,
        allowed_website_id: activeTab.websiteId
      })
    });

    if (!response.ok) {
      console.error(`Heartbeat failed: ${response.status}`);
    } else {
      console.log(`[HEARTBEAT] ${activeTab.domain} (+30s)`);
    }
  } catch (error) {
    console.error("Heartbeat error:", error);
  }
});

// ─── Clear Cache on Message ────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CLEAR_CACHE") {
    domainCache.clear();
    console.log("[CACHE CLEARED]");
    sendResponse({ success: true });
  }
});

console.log("Family Guardian Extension service worker initialized");
