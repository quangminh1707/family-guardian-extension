const params = new URLSearchParams(location.search);
const blockedDomain = params.get('domain') || '';
const rawReason = params.get('reason') || '';
const blockedFullUrl = params.get('url') || '';
const TOKEN_KEY = 'googleToken';

const domainDisplayEl = document.getElementById('domain-display');
const reasonDisplayEl = document.getElementById('block-reason');

domainDisplayEl.textContent = blockedDomain || 'trang web này';
reasonDisplayEl.textContent = rawReason || 'Không có trong danh sách được phép';
document.title = `Bị chặn — ${blockedDomain || 'Family Guardian'}`;

async function getGoogleToken() {
  const stored = await chrome.storage.local.get([TOKEN_KEY]);
  if (stored[TOKEN_KEY]) return stored[TOKEN_KEY];

  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) {
        resolve(null);
        return;
      }
      resolve(token);
    });
  });
}

function getApiBase() {
  return typeof CONFIG !== 'undefined' ? CONFIG.API_BASE : '/api/extension';
}

(function initRequestAccessV3() {
  const titleEl = document.getElementById('block-title');
  const reasonEl = document.getElementById('block-reason');
  const reasonMsgEl = document.getElementById('block-reason-msg');
  const reasonTextEl = document.getElementById('block-reason-text');
  const infoEl = document.getElementById('block-info-detail');
  const btnRequest = document.getElementById('btn-request-access');
  const btnText = document.getElementById('btn-request-text');
  const statusDiv = document.getElementById('request-status');
  const pollingEl = document.getElementById('polling-indicator');

  if (!btnRequest || !statusDiv) return;

  const apiBase = getApiBase();
  let currentReason = detectReasonType(rawReason);
  let currentBlockMode = detectBlockMode(rawReason);
  const FAST_POLL_MS = 8000;
  const SLOW_POLL_MS = 20000;
  let fastPollTimer = null;
  let slowPollTimer = null;
  let lastConfig = null;

  function detectBlockMode(raw) {
    if (!raw) return null;
    const lower = raw.toLowerCase();
    if (lower.includes('khung') || lower.includes('window') || lower.includes('ngoài')) {
      return 'time_window';
    }
    if (lower.includes('limit') || lower.includes('hết') || lower.includes('time')) {
      return 'time_limit';
    }
    return null;
  }

  function detectReasonType(raw) {
    if (!raw) return 'not_in_whitelist';
    const lower = raw.toLowerCase();
    if (lower.includes('tạm dừng') || lower.includes('paused') || lower.includes('internet')) {
      return 'internet_paused';
    }
    if (lower.includes('khung') || lower.includes('window') || lower.includes('ngoài') || lower.includes('outside')) {
      return 'outside_time_window';
    }
    if (lower.includes('hết') || lower.includes('giờ') || lower.includes('time') || lower.includes('limit')) {
      return 'time_limit_exceeded';
    }
    return 'not_in_whitelist';
  }

  function updateBlockedUI(data) {
    const nextReason = data?.reason || currentReason;
    const nextBlockMode = data?.blockMode || currentBlockMode || detectBlockMode(rawReason);
    const limitMinutes = data?.limitMinutes ?? null;
    const usedSeconds = data?.usedSeconds ?? 0;
    const timeWindowStart = data?.timeWindowStart ?? null;
    const timeWindowEnd = data?.timeWindowEnd ?? null;

    currentReason = nextReason;
    currentBlockMode = nextBlockMode;

    const hasConfigDetails = limitMinutes != null || timeWindowStart != null || timeWindowEnd != null;
    if (hasConfigDetails) {
      const newConfig = JSON.stringify({
        limitMinutes,
        timeWindowStart,
        timeWindowEnd,
      });
      if (lastConfig !== null && lastConfig !== newConfig) {
        window.location.reload();
        return;
      }
      lastConfig = newConfig;
    }

    const copy = nextReason === 'internet_paused'
      ? {
          title: 'Internet đang bị tạm dừng',
          reason: 'Internet của bạn đang bị phụ huynh tạm dừng. Vui lòng liên hệ để bật lại.',
          detail: 'Internet đã bị tạm dừng bởi phụ huynh.',
        }
      : nextReason === 'outside_time_window' || nextBlockMode === 'time_window'
        ? {
            title: 'Ngoài khung giờ cho phép',
            reason: 'Website này chỉ được phép truy cập trong khung giờ nhất định. Vui lòng quay lại đúng giờ.',
            detail: `Khung giờ: ${timeWindowStart || '--:--'} – ${timeWindowEnd || '--:--'}`,
          }
        : nextReason === 'time_limit_exceeded'
          ? {
              title: 'Đã hết thời gian sử dụng',
              reason: 'Bạn đã dùng hết thời gian được phép cho website này hôm nay.',
              detail: `Đã dùng: ${Math.floor((usedSeconds || 0) / 60)} phút / ${limitMinutes ?? '?'} phút`,
            }
          : {
              title: 'Trang web bị chặn',
              reason: 'Không có trong danh sách được phép.',
              detail: 'Website này chưa được phụ huynh cho phép.',
            };

    if (titleEl) titleEl.textContent = copy.title;
    if (reasonEl) reasonEl.textContent = copy.reason;
    if (reasonTextEl) reasonTextEl.textContent = copy.title;
    if (infoEl) infoEl.textContent = copy.detail;
  }

  function showStatus(msg, type) {
    statusDiv.style.display = 'block';
    statusDiv.textContent = msg;
    const map = {
      success: { bg: 'rgba(34,197,94,0.12)', color: '#4ade80', border: 'rgba(34,197,94,0.25)' },
      error: { bg: 'rgba(239,68,68,0.12)', color: '#f87171', border: 'rgba(239,68,68,0.25)' },
      info: { bg: 'rgba(124,58,237,0.12)', color: '#c4b5fd', border: 'rgba(124,58,237,0.25)' },
    };
    const c = map[type] || map.info;
    statusDiv.style.cssText += `
      background:${c.bg}; color:${c.color}; border:1px solid ${c.border};
    `;
  }

  function renderReasonMessage() {
    if (!reasonMsgEl || !blockedDomain) return;
    if (currentReason === 'internet_paused') {
      reasonMsgEl.innerHTML = `⏸ <strong>Internet đang bị tạm dừng</strong> bởi phụ huynh.<br>
        Gửi yêu cầu để bố/mẹ bật lại.`;
      reasonMsgEl.style.borderColor = 'rgba(239,68,68,0.25)';
      reasonMsgEl.style.background = 'rgba(239,68,68,0.06)';
      if (btnText) btnText.textContent = 'Yêu cầu bật lại Internet';
    } else if (currentBlockMode === 'time_window' || currentReason === 'time_window' || currentReason === 'outside_time_window') {
      reasonMsgEl.innerHTML = `⏰ <strong>Website này chỉ mở trong khung giờ cho phép</strong>.<br>
        Gửi yêu cầu nếu bạn cần gia hạn khung giờ hoặc chờ đến đúng giờ truy cập.`;
      reasonMsgEl.style.borderColor = 'rgba(59,130,246,0.25)';
      reasonMsgEl.style.background = 'rgba(59,130,246,0.06)';
      if (btnText) btnText.textContent = 'Xin mở khung giờ';
    } else if (currentReason === 'time_limit_exceeded') {
      reasonMsgEl.innerHTML = `⏱ Bạn đã <strong>hết thời gian</strong> cho <strong>${blockedDomain}</strong> hôm nay.<br>
        Gửi yêu cầu để bố/mẹ gia hạn thêm.`;
      reasonMsgEl.style.borderColor = 'rgba(251,191,36,0.25)';
      reasonMsgEl.style.background = 'rgba(251,191,36,0.06)';
      if (btnText) btnText.textContent = 'Xin thêm thời gian';
    } else {
      reasonMsgEl.innerHTML = `🌐 Trang <strong>${blockedDomain}</strong> chưa được bố/mẹ cho phép.<br>
        Gửi yêu cầu để được duyệt truy cập.`;
      reasonMsgEl.style.borderColor = 'rgba(124,58,237,0.25)';
      reasonMsgEl.style.background = 'rgba(124,58,237,0.06)';
      if (btnText) btnText.textContent = 'Gửi yêu cầu truy cập';
    }
  }

  function clearPolling() {
    if (fastPollTimer) {
      clearInterval(fastPollTimer);
      fastPollTimer = null;
    }
    if (slowPollTimer) {
      clearInterval(slowPollTimer);
      slowPollTimer = null;
    }
  }

  async function loadReasonFromApi() {
    if (!blockedDomain) {
      updateBlockedUI({ reason: currentReason, blockMode: currentBlockMode });
      renderReasonMessage();
      return;
    }

    let info = null;
    if (!rawReason) {
      try {
        const stored = await chrome.storage.local.get([TOKEN_KEY]);
        const token = stored[TOKEN_KEY];
        if (token) {
          const res = await fetch(`${apiBase}/block-info?domain=${encodeURIComponent(blockedDomain)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            info = await res.json();
            currentReason = detectReasonType(info.reason || '');
            currentBlockMode = detectBlockMode(info.reason || '') || currentBlockMode;
          }
        }
      } catch {
        // Giữ reason hiện tại nếu API lỗi.
      }
    }

    updateBlockedUI({
      reason: info?.reason || currentReason,
      blockMode: info?.blockMode || currentBlockMode,
      limitMinutes: info?.limitMinutes ?? null,
      usedSeconds: info?.usedSeconds ?? 0,
      timeWindowStart: info?.timeWindowStart ?? null,
      timeWindowEnd: info?.timeWindowEnd ?? null,
    });
    renderReasonMessage();
  }

  btnRequest.addEventListener('click', async () => {
    btnRequest.disabled = true;
    btnRequest.style.opacity = '0.5';
    if (btnText) btnText.textContent = 'Đang gửi...';

    try {
      const stored = await chrome.storage.local.get([TOKEN_KEY]);
      const token = stored[TOKEN_KEY] || (await getGoogleToken());
      if (!token) throw new Error('no_token');

      const res = await fetch(`${apiBase}/request-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          domain: blockedDomain,
          reason: currentReason,
        }),
      });

      if (res.ok) {
        showStatus('✅ Đã gửi! Trang sẽ tự mở khi bố/mẹ duyệt.', 'success');
        if (btnText) btnText.textContent = 'Đã gửi yêu cầu';
        startActivePolling();
      } else {
        const data = await res.json().catch(() => ({}));
        const msg = data.message || 'Gửi thất bại. Thử lại sau.';
        showStatus(msg, 'error');
        btnRequest.disabled = false;
        btnRequest.style.opacity = '1';
        renderReasonMessage();
      }
    } catch (e) {
      if (e.message === 'no_token') {
        showStatus('Không tìm thấy phiên đăng nhập. Mở extension và đăng nhập lại.', 'error');
      } else {
        showStatus('Lỗi kết nối. Kiểm tra mạng và thử lại.', 'error');
      }
      btnRequest.disabled = false;
      btnRequest.style.opacity = '1';
      renderReasonMessage();
    }
  });

  async function pollCheck(updateUI = false) {
    if (!blockedDomain) return false;
    try {
      const stored = await chrome.storage.local.get([TOKEN_KEY]);
      const token = stored[TOKEN_KEY] || (await getGoogleToken());
      if (!token) return false;

      const res = await fetch(`${apiBase}/check?domain=${encodeURIComponent(blockedDomain)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return false;

      const data = await res.json();
      const isAllowed = data.allowed === true || data.isAllowed === true || data.result === true;
      if (isAllowed) {
        clearPolling();
        const targetUrl = blockedFullUrl || `https://${blockedDomain}`;
        window.location.href = targetUrl;
        return true;
      }

      currentReason = data.reason || currentReason || detectReasonType(rawReason);
      currentBlockMode = data.blockMode || currentBlockMode || detectBlockMode(rawReason) || null;

      if (updateUI) {
        updateBlockedUI(data);
        renderReasonMessage();
      }
    } catch {
      // Ignore network issues and continue polling.
    }
    return false;
  }

  function startPassivePolling() {
    clearPolling();
    fastPollTimer = setInterval(() => {
      void pollCheck(false);
    }, FAST_POLL_MS);
    slowPollTimer = setInterval(() => {
      void pollCheck(true);
    }, SLOW_POLL_MS);
    void pollCheck(true);
  }

  function startActivePolling() {
    clearPolling();
    if (pollingEl) pollingEl.style.display = 'block';
    fastPollTimer = setInterval(() => {
      void pollCheck(false);
    }, 5000);
    slowPollTimer = setInterval(() => {
      void pollCheck(true);
    }, 10000);
    void pollCheck(true);
  }

  loadReasonFromApi();
  startPassivePolling();
})();
