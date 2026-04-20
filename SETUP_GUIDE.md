# Family Guardian Extension — Hướng dẫn Cài đặt

## 🎯 Cách hoạt động

### Tự động đăng nhập (Auto-login)
- Extension sẽ **tự động sử dụng tài khoản Google đã đăng nhập trên Chrome**
- Không cần popup xác thực nếu tài khoản con đã được thiết lập trên thiết bị
- Nếu chưa có token, sẽ hiển thị nút "Đăng nhập Google"

### Kiểm tra tài khoản con (Child Account)
Extension **bắt buộc phải** là tài khoản con dưới Family Link:
- Nếu đăng nhập tài khoản cha → ❌ Hiển thị cảnh báo
- Nếu đăng nhập tài khoản con → ✅ Bộ lọc hoạt động bình thường

---

## 🔧 Yêu cầu cài đặt

### Trên thiết bị của con:

#### 1️⃣ **Thiết lập Family Link** (nếu chưa có)
```
Chrome Settings > You and Google > Manage your Google Account
→ Personal info → Check if account is Child account
```

#### 2️⃣ **Cài đặt Extension**
- Tải extension (hoặc load unpacked trong Developer Mode)
- Extension sẽ tự nhận diện tài khoản con từ Chrome

#### 3️⃣ **Kích hoạt Bộ lọc**
- Nhấp vào extension icon
- Nếu là tài khoản con → Hiển thị trạng thái bộ lọc
- Toggle "Bộ lọc web" ON/OFF

---

## 🐛 Troubleshooting

### ❌ Lỗi: "Không thể đăng nhập"
**Nguyên nhân:** 
- Trình duyệt chưa đăng nhập tài khoản Google
- Token hết hạn

**Giải pháp:**
1. Đảm bảo Chrome đã đăng nhập Google
2. Nhấp nút "Đăng nhập Google" trong extension
3. Chọn tài khoản con

### ⚠️ Cảnh báo: "Vui lòng đăng nhập bằng tài khoản con"
**Nguyên nhân:** 
- Đang dùng tài khoản cha (admin), không phải con

**Giải pháp:**
1. Đăng xuất khỏi extension
2. Chrome Settings → Accounts → Chuyển sang tài khoản con
3. Đăng nhập lại extension

---

## 🔐 Bảo mật

- **Token được lưu an toàn** trong Chrome's Credential Storage
- **Không lưu password** → Chỉ dùng OAuth token
- **Cache domain** có TTL 5 phút
- **Heartbeat** gửi request 30s một lần để báo con đang active

---

## 📱 Cách Kiểm tra Tài khoản Con

**Chrome Desktop/Chromebook:**
```
Settings > You and Google > Manage your Google Account
→ Personal info → "This is a child account" (nếu hiển thị)
```

**Hoặc:**
```
Settings > Accounts
→ Tìm tài khoản → Nếu có icon "👶" → Đó là child account
```

---

## 🚀 Cập nhật Extension

- Khi cập nhật code → Reload extension trong chrome://extensions
- Cache domain sẽ được xóa tự động

---

**Phiên bản:** 1.0.0  
**Cập nhật lần cuối:** 2026-04-19
