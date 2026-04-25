// const domainCache = new Map(); // domain → { allowed, reason, websiteId, time }

// const CONFIG = {
//   API_BASE: "http://localhost:5247/api/extension",
//   CACHE_TTL_MS: 1 * 60 * 1000,
// };

// // ─── Cache Helpers ─────────────────────────────────────────
// function isCacheValid(entry) {
//   return entry && (Date.now() - entry.time) < CONFIG.CACHE_TTL_MS;
// }

// // ─── Google Token ─────────────────────────────────────────
// async function getGoogleToken() {
//   return new Promise((resolve) => {
//     chrome.identity.getAuthToken({ interactive: false }, (token) => {
//       if (chrome.runtime.lastError) {
//         console.warn("Failed to get auth token:", chrome.runtime.lastError?.message);
//         resolve(null);
//       } else {
//         resolve(token);
//       }
//     });
//   });
// }

// // ─── Show Chrome Notification ─────────────────────────────
// function showWarningNotification(domain, message, remainingSeconds) {
//   const mins = Math.floor(remainingSeconds / 60);
//   const secs = remainingSeconds % 60;
//   const timeText = remainingSeconds <= 0
//     ? "hết giờ"
//     : mins > 0
//       ? (secs > 0 ? `${mins} phút ${secs} giây` : `${mins} phút`)
//       : `${remainingSeconds} giây`;

//   chrome.notifications.create(`warning_${domain}_${Date.now()}`, {
//     type: "basic",
//     iconUrl: "icons/icon48.png",
//     title: `⏰ Sắp hết giờ — ${domain}`,
//     message: remainingSeconds > 0
//       ? `${message}\n(Còn lại: ${timeText})`
//       : message,
//     priority: 2,
//     requireInteraction: false
//   });

//   console.log(`[WARNING] ${domain} - "${message}" - còn ${timeText}`);
// }

// // ─── Đặt alarm chính xác dựa vào schedule từ backend ─────
// // Thay vì phụ thuộc heartbeat 30s (quá thô), backend tính
// // chính xác còn bao nhiêu giây đến mốc cảnh báo / bị chặn.
// function scheduleWarningAlarms(domain, schedule) {
//   if (!schedule) return;

//   // Mốc 1
//   if (schedule.secondsUntilWarning1 != null && schedule.secondsUntilWarning1 > 0) {
//     const alarmName = `precise_warning1_${domain}`;
//     const delayMins = schedule.secondsUntilWarning1 / 60;
//     chrome.alarms.create(alarmName, { delayInMinutes: delayMins });
//     chrome.storage.session.set({
//       [alarmName]: { domain, message: schedule.warningMessage1 }
//     });
//     console.log(`[SCHEDULE] Warning1 cho ${domain} sau ${schedule.secondsUntilWarning1}s`);
//   }

//   // Mốc 2
//   if (schedule.secondsUntilWarning2 != null && schedule.secondsUntilWarning2 > 0) {
//     const alarmName = `precise_warning2_${domain}`;
//     const delayMins = schedule.secondsUntilWarning2 / 60;
//     chrome.alarms.create(alarmName, { delayInMinutes: delayMins });
//     chrome.storage.session.set({
//       [alarmName]: { domain, message: schedule.warningMessage2 }
//     });
//     console.log(`[SCHEDULE] Warning2 cho ${domain} sau ${schedule.secondsUntilWarning2}s`);
//   }

//   // Block chính xác
//   if (schedule.secondsUntilBlock != null && schedule.secondsUntilBlock > 0) {
//     const alarmName = `precise_block_${domain}`;
//     const delayMins = schedule.secondsUntilBlock / 60;
//     chrome.alarms.create(alarmName, { delayInMinutes: delayMins });
//     chrome.storage.session.set({ [alarmName]: { domain } });
//     console.log(`[SCHEDULE] Block cho ${domain} sau ${schedule.secondsUntilBlock}s`);
//   }
// }

// // Xoá alarm cũ khi tab bị chặn hoặc domain thay đổi
// function clearDomainAlarms(domain) {
//   chrome.alarms.clear(`precise_warning1_${domain}`);
//   chrome.alarms.clear(`precise_warning2_${domain}`);
//   chrome.alarms.clear(`precise_block_${domain}`);
//   chrome.storage.session.remove([
//     `precise_warning1_${domain}`,
//     `precise_warning2_${domain}`,
//     `precise_block_${domain}`
//   ]);
// }

