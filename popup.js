const API_BASE = "http://localhost:5247/api/extension";

async function getToken(interactive = false) {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        console.warn("Auth token error:", chrome.runtime.lastError?.message);
        resolve(null);
      } else {
        resolve(token);
      }
    });
  });
}

async function initPopup() {
  // Auto-login with cached token (no interactive popup)
  const token = await getToken(false);

  if (!token) {
    // Show login button if no token available
    document.getElementById("loading").style.display = "none";
    document.getElementById("login-section").style.display = "block";
    
    // Bind login button
    const loginBtn = document.getElementById("btn-login");
    if (loginBtn) {
      loginBtn.onclick = async () => {
        loginBtn.disabled = true;
        loginBtn.textContent = "Đang đăng nhập...";
        const interactiveToken = await getToken(true);
        if (interactiveToken) {
          // Reload after login
          location.reload();
        } else {
          alert("Không thể đăng nhập. Vui lòng thử lại.");
          loginBtn.disabled = false;
          loginBtn.textContent = "Đăng nhập Google";
        }
      };
    }
    return;
  }

  // Token exists - try to fetch config from backend
  // Backend will validate if account is child account
  try {
    const response = await fetch(`${API_BASE}/config`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired, clear it
        chrome.identity.removeCachedAuthToken({ token: token }, () => {
          location.reload();
        });
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    document.getElementById("loading").style.display = "none";
    document.getElementById("content").style.display = "block";
    
    // Display user info
    document.getElementById("user-email").textContent = data.fullName || data.email || "—";

    // Display filter status
    const badge = document.getElementById("filter-badge");
    if (data.filterEnabled) {
      badge.textContent = "✅ BẬT";
      badge.className = "badge on";
    } else {
      badge.textContent = "❌ TẮT";
      badge.className = "badge off";
    }

    console.log("Popup initialized:", data);
  } catch (error) {
    console.error("Popup init error:", error);
    document.getElementById("loading").textContent = "Lỗi kết nối server.";
  }
}

// Logout Handler
const logoutBtn = document.getElementById("btn-logout");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    chrome.identity.clearAllCachedAuthTokens(() => {
      console.log("Logged out");
      // Clear cache in background worker
      chrome.runtime.sendMessage({ type: "CLEAR_CACHE" }, () => {
        location.reload();
      });
    });
  });
}

// Initialize on load
initPopup();
