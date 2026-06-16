



importScripts("config.js");

const domainCache = new Map();
let safeSearchEnabled = false;
let extensionConfigLoadedAt = 0;
let extensionConfigLoadPromise = null;
let cachedExtensionConfig = null;

const EXTENSION_CONFIG_CACHE_MS = 5 * 60 * 1000;
const WHITELIST_CACHE_KEY = 'fg_whitelist_cache';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 giá»

function normalizeDomainForCache(domain) {
  if (!domain) return '';
  return domain.replace(/^www\./, '').trim().toLowerCase();
}

async function saveWhitelistCache(domains) {
  try {
    await chrome.storage.local.set({
      [WHITELIST_CACHE_KEY]: {
        domains,
        savedAt: Date.now()
      }
    });
  } catch (e) {
    console.warn('[FG] KhÃ´ng lÆ°u Ä‘Æ°á»£c whitelist cache:', e);
  }
}

async function getWhitelistCache() {
  try {
    const result = await chrome.storage.local.get(WHITELIST_CACHE_KEY);
    const cache = result[WHITELIST_CACHE_KEY];
    if (!cache || !Array.isArray(cache.domains)) return null;
    if (Date.now() - cache.savedAt > CACHE_MAX_AGE_MS) return null;
    return cache.domains;
  } catch {
    return null;
  }
}

function isDomainInCache(domain, cachedDomains) {
  if (!cachedDomains || !domain) return false;
  const clean = normalizeDomainForCache(domain);
  return cachedDomains.some((cachedDomain) => {
    const cached = normalizeDomainForCache(cachedDomain);
    return clean === cached || clean.endsWith(`.${cached}`);
  });
}

const SAFESEARCH_RULES = {
  'google.com': { param: 'safe', value: 'active' },
  'www.google.com': { param: 'safe', value: 'active' },
  'bing.com': { param: 'adlt', value: 'strict' },
  'www.bing.com': { param: 'adlt', value: 'strict' },
  'duckduckgo.com': { param: 'kp', value: '1' },
};

async function loadExtensionConfig(force = false) {
  const isFresh = cachedExtensionConfig && (Date.now() - extensionConfigLoadedAt) < EXTENSION_CONFIG_CACHE_MS;
  if (isFresh && !force) {
    return cachedExtensionConfig;
  }

  if (extensionConfigLoadPromise && !force) {
    return extensionConfigLoadPromise;
  }

  extensionConfigLoadPromise = (async () => {
    const token = await getGoogleToken();
    if (!token) return null;

    try {
      const response = await fetch(`${CONFIG.API_BASE}/config`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) return null;

      const configData = await response.json();
      safeSearchEnabled = configData.filterEnabled === true;
      cachedExtensionConfig = configData;
      extensionConfigLoadedAt = Date.now();

      if (configData.allowedDomains && Array.isArray(configData.allowedDomains)) {
        await saveWhitelistCache(configData.allowedDomains);
      }

      return configData;
    } catch (e) {
      console.warn('[FG] Failed to load extension config:', e);
      return null;
    } finally {
      extensionConfigLoadPromise = null;
    }
  })();

  return extensionConfigLoadPromise;
}

function applySafeSearch(url) {
  if (!safeSearchEnabled) return null;

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, '');
    const fullHostname = parsed.hostname;
    const rule = SAFESEARCH_RULES[fullHostname] || SAFESEARCH_RULES[hostname];
    if (!rule) return null;

    if (!parsed.searchParams.has('q') && !parsed.searchParams.has('query')) return null;
    if (parsed.searchParams.get(rule.param) === rule.value) return null;

    parsed.searchParams.set(rule.param, rule.value);
    return parsed.toString();
  } catch {
    return null;
  }
}

function isCacheValid(entry) {
  return entry && (Date.now() - entry.time) < CONFIG.CACHE_TTL_MS;
}

// â”€â”€â”€ Google Token â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function getGoogleToken() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError) { resolve(null); return; }
      resolve(token);
    });
  });
}

