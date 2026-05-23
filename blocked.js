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

  // ── Hàm hiển thị trạng thái sau khi gửi yêu cầu ──
  function showStatus(message, type) {
    if (!statusDiv) return;
    statusDiv.style.display      = 'block';
    statusDiv.style.marginTop    = '10px';
    statusDiv.style.padding      = '10px 14px';
    statusDiv.style.borderRadius = '8px';
    statusDiv.style.fontSize     = '13px';
    statusDiv.style.lineHeight   = '1.5';
    statusDiv.style.textAlign    = 'center';
    if (type === 'success') {
      statusDiv.style.background = 'rgba(34, 197, 94, 0.12)';
      statusDiv.style.border     = '1px solid rgba(34, 197, 94, 0.30)';
      statusDiv.style.color      = '#86efac';
    } else {
      statusDiv.style.background = 'rgba(239, 68, 68, 0.12)';
      statusDiv.style.border     = '1px solid rgba(239, 68, 68, 0.30)';
      statusDiv.style.color      = '#fca5a5';
    }
    statusDiv.textContent = message;
  }

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

  function applyReasonUI(reason, data) {
    const reasonEl     = document.getElementById('block-reason');
    const reasonTextEl = document.getElementById('block-reason-text');
    const infoDetailEl = document.getElementById('block-info-detail');
    const reasonMsgEl  = document.getElementById('block-reason-msg');

    switch (reason) {
      case 'time_limit_exceeded': {
        const limit   = data?.limitMinutes ?? '?';
        const usedMin = data?.usedSeconds != null
          ? Math.floor(data.usedSeconds / 60)
          : null;

        if (reasonEl) reasonEl.textContent = `Đã hết ${limit} phút cho phép hôm nay`;
        if (reasonTextEl) reasonTextEl.textContent = 'Đã hết thời gian sử dụng';
        if (infoDetailEl) infoDetailEl.textContent = usedMin != null
            ? `Đã dùng: ${usedMin} phút / ${limit} phút`
            : `Giới hạn: ${limit} phút/ngày`;
        if (reasonMsgEl) {
          reasonMsgEl.textContent = `🕐 Bạn đã dùng hết ${limit} phút được cho phép hôm nay.\nGửi yêu cầu để được thêm thời gian.`;
          reasonMsgEl.style.borderColor = 'rgba(251,191,36,0.25)';
          reasonMsgEl.style.background = 'rgba(251,191,36,0.06)';
        }
        if (btnText) btnText.textContent = 'Xin thêm thời gian';
        break;
      }

      case 'outside_time_window': {
        const start = data?.timeWindowStart ?? '--:--';
        const end   = data?.timeWindowEnd   ?? '--:--';

        if (reasonEl) reasonEl.textContent = `Ngoài khung giờ cho phép`;
        if (reasonTextEl) reasonTextEl.textContent = 'Ngoài khung giờ cho phép';
        if (infoDetailEl) infoDetailEl.textContent = (start !== '--:--' && end !== '--:--')
            ? `Khung giờ được phép: ${start} – ${end}`
            : 'Website này chỉ được dùng trong khung giờ nhất định';
        if (reasonMsgEl) {
          reasonMsgEl.textContent = `⏰ Website này chỉ được truy cập trong khung giờ ${start} – ${end}.\nGửi yêu cầu để được truy cập ngoài giờ.`;
          reasonMsgEl.style.borderColor = 'rgba(59,130,246,0.25)';
          reasonMsgEl.style.background = 'rgba(59,130,246,0.06)';
        }
        if (btnText) btnText.textContent = 'Xin mở khung giờ';
        break;
      }

      case 'internet_paused': {
        if (reasonEl) reasonEl.textContent = 'Internet đã bị tạm dừng bởi bố/mẹ';
        if (reasonTextEl) reasonTextEl.textContent = 'Internet đang bị tạm dừng';
        if (infoDetailEl) infoDetailEl.textContent = 'Tất cả kết nối web đang bị chặn hoàn toàn';
        if (reasonMsgEl) {
          reasonMsgEl.textContent = `🚫 Bố/mẹ đã tạm dừng toàn bộ internet.\nGửi yêu cầu để được bật lại.`;
          reasonMsgEl.style.borderColor = 'rgba(239,68,68,0.25)';
          reasonMsgEl.style.background = 'rgba(239,68,68,0.06)';
        }
        if (btnText) btnText.textContent = 'Gửi yêu cầu bật lại internet';
        break;
      }

      default: {
        if (reasonEl) reasonEl.textContent = 'Không có trong danh sách được phép';
        if (reasonTextEl) reasonTextEl.textContent = 'Trang web bị chặn';
        if (infoDetailEl) infoDetailEl.textContent = 'Website này chưa được bố/mẹ cho phép';
        if (reasonMsgEl) {
          const domainDisplay = blockedDomain || 'trang web này';
          reasonMsgEl.textContent = `🌐 Trang ${domainDisplay} chưa được bố/mẹ cho phép.\nGửi yêu cầu để được duyệt truy cập.`;
          reasonMsgEl.style.borderColor = 'rgba(124,58,237,0.25)';
          reasonMsgEl.style.background = 'rgba(124,58,237,0.06)';
        }
        if (btnText) btnText.textContent = 'Gửi yêu cầu truy cập';
        break;
      }
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
      applyReasonUI(currentReason, null);
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

    applyReasonUI(info?.reason || currentReason, {
      limitMinutes: info?.limitMinutes ?? null,
      usedSeconds: info?.usedSeconds ?? null,
      timeWindowStart: info?.timeWindowStart ?? null,
      timeWindowEnd: info?.timeWindowEnd ?? null,
    });
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
        applyReasonUI(currentReason, null);
      }
    } catch (e) {
      if (e.message === 'no_token') {
        showStatus('Không tìm thấy phiên đăng nhập. Mở extension và đăng nhập lại.', 'error');
      } else {
        showStatus('Lỗi kết nối. Kiểm tra mạng và thử lại.', 'error');
      }
      btnRequest.disabled = false;
      btnRequest.style.opacity = '1';
      applyReasonUI(currentReason, null);
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
        applyReasonUI(currentReason, data);

        const newConfig = JSON.stringify({
          limitMinutes:    data?.limitMinutes,
          timeWindowStart: data?.timeWindowStart,
          timeWindowEnd:   data?.timeWindowEnd
        });
        if (lastConfig !== null && lastConfig !== newConfig) {
          window.location.reload();
          return true;
        }
        lastConfig = newConfig;
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

  applyReasonUI(currentReason, null);
  loadReasonFromApi();
  startPassivePolling();
})();