// // ─── Check domain with backend ────────────────────────────
// async function checkDomain(domain) {
//   const cached = domainCache.get(domain);
//   if (isCacheValid(cached)) {
//     console.log(`[CACHE HIT] Domain: ${domain}, Allowed: ${cached.allowed}`);
//     return cached;
//   }

//   const token = await getGoogleToken();
//   if (!token) return { allowed: true, reason: "Chưa đăng nhập" };

//   try {
//     const response = await fetch(
//       `${CONFIG.API_BASE}/check?domain=${encodeURIComponent(domain)}`,
//       { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
//     );

//     if (!response.ok) return { allowed: true, reason: "Lỗi server" };

//     const data = await response.json();
//     const entry = {
//       allowed: data.allowed,
//       reason: data.reason || "",
//       websiteId: data.allowedWebsiteId || null,
//       time: Date.now()
//     };

//     domainCache.set(domain, entry);
//     console.log(`[API CALL] Domain: ${domain}, Allowed: ${entry.allowed}`);
//     return entry;
//   } catch (error) {
//     console.error(`Network error checking domain ${domain}:`, error);
//     return { allowed: true, reason: "Lỗi mạng" };
//   }
// }

// // ─── Block tab helper ──────────────────────────────────────
// function blockTab(tabId, domain, reason) {
//   clearDomainAlarms(domain);
//   domainCache.delete(domain);
//   const blockedUrl = chrome.runtime.getURL("blocked.html")
//     + `?domain=${encodeURIComponent(domain)}`
//     + `&reason=${encodeURIComponent(reason)}`;
//   chrome.tabs.update(tabId, { url: blockedUrl });
// }

// // ─── Handle Tab Updates ────────────────────────────────────
// chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
//   if (changeInfo.status !== "loading" || !tab.url) return;
//   if (tab.url.startsWith("chrome") || tab.url.startsWith("about")) return;

//   try {
//     const url = new URL(tab.url);
//     const domain = url.hostname.replace(/^www\./, "");

//     if (
//       domain === "localhost" || domain === "127.0.0.1" ||
//       /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(domain)
//     ) return;

//     const result = await checkDomain(domain);

//     if (!result.allowed) {
//       const blockedUrl = chrome.runtime.getURL("blocked.html")
//         + `?domain=${encodeURIComponent(domain)}&reason=${encodeURIComponent(result.reason)}`;
//       console.log(`[BLOCKED] ${domain}`);
//       chrome.tabs.update(tabId, { url: blockedUrl });
//     } else {
//       console.log(`[ALLOWED] ${domain}`);
//       if (result.websiteId) {
//         activeTab = { tabId, domain, websiteId: result.websiteId, startTime: Date.now() };
//       }
//     }
//   } catch (error) {
//     console.error("Error handling tab update:", error);
//   }
// });

// // ─── Track Active Tab ──────────────────────────────────────
// let activeTab = null;

// chrome.tabs.onActivated.addListener(async (activeInfo) => {
//   try {
//     const tab = await chrome.tabs.get(activeInfo.tabId);
//     if (!tab.url) { activeTab = null; return; }

//     const url = new URL(tab.url);
//     const domain = url.hostname.replace(/^www\./, "");
//     const cached = domainCache.get(domain);

//     if (cached?.allowed && cached?.websiteId) {
//       activeTab = { tabId: activeInfo.tabId, domain, websiteId: cached.websiteId, startTime: Date.now() };
//       console.log(`[ACTIVE TAB] ${domain}`);
//     } else {
//       activeTab = null;
//     }
//   } catch (error) {
//     activeTab = null;
//   }
// });

// // ─── Alarms ───────────────────────────────────────────────
// chrome.alarms.create("heartbeat", { periodInMinutes: 0.5 }); // 30s
// chrome.alarms.create("ping",      { periodInMinutes: 1 / 6 }); // 10s

// chrome.alarms.onAlarm.addListener(async (alarm) => {

//   // ── Precise warning alarm (mốc 1 hoặc 2) ─────────────────
//   if (alarm.name.startsWith("precise_warning")) {
//     const stored = await chrome.storage.session.get(alarm.name);
//     const info = stored[alarm.name];
//     if (!info) return;