// â”€â”€â”€ In-page Banner â€” FIRE AND FORGET, khÃ´ng await â”€â”€â”€â”€â”€â”€â”€â”€
// KhÃ´ng bao giá» await hÃ m nÃ y trÆ°á»›c khi block
function showBannerAsync(tabId, domain, message, remainingSeconds) {
  if (!tabId) return;

  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  const timeText = remainingSeconds <= 0
    ? "háº¿t giá»"
    : mins > 0
      ? (secs > 0 ? `${mins} phÃºt ${secs} giÃ¢y` : `${mins} phÃºt`)
      : `${remainingSeconds} giÃ¢y`;

  // KhÃ´ng await â€” cháº¡y ná»n, khÃ´ng block luá»“ng chÃ­nh
  chrome.scripting.executeScript({
    target: { tabId },
    func: (domain, message, timeText) => {
      const old = document.getElementById('__fg_banner__');
      if (old) old.remove();

      if (!document.getElementById('__fg_style__')) {
        const s = document.createElement('style');
        s.id = '__fg_style__';
        s.textContent = `
          @keyframes __fg_in__ {
            from { opacity:0; transform:translateX(110%) scale(0.95); }
            to   { opacity:1; transform:translateX(0)   scale(1);    }
          }
        `;
        document.head.appendChild(s);
      }

      const el = document.createElement('div');
      el.id = '__fg_banner__';
      el.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:12px;">
          <span style="font-size:26px;line-height:1;flex-shrink:0">â°</span>
          <div style="flex:1">
            <div style="font-size:14px;font-weight:800;color:#111;margin-bottom:3px">
              Sáº¯p háº¿t giá» â€” ${domain}
            </div>
            <div style="font-size:12px;color:#555;line-height:1.5;margin-bottom:7px">
              ${message}
            </div>
            <span style="background:#fff3cd;border:1px solid #ffc107;border-radius:7px;
                         padding:3px 9px;font-size:11px;font-weight:700;color:#856404">
              âŒ› CÃ²n láº¡i: ${timeText}
            </span>
          </div>
          <button onclick="this.closest('#__fg_banner__').remove()"
            style="background:none;border:none;cursor:pointer;font-size:17px;
                   color:#aaa;padding:0;line-height:1;flex-shrink:0">âœ•</button>
        </div>
      `;
      Object.assign(el.style, {
        position:'fixed', top:'20px', right:'20px', zIndex:'2147483647',
        background:'#fff', border:'2px solid #f59e0b', borderRadius:'16px',
        padding:'16px 18px', width:'340px',
        boxShadow:'0 8px 30px rgba(0,0,0,0.15),0 2px 8px rgba(245,158,11,0.2)',
        fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        animation:'__fg_in__ 0.3s cubic-bezier(0.34,1.56,0.64,1)',
      });
      document.body.appendChild(el);
      setTimeout(() => {
        if (!el.parentNode) return;
        Object.assign(el.style, { transition:'opacity 0.4s,transform 0.4s',
          opacity:'0', transform:'translateX(110%)' });
        setTimeout(() => el.remove(), 400);
      }, 8000);
    },
    args: [domain, message, timeText]
  }).catch(() => {
    // Fallback náº¿u khÃ´ng inject Ä‘Æ°á»£c (PDF, chrome://, etc.)
    chrome.notifications.create(`warn_${Date.now()}`, {
      type:'basic', iconUrl:'icons/icon48.png',
      title:`â° Sáº¯p háº¿t giá» â€” ${domain}`,
      message:`${message} (CÃ²n láº¡i: ${timeText})`,
      priority:2
    });
  });
}

// â”€â”€â”€ Time Info Overlay â€” gÃ³c dÆ°á»›i pháº£i, bÃ¡n trong suá»‘t â”€â”€â”€
function showTimeInfoOverlay(tabId, timeInfo) {
  if (!tabId || !timeInfo || !timeInfo.mode) return;

  let text = '';
  if (timeInfo.mode === 'timeWindow' && timeInfo.timeWindowDisplay) {
    const mins = timeInfo.minutesUntilWindowEnd;
    text = `â° Khung giá»: ${timeInfo.timeWindowDisplay}`;
    if (mins != null && mins > 0) text += ` Â· CÃ²n ${mins} phÃºt`;
  } else if (timeInfo.mode === 'minuteLimit' && timeInfo.minutesRemainingToday != null) {
    text = `â± CÃ²n ${timeInfo.minutesRemainingToday} phÃºt hÃ´m nay`;
  }

  if (!text) return;

  chrome.scripting.executeScript({
    target: { tabId },
    func: (overlayText) => {
      let el = document.getElementById('__fg_time_overlay__');
      if (!el) {
        el = document.createElement('div');
        el.id = '__fg_time_overlay__';
        Object.assign(el.style, {
          position: 'fixed', bottom: '16px', right: '16px',
          zIndex: '2147483646',  // 1 dÆ°á»›i banner warning
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(8px)',
          color: '#fff',
          fontSize: '12px', fontWeight: '600',
          padding: '6px 12px', borderRadius: '20px',
          fontFamily: '-apple-system, sans-serif',
          cursor: 'pointer',
          transition: 'opacity 0.3s',
          userSelect: 'none',
          lineHeight: '1.4',
        });
        el.onclick = () => el.remove();
        document.body.appendChild(el);
      }
      el.textContent = overlayText;
    },
    args: [text]
  }).catch(() => {}); // Bá» qua náº¿u khÃ´ng inject Ä‘Æ°á»£c (PDF, chrome://, etc.)
}

// â”€â”€â”€ Check domain â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function checkDomain(domain) {
  const cached = domainCache.get(domain);
  if (isCacheValid(cached)) return cached;

  const token = await getGoogleToken();
  if (!token) return { allowed: true, reason: "Chưa đăng nhập" };

  await loadExtensionConfig().catch(() => {});

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `${CONFIG.API_BASE}/check?domain=${encodeURIComponent(domain)}`,
      { headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json" }, signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (!res.ok) return { allowed: true, reason: "Lỗi server" };

    const data = await res.json();
    const entry = { allowed:data.allowed, reason:data.reason||"", websiteId:data.allowedWebsiteId||null, time:Date.now() };

    if (entry.allowed) {
      domainCache.set(domain, entry);
    } else {
      domainCache.delete(domain);
    }

    console.log(`[CHECK] ${domain} → ${entry.allowed ? 'allowed' : 'blocked'}`);
    return entry;
  } catch (err) {
    const isNetworkError = err instanceof TypeError
      || err?.name === 'AbortError'
      || err?.name === 'TimeoutError'
      || err?.message?.includes('fetch');

    if (isNetworkError) {
      console.warn('[FG] API không kết nối được, dùng offline cache:', err?.message);
      const cachedDomains = await getWhitelistCache();

      if (cachedDomains) {
        const allowed = isDomainInCache(domain, cachedDomains);
        console.log(`[FG] Offline check: ${domain} → ${allowed ? 'allowed' : 'blocked'}`);
        return { allowed, reason: allowed ? 'offline_cache' : 'offline_block', websiteId: null };
      }

      console.warn('[FG] Không có cache, block offline');
      return { allowed: false, reason: 'offline_block', websiteId: null };
    }

    throw err;
  }
}

let activeTab = null;

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    await loadExtensionConfig().catch(() => {});
    const safeUrl = applySafeSearch(changeInfo.url);
    if (safeUrl) {
      await chrome.tabs.update(tabId, { url: safeUrl });
      return;
    }
  }

  if (changeInfo.status !== "loading" || !tab.url) return;
  if (tab.url.startsWith("chrome") || tab.url.startsWith("about")) return;

  try {
    const url = new URL(tab.url);
    const domain = url.hostname.replace(/^www\./, "");
    if (domain === "localhost" || domain === "127.0.0.1" ||
        /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(domain)) return;

    const result = await checkDomain(domain);
    if (!result.allowed) {
      chrome.tabs.update(tabId, {
        url: chrome.runtime.getURL("blocked.html")
          + `?domain=${encodeURIComponent(domain)}&reason=${encodeURIComponent(result.reason)}&url=${encodeURIComponent(tab.url)}`
      });
    } else if (result.websiteId) {
      activeTab = { tabId, domain, websiteId: result.websiteId };
    }
  } catch (e) { console.error("Tab update error:", e); }
});

chrome.tabs.onActivated.addListener(async (info) => {
  try {
    const tab = await chrome.tabs.get(info.tabId);
    if (!tab.url) { activeTab = null; return; }
    const domain = new URL(tab.url).hostname.replace(/^www\./, "");
    const cached = domainCache.get(domain);
    activeTab = (cached?.allowed && cached?.websiteId)
      ? { tabId: info.tabId, domain, websiteId: cached.websiteId }
      : null;
  } catch { activeTab = null; }
});

// â”€â”€â”€ Alarms â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
chrome.alarms.create("heartbeat", {
  periodInMinutes: (CONFIG.HEARTBEAT_INTERVAL_MS || 30000) / 60000
}); // default 30s
chrome.alarms.create("ping",      { periodInMinutes: 1/6  }); // 10s
chrome.alarms.create("screenshot_poll", { periodInMinutes: 1/12 }); // ~5 sec

chrome.alarms.onAlarm.addListener(async (alarm) => {

  // â”€â”€ Heartbeat (30s) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (alarm.name === "heartbeat") {
    if (!activeTab) return;
    const token = await getGoogleToken();
    if (!token) return;

    try {
      const res = await fetch(`${CONFIG.API_BASE}/heartbeat`, {
        method: "POST",
        headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
        body: JSON.stringify({ domain: activeTab.domain, allowedWebsiteId: activeTab.websiteId })
      });
      if (!res.ok) { console.error(`Heartbeat ${res.status}`); return; }

      const data = await res.json();
      console.log(`[HEARTBEAT] ${activeTab.domain} exceeded=${data.limitExceeded}`);

      // â”€â”€ 1. BLOCK NGAY â€” Æ°u tiÃªn cao nháº¥t, khÃ´ng delay â”€â”€â”€â”€
      if (data.limitExceeded) {
        const tabId  = activeTab.tabId;
        const domain = activeTab.domain;
        const currentTab = await chrome.tabs.get(tabId).catch(() => null);
        const blockedUrl = currentTab?.url || `https://${domain}`;
        activeTab = null;
        domainCache.delete(domain);
        chrome.tabs.update(tabId, {
          url: chrome.runtime.getURL("blocked.html")
            + `?domain=${encodeURIComponent(domain)}`
            + `&reason=${encodeURIComponent("time_limit_exceeded")}`
            + `&url=${encodeURIComponent(blockedUrl)}`
        });
        console.log(`[BLOCK] ${domain}`);
        return; // dá»«ng luÃ´n, khÃ´ng lÃ m gÃ¬ thÃªm
      }

      // â”€â”€ 2. Warning banner (chá»‰ cháº¡y khi CHÆ¯A block) â”€â”€â”€â”€â”€â”€
      if (data.timeInfo) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const overlayTabId = tabs[0]?.id ?? activeTab?.tabId ?? null;
        showTimeInfoOverlay(overlayTabId, data.timeInfo);
      }

      if (data.warning) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = tabs[0]?.id ?? activeTab?.tabId ?? null;
        // fire-and-forget â€” khÃ´ng await
        showBannerAsync(tabId, activeTab.domain,
          data.warning.message, data.warning.remainingSeconds);
      }

    } catch (e) { console.error("Heartbeat error:", e); }
  }

  // â”€â”€ Ping (10s) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (alarm.name === "screenshot_poll") {
    const token = await getGoogleToken();
    if (!token) return;
    try {
      const res = await fetch(`${CONFIG.API_BASE}/pending-screenshots`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const list = await res.json();
      for (const item of list) {
        captureScreenshotForDomain(item.screenshotId, item.domain)
          .catch(err => {
            reportScreenshotResult(item.screenshotId, "failed", String(err)).catch(() => {});
          });
      }
    } catch (e) {
      console.error("[FamilyGuardian] screenshot_poll error:", e);
    }
    return;
  }

  if (alarm.name === "ping") {
    const token = await getGoogleToken();
    if (!token) return;
    fetch(`${CONFIG.API_BASE}/ping`, {
      method: "POST", headers: { Authorization:`Bearer ${token}` }
    }).catch(() => {});
  }
});

