



importScripts("config.js");

const domainCache = new Map();

function isCacheValid(entry) {
  return entry && (Date.now() - entry.time) < CONFIG.CACHE_TTL_MS;
}

// ─── Google Token ──────────────────────────────────────────
async function getGoogleToken() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError) { resolve(null); return; }
      resolve(token);
    });
  });
}

// ─── In-page Banner — FIRE AND FORGET, không await ────────
// Không bao giờ await hàm này trước khi block
function showBannerAsync(tabId, domain, message, remainingSeconds) {
  if (!tabId) return;

  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  const timeText = remainingSeconds <= 0
    ? "hết giờ"
    : mins > 0
      ? (secs > 0 ? `${mins} phút ${secs} giây` : `${mins} phút`)
      : `${remainingSeconds} giây`;

  // Không await — chạy nền, không block luồng chính
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
          <span style="font-size:26px;line-height:1;flex-shrink:0">⏰</span>
          <div style="flex:1">
            <div style="font-size:14px;font-weight:800;color:#111;margin-bottom:3px">
              Sắp hết giờ — ${domain}
            </div>
            <div style="font-size:12px;color:#555;line-height:1.5;margin-bottom:7px">
              ${message}
            </div>
            <span style="background:#fff3cd;border:1px solid #ffc107;border-radius:7px;
                         padding:3px 9px;font-size:11px;font-weight:700;color:#856404">
              ⌛ Còn lại: ${timeText}
            </span>
          </div>
          <button onclick="this.closest('#__fg_banner__').remove()"
            style="background:none;border:none;cursor:pointer;font-size:17px;
                   color:#aaa;padding:0;line-height:1;flex-shrink:0">✕</button>
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
    // Fallback nếu không inject được (PDF, chrome://, etc.)
    chrome.notifications.create(`warn_${Date.now()}`, {
      type:'basic', iconUrl:'icons/icon48.png',
      title:`⏰ Sắp hết giờ — ${domain}`,
      message:`${message} (Còn lại: ${timeText})`,
      priority:2
    });
  });
}

// ─── Time Info Overlay — góc dưới phải, bán trong suốt ───
function showTimeInfoOverlay(tabId, timeInfo) {
  if (!tabId || !timeInfo || !timeInfo.mode) return;

  let text = '';
  if (timeInfo.mode === 'timeWindow' && timeInfo.timeWindowDisplay) {
    const mins = timeInfo.minutesUntilWindowEnd;
    text = `⏰ Khung giờ: ${timeInfo.timeWindowDisplay}`;
    if (mins != null && mins > 0) text += ` · Còn ${mins} phút`;
  } else if (timeInfo.mode === 'minuteLimit' && timeInfo.minutesRemainingToday != null) {
    text = `⏱ Còn ${timeInfo.minutesRemainingToday} phút hôm nay`;
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
          zIndex: '2147483646',  // 1 dưới banner warning
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
  }).catch(() => {}); // Bỏ qua nếu không inject được (PDF, chrome://, etc.)
}

// ─── Check domain ──────────────────────────────────────────
async function checkDomain(domain) {
  const cached = domainCache.get(domain);
  if (isCacheValid(cached)) return cached;

  const token = await getGoogleToken();
  if (!token) return { allowed: true, reason: "Chưa đăng nhập" };

  try {
    const res = await fetch(
      `${CONFIG.API_BASE}/check?domain=${encodeURIComponent(domain)}`,
      { headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json" } }
    );
    if (!res.ok) return { allowed: true, reason: "Lỗi server" };

    const data = await res.json();
    const entry = { allowed:data.allowed, reason:data.reason||"",
                    websiteId:data.allowedWebsiteId||null, time:Date.now() };
    domainCache.set(domain, entry);
    console.log(`[CHECK] ${domain} → ${entry.allowed ? 'allowed' : 'blocked'}`);
    return entry;
  } catch {
    return { allowed: true, reason: "Lỗi mạng" };
  }
}

// ─── Tab tracking ──────────────────────────────────────────
let activeTab = null;

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
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
          + `?domain=${encodeURIComponent(domain)}&reason=${encodeURIComponent(result.reason)}`
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

// ─── Alarms ────────────────────────────────────────────────
chrome.alarms.create("heartbeat", {
  periodInMinutes: (CONFIG.HEARTBEAT_INTERVAL_MS || 30000) / 60000
}); // default 30s
chrome.alarms.create("ping",      { periodInMinutes: 1/6  }); // 10s

chrome.alarms.onAlarm.addListener(async (alarm) => {

  // ── Heartbeat (30s) ──────────────────────────────────────
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

      // ── 1. BLOCK NGAY — ưu tiên cao nhất, không delay ────
      if (data.limitExceeded) {
        const tabId  = activeTab.tabId;
        const domain = activeTab.domain;
        activeTab = null;
        domainCache.delete(domain);
        chrome.tabs.update(tabId, {
          url: chrome.runtime.getURL("blocked.html")
            + `?domain=${encodeURIComponent(domain)}`
            + `&reason=${encodeURIComponent("Đã hết thời gian sử dụng hôm nay")}`
        });
        console.log(`[BLOCK] ${domain}`);
        return; // dừng luôn, không làm gì thêm
      }

      // ── 2. Warning banner (chỉ chạy khi CHƯA block) ──────
      if (data.timeInfo) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const overlayTabId = tabs[0]?.id ?? activeTab?.tabId ?? null;
        showTimeInfoOverlay(overlayTabId, data.timeInfo);
      }

      if (data.warning) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = tabs[0]?.id ?? activeTab?.tabId ?? null;
        // fire-and-forget — không await
        showBannerAsync(tabId, activeTab.domain,
          data.warning.message, data.warning.remainingSeconds);
      }

    } catch (e) { console.error("Heartbeat error:", e); }
  }

  // ── Ping (10s) ───────────────────────────────────────────
  if (alarm.name === "ping") {
    const token = await getGoogleToken();
    if (!token) return;
    fetch(`${CONFIG.API_BASE}/ping`, {
      method: "POST", headers: { Authorization:`Bearer ${token}` }
    }).catch(() => {});
  }
});

// ─── Messages ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CLEAR_CACHE") {
    domainCache.clear();
    sendResponse({ success: true });
    return true;
  }

  // Feature 2: Handle Access Request from blocked page
  if (message.type === "REQUEST_ACCESS") {
    getGoogleToken().then(token => {
      if (!token) {
        sendResponse({ success: false, error: "Chưa đăng nhập Google" });
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
          fullUrl: message.fullUrl
        })
      })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.message || "Lỗi server");
        sendResponse({ success: true });
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });
    });
    
    return true; // Bắt buộc return true khi dùng sendResponse bất đồng bộ
  }
});

console.log("Family Guardian Extension initialized");
  