//     // Tính remaining từ precise_block alarm
//     const blockAlarmName = `precise_block_${info.domain}`;
//     const blockAlarm = await chrome.alarms.get(blockAlarmName);
//     const remainingSeconds = blockAlarm
//       ? Math.max(0, Math.round((blockAlarm.scheduledTime - Date.now()) / 1000))
//       : 0;

//     showWarningNotification(info.domain, info.message, remainingSeconds);
//     chrome.storage.session.remove(alarm.name);
//     return;
//   }

//   // ── Precise block alarm ───────────────────────────────────
//   if (alarm.name.startsWith("precise_block_")) {
//     const domain = alarm.name.replace("precise_block_", "");
//     const stored = await chrome.storage.session.get(alarm.name);
//     if (!stored[alarm.name]) return;

//     console.log(`[PRECISE BLOCK] ${domain}`);
//     domainCache.delete(domain);
//     chrome.storage.session.remove(alarm.name);

//     // Tìm tab đang mở domain này để chặn
//     const tabs = await chrome.tabs.query({});
//     for (const tab of tabs) {
//       if (!tab.url) continue;
//       try {
//         const url = new URL(tab.url);
//         const tabDomain = url.hostname.replace(/^www\./, "");
//         if (tabDomain === domain) {
//           blockTab(tab.id, domain, "Đã hết thời gian sử dụng hôm nay");
//           if (activeTab?.domain === domain) activeTab = null;
//           break;
//         }
//       } catch (_) {}
//     }
//     return;
//   }

//   // ── Heartbeat (30s): tracking + nhận schedule mới từ backend ─
//   if (alarm.name === "heartbeat") {
//     if (!activeTab) return;

//     const token = await getGoogleToken();
//     if (!token) return;

//     try {
//       const response = await fetch(`${CONFIG.API_BASE}/heartbeat`, {
//         method: "POST",
//         headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
//         body: JSON.stringify({ domain: activeTab.domain, allowedWebsiteId: activeTab.websiteId })
//       });

//       if (!response.ok) { console.error(`Heartbeat failed: ${response.status}`); return; }

//       const data = await response.json();
//       console.log(`[HEARTBEAT] ${activeTab.domain} (+30s)`, data);

//       // Nếu warning kích hoạt ngay heartbeat này (trường hợp không có alarm chính xác trước đó)
//       if (data.warning) {
//         showWarningNotification(activeTab.domain, data.warning.message, data.warning.remainingSeconds);
//       }

//       // Cập nhật schedule alarm chính xác cho lần tiếp theo
//       if (data.schedule) {
//         // Xoá alarm cũ trước khi đặt mới (tránh duplicate)
//         clearDomainAlarms(activeTab.domain);
//         scheduleWarningAlarms(activeTab.domain, data.schedule);
//       }

//       // Heartbeat xác nhận hết giờ (fallback nếu precise_block alarm bị miss)
//       if (data.limitExceeded) {
//         console.log(`[HEARTBEAT BLOCK] ${activeTab.domain}`);
//         const tabId = activeTab.tabId;
//         const domain = activeTab.domain;
//         activeTab = null;
//         blockTab(tabId, domain, "Đã hết thời gian sử dụng hôm nay");
//       }
//     } catch (error) {
//       console.error("Heartbeat error:", error);
//     }
//   }

//   // ── Ping (10s): báo hiệu extension còn sống ───────────────
//   if (alarm.name === "ping") {
//     const token = await getGoogleToken();
//     if (!token) return;
//     try {
//       await fetch(`${CONFIG.API_BASE}/ping`, {
//         method: "POST",
//         headers: { Authorization: `Bearer ${token}` }
//       });
//     } catch (_) {}
//   }
// });

// // ─── Clear Cache on Message ────────────────────────────────
// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//   if (message.type === "CLEAR_CACHE") {
//     domainCache.clear();
//     console.log("[CACHE CLEARED]");
//     sendResponse({ success: true });
//   }
// });

// console.log("Family Guardian Extension service worker initialized");




const domainCache = new Map();

const CONFIG = {
  API_BASE: "https://familyguardian-api.onrender.com/api/extension",
  CACHE_TTL_MS: 1 * 60 * 1000,
};

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
chrome.alarms.create("heartbeat", { periodInMinutes: 0.5 }); // 30s
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
  }
});

console.log("Family Guardian Extension initialized");