// Parse query parameters from URL
const params = new URLSearchParams(location.search);
const domain = params.get("domain") || "trang web này";
const reason = params.get("reason") || "Không có trong danh sách được phép";

// Display domain and reason
document.getElementById("domain-display").textContent = domain;
document.getElementById("reason-display").textContent = reason;
document.title = `Bị chặn — ${domain}`;

// ============================================================
// REQUEST ACCESS — Thêm mới, KHÔNG sửa code cũ phía trên
// ============================================================
(function initRequestAccess() {
  const requestSection = document.getElementById('request-section');
  const btnRequest = document.getElementById('btn-request-access');
  const statusDiv = document.getElementById('request-status');
  
  if (!btnRequest || !statusDiv || !requestSection) return;

  if (reason.includes("Không có trong danh sách được phép")) {
    requestSection.style.display = 'block';
  }

  const blockedDomain = domain;
  const blockedFullUrl = location.href;

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
    if (type === 'success') {
      statusDiv.style.background = 'rgba(34,197,94,0.15)';
      statusDiv.style.color = '#4ade80';
      statusDiv.style.border = '1px solid rgba(34,197,94,0.3)';
    } else if (type === 'error') {
      statusDiv.style.background = 'rgba(239,68,68,0.15)';
      statusDiv.style.color = '#f87171';
      statusDiv.style.border = '1px solid rgba(239,68,68,0.3)';
    } else {
      statusDiv.style.background = 'rgba(251,191,36,0.15)';
      statusDiv.style.color = '#fbbf24';
      statusDiv.style.border = '1px solid rgba(251,191,36,0.3)';
    }
  }

  btnRequest.addEventListener('mouseover', () => {
    btnRequest.style.background = 'rgba(124,58,237,0.25)';
  });
  btnRequest.addEventListener('mouseout', () => {
    if (!btnRequest.disabled) btnRequest.style.background = 'rgba(124,58,237,0.15)';
  });

  btnRequest.addEventListener('click', () => {
    btnRequest.disabled = true;
    btnRequest.style.opacity = '0.6';
    btnRequest.textContent = 'Đang gửi...';

    // Gửi message cho background script để request api (vì background mới lấy được token)
    chrome.runtime.sendMessage({
      type: "REQUEST_ACCESS",
      domain: blockedDomain,
      fullUrl: blockedFullUrl
    }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        showStatus(response?.error || 'Lỗi kết nối. Kiểm tra mạng và thử lại.', 'error');
        btnRequest.disabled = false;
        btnRequest.style.opacity = '1';
        btnRequest.textContent = '📨 Gửi yêu cầu truy cập cho bố/mẹ';
      } else {
        showStatus('✅ Đã gửi! Bố/mẹ sẽ nhận được thông báo ngay.', 'success');
        btnRequest.textContent = 'Đã gửi yêu cầu';
        // Disable 5 phút để tránh spam
        setTimeout(() => {
          btnRequest.disabled = false;
          btnRequest.style.opacity = '1';
          btnRequest.textContent = '📨 Gửi yêu cầu truy cập cho bố/mẹ';
          statusDiv.style.display = 'none';
        }, 5 * 60 * 1000);
      }
    });
  });
})();