// â”€â”€â”€ Messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CLEAR_CACHE") {
    domainCache.clear();
    cachedExtensionConfig = null;
    safeSearchEnabled = false;
    extensionConfigLoadedAt = 0;
    chrome.storage.local.remove(WHITELIST_CACHE_KEY).catch(() => {});
    sendResponse({ success: true });
    return true;
  }

  // Feature 2: Handle Access Request from blocked page
  if (message.type === "REQUEST_ACCESS") {
    getGoogleToken().then(token => {
      if (!token) {
        sendResponse({ success: false, error: "ChÆ°a Ä‘Äƒng nháº­p Google" });
        return;
      }
      
      fetch(`${CONFIG.API_BASE}/request-access`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          domain: message.domain,
          fullUrl: message.fullUrl,
          reason: normalizeAccessReason(message.reason),
          requestedDurationMinutes: message.requestedDurationMinutes ?? null,
          requestedStartTime: message.requestedStartTime ?? null,
          requestedEndTime: message.requestedEndTime ?? null
        })
      })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.message || "Lá»—i server");
        sendResponse({ success: true });
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });
    });
    
    return true; // Báº¯t buá»™c return true khi dÃ¹ng sendResponse báº¥t Ä‘á»“ng bá»™
  }
});

// â”€â”€ THÃŠM Má»šI: Screenshot â”€â”€
// VÃ¬ background.js hiá»‡n táº¡i chÆ°a khá»Ÿi táº¡o SignalR connection, chÃºng ta thÃªm biáº¿n mock Ä‘á»ƒ trÃ¡nh crash.
function normalizeAccessReason(reason) {
  if (!reason) return "not_in_whitelist";
  const r = reason.toLowerCase().trim();
  if (r === "time_limit_exceeded"
    || r.includes("time_limit")
    || r.includes("timelimit")
    || r.includes("exceeded")) {
    return "time_limit_exceeded";
  }
  if (r === "internet_paused"
    || r.includes("internet_paused")
    || r.includes("internetpaused")
    || r.includes("paused")) {
    return "internet_paused";
  }
  if (r === "outside_time_window"
    || r.includes("outside_time")
    || r.includes("time_window")
    || r.includes("timewindow")
    || r.includes("outside_window")) {
    return "outside_time_window";
  }
  return "not_in_whitelist";
}

