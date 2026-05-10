# 🔐 Bảo mật API và Google Client ID trong Chrome Extension

> **Mục tiêu:** Tách toàn bộ giá trị nhạy cảm ra khỏi source code, dùng `.env` + build script để generate. Không ảnh hưởng chức năng hiện có. Không commit secret lên GitHub.

---

## Tổng quan cơ chế

Chrome Extension không thể đọc `.env` trực tiếp như Node.js.  
Giải pháp: dùng **`build-config.js`** (Node.js thuần, không cần thư viện) đọc `.env` → generate ra `config.js` và `manifest.json`.

```
.env  ──→  build-config.js  ──→  config.js      (gitignore)
                            ──→  manifest.json   (gitignore)
manifest.template.json ──→ (base để inject client_id vào)
```

---

## Danh sách file cần tạo mới

| File | Commit? | Mục đích |
|---|---|---|
| `.env` | ❌ gitignore | Chứa giá trị thật |
| `.env.example` | ✅ | Template cho người clone |
| `build-config.js` | ✅ | Script generate config |
| `manifest.template.json` | ✅ | Base manifest, không có secret |
| `.gitignore` | ✅ | Ignore `.env`, `config.js`, `manifest.json` |
| `package.json` | ✅ | Định nghĩa script `npm run build` |

## Danh sách file bị thay đổi

| File | Thay đổi |
|---|---|
| `config.js` | Trở thành file **generated** (không sửa tay) |
| `manifest.json` | Trở thành file **generated** (không sửa tay) |

---

## Bước 1 — Tạo `.env`

```env
# Backend API
API_BASE=https://familyguardian-api.onrender.com/api/extension

# Google OAuth Client ID
GOOGLE_CLIENT_ID=546760398169-xxxxx.apps.googleusercontent.com

# Cache TTL (milliseconds)
CACHE_TTL_MS=60000

# Heartbeat interval (milliseconds)
HEARTBEAT_INTERVAL_MS=30000
```

---

## Bước 2 — Tạo `.env.example`

Giống `.env` nhưng thay giá trị thật bằng placeholder:

```env
API_BASE=https://your-backend.com/api/extension
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
CACHE_TTL_MS=60000
HEARTBEAT_INTERVAL_MS=30000
```

---

## Bước 3 — Tạo `build-config.js`

Script Node.js thuần (không cần `npm install` gì):

- Parse `.env` thủ công (không dùng dotenv)
- Validate: báo lỗi nếu `API_BASE` hoặc `GOOGLE_CLIENT_ID` chưa điền
- Generate `config.js` với nội dung:

```js
// AUTO-GENERATED — không sửa tay
const CONFIG = {
  API_BASE:              "<API_BASE từ .env>",
  CACHE_TTL_MS:          <CACHE_TTL_MS>,
  HEARTBEAT_INTERVAL_MS: <HEARTBEAT_INTERVAL_MS>,
  BLOCK_PAGE_URL:        "<API_BASE bỏ /api/extension, thêm /blocked>",
};
```

- Đọc `manifest.template.json`, inject `GOOGLE_CLIENT_ID` vào `oauth2.client_id`, ghi ra `manifest.json`
- In ra terminal: `✅ config.js generated`, `✅ manifest.json generated`

---

## Bước 4 — Tạo `manifest.template.json`

Lấy nội dung từ `manifest.json` hiện tại, chỉ thay `client_id` thành placeholder:

```json
"oauth2": {
  "client_id": "PLACEHOLDER_REPLACED_BY_BUILD",
  "scopes": ["openid", "email", "profile"]
}
```

Giữ nguyên tất cả phần còn lại của `manifest.json` (permissions, background, icons...).

---

## Bước 5 — Tạo `package.json`

```json
{
  "name": "family-guardian-extension",
  "version": "1.0.0",
  "scripts": {
    "build": "node build-config.js",
    "setup": "cp .env.example .env && echo Điền giá trị vào .env rồi chạy npm run build"
  }
}
```

---

## Bước 6 — Tạo `.gitignore`

```gitignore
# Secret — không commit
.env
.env.production
.env.local

# Generated files — không commit
config.js
manifest.json

# OS
.DS_Store
Thumbs.db
*.log
```

---

## Bước 7 — Kiểm tra `background.js` và `popup.js`

**Không cần sửa** `background.js` — file này đã dùng `CONFIG.*` từ `config.js`.  
`config.js` được load trước `background.js` nên `CONFIG` đã có sẵn khi service worker khởi động.

Kiểm tra `popup.js`:
- Nếu có dòng `const API_BASE = "https://..."` hardcode → **xóa dòng đó**
- Thay bằng `CONFIG.API_BASE` (vì `config.js` được load trước trong `popup.html`)

Kiểm tra `popup.html`:
- Phải có `<script src="config.js"></script>` **trước** `<script src="popup.js"></script>`

---

## Quy trình sau khi setup xong

```bash
# Lần đầu (hoặc sau khi clone)
npm run setup        # tạo .env từ .env.example
# → mở .env, điền API_BASE và GOOGLE_CLIENT_ID thật
node build-config.js # generate config.js + manifest.json

# Mỗi khi đổi .env
node build-config.js

# Sau đó vào chrome://extensions → nhấn Reload
```

---

## Checklist hoàn thành

- [ ] `.env` tạo xong, điền đúng giá trị
- [ ] `.env.example` tạo xong (placeholder)
- [ ] `build-config.js` tạo xong, chạy `node build-config.js` không lỗi
- [ ] `config.js` được generate đúng (kiểm tra `API_BASE` và không có hardcode)
- [ ] `manifest.template.json` tạo xong (client_id là placeholder)
- [ ] `manifest.json` được generate đúng (client_id thật được inject)
- [ ] `.gitignore` có `.env`, `config.js`, `manifest.json`
- [ ] `popup.html` load `config.js` trước `popup.js`
- [ ] `popup.js` dùng `CONFIG.API_BASE` thay vì hardcode URL
- [ ] Test extension: reload → đăng nhập → filter hoạt động bình thường
- [ ] Chạy `git status` xác nhận `.env`, `config.js`, `manifest.json` không xuất hiện trong staged files
