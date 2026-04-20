# Family Guardian — Chrome Extension

Bộ lọc web an toàn cho trẻ em, kiểm soát truy cập qua Google Account.

## 📋 Yêu cầu

- Chrome/Chromium phiên bản 88+
- Kết nối internet
- Tài khoản Google cho con em
- Backend FamilyGuardian API đang chạy

## 🚀 Cài đặt (Developer Mode)

### Bước 1: Chuẩn bị

1. Tải/clone extension này vào máy tính
2. **Tạo icons** (xem `icons/README.md`):
   - `icon16.png` (16x16)
   - `icon48.png` (48x48)
   - `icon128.png` (128x128)

3. Cập nhật `manifest.json`:
   - Thay `YOUR_GOOGLE_CLIENT_ID` bằng Google Client ID thật
   - Xem hướng dẫn trong "Đăng ký Google OAuth" bên dưới

4. Cập nhật `popup.js` và `background.js`:
   - Thay `https://yourserver.com/api/extension` bằng URL backend thật

### Bước 2: Load Extension

1. Mở `chrome://extensions/` trong Chrome
2. Bật toggle **"Developer mode"** ở góc phải trên
3. Click **"Load unpacked"**
4. Chọn thư mục `family-guardian-extension`
5. Extension sẽ appear trong danh sách

### Bước 3: Kiểm tra

1. Click icon extension trên thanh công cụ Chrome
2. Bấm **"Đăng nhập Google"**
3. Đăng nhập bằng tài khoản con
4. Popup sẽ hiển thị status: "✅ BẬT" hoặc "❌ TẮT"

## 🔑 Google OAuth Setup

### Tạo Google Client ID

1. Mở [Google Cloud Console](https://console.cloud.google.com/)
2. Tạo project mới (hoặc dùng project cũ)
3. **API & Services** → **Credentials**
4. Click **"Create Credentials"** → **OAuth 2.0 Client ID**
5. Chọn **"Chrome Extension"** (hoặc **Web application**)
6. Thêm URI:
   ```
   chrome-extension://<EXTENSION_ID>/popup.html
   ```
   - Lấy `<EXTENSION_ID>` từ `chrome://extensions/` (sau khi load extension)

7. Copy **Client ID** vào `manifest.json`:
   ```json
   "oauth2": {
     "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com"
   }
   ```

8. Reload extension (`chrome://extensions/` → reload button)

## 📡 Backend API Endpoints

Extension gọi các endpoint này:

### `GET /api/extension/check?domain=youtube.com`
- **Auth**: Bearer token (Google Access Token)
- **Response**: `{ allowed: boolean, reason: string, domain: string }`
- Gọi mỗi khi user mở tab mới

### `GET /api/extension/config`
- **Auth**: Bearer token
- **Response**: `{ filter_enabled: boolean, child_id: number, full_name: string }`
- Gọi khi popup mở

### `POST /api/extension/heartbeat`
- **Auth**: Bearer token
- **Body**: `{ domain: string, allowed_website_id: number }`
- Gọi mỗi 30 giây (tracking time)

### `PATCH /api/children/{childId}/filter`
- **Auth**: JWT (Guardian)
- **Body**: `{ filter_enabled: boolean }`
- Guardian bật/tắt bộ lọc

## 🔧 Debugging

### Xem logs

1. Mở `chrome://extensions/`
2. Tìm **"Family Guardian"** extension
3. Click **"Background page"** (hoặc **"Errors"**)
4. Console sẽ hiển thị logs từ background worker

### Xem cache

Trong background console:
```javascript
// Xem domain cache
chrome.runtime.getBackgroundPage(bg => {
  console.log(bg.domainCache);
});
```

### Test API call

Trong popup console:
```javascript
const token = await getToken(false);
const res = await fetch('https://yourserver.com/api/extension/check?domain=youtube.com', {
  headers: { Authorization: `Bearer ${token}` }
});
console.log(await res.json());
```

## ⚙️ Cấu hình

### Thay đổi API URL

File `background.js` (dòng ~6):
```javascript
const CONFIG = {
  API_BASE: "https://yourserver.com/api/extension",  // ← Thay đây
  CACHE_TTL_MS: 5 * 60 * 1000,
  HEARTBEAT_INTERVAL_MS: 30000,
};
```

File `popup.js` (dòng ~1):
```javascript
const API_BASE = "https://yourserver.com/api/extension";  // ← Thay đây
```

### Thay đổi cache time

`CONFIG.CACHE_TTL_MS` = milliseconds (mặc định 5 phút = 300,000ms)

- Giảm để update nhanh hơn
- Tăng để giảm tải server

### Thay đổi heartbeat interval

`CONFIG.HEARTBEAT_INTERVAL_MS` = milliseconds (mặc định 30 giây = 30,000ms)

## 📝 File Structure

```
family-guardian-extension/
├── manifest.json          ← Extension config
├── background.js          ← Service worker (main logic)
├── popup.html             ← Popup UI
├── popup.js               ← Popup logic
├── blocked.html           ← Block page
├── blocked.js             ← Block page logic
├── config.js              ← Configuration
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md              ← This file
```

## 🐛 Troubleshooting

### Extension không hoạt động

- [ ] Manifest.json có lỗi? (kiểm tra syntax JSON)
- [ ] Google Client ID sẽ không đúng?
- [ ] Backend API URL đúng không?
- [ ] Backend có CORS policy cho `chrome-extension://` origin không?

### Đăng nhập không được

- [ ] Có internet không?
- [ ] Google Client ID đúng không?
- [ ] Redirect URI trong Google Cloud Console có match không?

### Trang web không bị chặn

- [ ] Filter toggle có bật trong dashboard không?
- [ ] Domain có trong danh sách cho phép không?
- [ ] Khung giờ hợp lệ không?
- [ ] Cache còn 5 phút? Thử clear cache hoặc reload extension

### Heartbeat không gửi

- [ ] Extension có token không? (check popup)
- [ ] Backend API `/api/extension/heartbeat` có hoạt động không?
- [ ] Network tab trong DevTools có error không?

## 📚 Tài liệu

- [Chrome Extension Docs](https://developer.chrome.com/docs/extensions/)
- [Chrome webRequest API](https://developer.chrome.com/docs/extensions/reference/webRequest/)
- [Google OAuth for Extensions](https://developer.chrome.com/docs/extensions/mv3/declare_permissions/#oauth2)

## 📄 License

© 2026 Family Guardian. All rights reserved.
