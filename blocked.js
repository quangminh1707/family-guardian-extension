// Parse query parameters from URL
const params = new URLSearchParams(location.search);
const domain = params.get("domain") || "trang web này";
const reason = params.get("reason") || "Không có trong danh sách được phép";

// Display domain and reason
document.getElementById("domain-display").textContent = domain;
document.getElementById("reason-display").textContent = reason;
document.title = `Bị chặn — ${domain}`;

// Log blocking event
console.log(`[BLOCKED PAGE] Domain: ${domain}, Reason: ${reason}`);