async function captureScreenshotForDomain(screenshotId, domain) {
  const allTabs = await chrome.tabs.query({});

  const matchingTabs = allTabs.filter(tab => {
    if (!tab.url) return false;
    try {
      const hostname = new URL(tab.url).hostname.replace(/^www\./, '');
      const target = domain.replace(/^www\./, '');
      return hostname === target || hostname.endsWith('.' + target);
    } catch {
      return false;
    }
  });

  if (matchingTabs.length === 0) {
    console.log("[FamilyGuardian] No tab found for:", domain);
    await reportScreenshotResult(
      screenshotId,
      "tab_not_found",
      "No tab is currently open for " + domain
    );
    return;
  }

  let targetTab = matchingTabs.find(t => t.active) || matchingTabs[0];

  if (!targetTab.active) {
    await chrome.tabs.update(targetTab.id, { active: true });
    await new Promise(r => setTimeout(r, 600));
    targetTab = await chrome.tabs.get(targetTab.id);
  }

  const dataUrl = await chrome.tabs.captureVisibleTab(targetTab.windowId, {
    format: "jpeg",
    quality: 60
  });

  const fetchRes = await fetch(dataUrl);
  const blob = await fetchRes.blob();
  await uploadScreenshot(screenshotId, blob);
}

async function uploadScreenshot(screenshotId, blob) {
  const token = await getGoogleToken();
  await loadExtensionConfig().catch(() => {});
  if (!token) throw new Error("No auth token");

  const formData = new FormData();
  formData.append("image", blob, "screenshot.jpg");

  const res = await fetch(
    `${CONFIG.API_BASE}/upload-screenshot?screenshotId=${screenshotId}`,
    {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: formData
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed ${res.status}: ${text}`);
  }

  console.log("[FamilyGuardian] Screenshot uploaded:", screenshotId);
}

async function reportScreenshotResult(screenshotId, status, errorMessage) {
  try {
    const token = await getGoogleToken();
    if (!token) return;

    await fetch(`${CONFIG.API_BASE}/screenshot-result`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ screenshotId, status, errorMessage })
    });
  } catch (e) {
    console.error("[FamilyGuardian] reportScreenshotResult error:", e);
  }
}

console.log("Family Guardian Extension initialized");

