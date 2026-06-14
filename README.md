# Sơn Hải — Trình đọc truyện chữ

Trình đọc truyện chữ riêng tư, tối ưu cho điện thoại. Chạy hoàn toàn trong trình duyệt
(không cần server), lưu thư viện và vị trí đọc vào `localStorage` của máy.

## Tính năng

- **Thư viện** với thẻ "Tiếp tục đọc" ghi nhớ chương và vị trí gần nhất.
- **Trình đọc** chữ Việt căn đều, đẹp; chạm giữa màn hình để ẩn/hiện thanh công cụ (chế độ đắm chìm).
- **Tùy chỉnh**: 3 nền (Giấy / Sáng / Tối), 3 phông (Lora / Noto / Sans), cỡ chữ & giãn dòng.
- **Tự động cập nhật chương** — script chạy hằng ngày trên máy Mac đọc nhóm Facebook công
  khai, lấy link Google Docs của chương mới, tải về và đẩy lên `data/chapters.json`; mở app
  là thấy chương mới. Xem [`crawler/`](crawler/README.md).
- **Thêm chương thủ công** (luôn hoạt động, dùng khi crawler lỗi):
  - *Từ link Google Docs* — dán link (mỗi dòng một link), app tự lấy nội dung qua public relay.
  - *Dán văn bản* — tự nhận số & tên "Chương …".
- Đã nạp sẵn **Chương 868** để mở là đọc được ngay.

## Chạy

Mở `index.html` (hoặc `Đọc Truyện.html`) bằng trình duyệt. Để dùng như app trên điện thoại,
mở trang rồi chọn **Add to Home Screen**.

Phục vụ qua máy chủ tĩnh bất kỳ, ví dụ:

```bash
python3 -m http.server 8000
# rồi mở http://localhost:8000
```

## Cấu trúc

| File | Vai trò |
|---|---|
| `index.html` | Giao diện + style (entry chính) |
| `Đọc Truyện.html` | Chuyển hướng tới `index.html` (giữ link bản thiết kế gốc) |
| `vercel.json` / `.vercelignore` | Cấu hình deploy tĩnh lên Vercel |
| `app.js` | Logic: state, đọc, thêm/xóa chương, lưu tiến độ, nạp `data/chapters.json` |
| `data/chapters.json` | Danh sách chương (crawler ghi vào; app đọc từ đây) |
| `data/seed.js` | Chương 868 — dự phòng khi mở bằng `file://` (không fetch được) |
| `crawler/` | Script cào chương từ nhóm Facebook (chạy trên Mac) — xem README riêng |

## Lưu ý

- Cào Facebook là giải pháp **không chính thức và dễ vỡ** (FB đổi giao diện là hỏng) — luôn
  còn nút *Thêm chương* thủ công làm dự phòng. Crawler chỉ chạy khi Mac bật, mỗi ngày 1 lần.
- Dữ liệu đọc (vị trí, đã đọc) lưu trên một máy/trình duyệt; xóa site data sẽ mất tiến độ.
