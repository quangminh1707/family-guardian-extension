const params = new URLSearchParams(location.search);
const blockedDomain = params.get('domain') || '';
const rawReason = params.get('reason') || '';
const blockedFullUrl = params.get('url') || '';
const TOKEN_KEY = 'googleToken';

document.getElementById('domain-display').textContent = blockedDomain || 'trang web này';
document.getElementById('reason-display').textContent = rawReason || 'Không có trong danh sách được phép';
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
  const reasonMsgEl = document.getElementById('block-reason-msg');
  const btnRequest = document.getElementById('btn-request-access');
  const btnText = document.getElementById('btn-request-text');
  const statusDiv = document.getElementById('request-status');
  const pollingEl = document.getElementById('polling-indicator');

  if (!btnRequest || !statusDiv) return;

  const apiBase = getApiBase();
  let currentReason = detectReason(rawReason);
  let pollTimer = null;
  let pollCount = 0;
  const MAX_POLL = 40;

  function detectReason(raw) {
    if (!raw) return 'not_in_whitelist';
    const lower = raw.toLowerCase();
    if (lower.includes('tạm dừng') || lower.includes('paused') || lower.includes('internet')) {
      return 'internet_paused';
    }
    if (lower.includes('hết') || lower.includes('giờ') || lower.includes('time') || lower.includes('limit')) {
      return 'time_limit_exceeded';
    }
    return 'not_in_whitelist';
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

  async function loadReasonFromApi() {
    if (rawReason || !blockedDomain) {
      renderReasonMessage();
      return;
    }
    try {
      const stored = await chrome.storage.local.get([TOKEN_KEY]);
      const token = stored[TOKEN_KEY];
      if (!token) {
        renderReasonMessage();
        return;
      }

      const res = await fetch(`${apiBase}/block-info?domain=${encodeURIComponent(blockedDomain)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const info = await res.json();
        currentReason = info.reason || 'not_in_whitelist';
      }
    } catch {
      // Use default reason if API lookup fails.
    }
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

  async function checkAndRedirect() {
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
        if (pollTimer) clearInterval(pollTimer);
        const targetUrl = blockedFullUrl || `https://${blockedDomain}`;
        window.location.href = targetUrl;
        return true;
      }
    } catch {
      // Ignore network issues and continue polling.
    }
    return false;
  }

  function startPassivePolling() {
    setTimeout(checkAndRedirect, 5000);

    pollTimer = setInterval(async () => {
      pollCount++;
      if (pollCount > MAX_POLL) {
        clearInterval(pollTimer);
        if (pollingEl) pollingEl.style.display = 'none';
        return;
      }
      await checkAndRedirect();
    }, 30_000);
  }

  function startActivePolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollCount = 0;
    if (pollingEl) pollingEl.style.display = 'block';

    setTimeout(checkAndRedirect, 3000);

    pollTimer = setInterval(async () => {
      pollCount++;
      if (pollCount > MAX_POLL) {
        clearInterval(pollTimer);
        if (pollingEl) pollingEl.style.display = 'none';
        return;
      }
      const redirected = await checkAndRedirect();
      if (redirected) clearInterval(pollTimer);
    }, 10_000);
  }

  loadReasonFromApi();
  startPassivePolling();
})();
