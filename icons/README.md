# Family Guardian Extension — Icons

Bạn cần tạo 3 file ảnh PNG cho icons:

- **icon16.png** — 16x16 pixels (dùng cho context menu)
- **icon48.png** — 48x48 pixels (dùng cho popup)
- **icon128.png** — 128x128 pixels (dùng cho store)

## Hướng dẫn tạo icons

### Cách 1: Dùng Figma (Miễn phí)
1. Mở https://figma.com
2. Tạo design với logo 🛡️ (shield emoji)
3. Export thành PNG cho mỗi kích cỡ

### Cách 2: Dùng favicon generator
1. Mở https://realfavicongenerator.net/
2. Upload ảnh logo (hoặc vẽ bằng tay)
3. Download icons

### Cách 3: Dùng ImageMagick (Command line)
```bash
# Cần cài ImageMagick trước
convert -size 128x128 xc:white -pointsize 72 -draw "gravity center fill none text 0,0 '🛡️'" icon128.png
convert -resize 48x48 icon128.png icon48.png
convert -resize 16x16 icon128.png icon16.png
```

## PNG Template

Nếu bạn chỉ muốn một solution nhanh, bạn có thể:
1. Dùng một icon pack trực tuyến: https://icoconvert.com/
2. Upload ảnh và generate PNG cho các kích cỡ
3. Lưu vào thư mục này

**Hoặc:** Dùng logo của Family Guardian nếu đã có file sẵn.
