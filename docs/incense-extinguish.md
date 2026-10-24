# Dập nhang / thắp lại nhang

Tính năng đã được nối đầy đủ vào dự án, không còn là bản mẫu.

## Quy tắc (được kiểm tra ở phía server)

- Người đã đăng nhập có thể **dập** nén nhang do người khác thắp. Không dập được nhang của chính mình, nhang đã tắt, hoặc nhang đã hết hạn.
- Chỉ **người đã thắp** mới **thắp lại** được. Nhang thắp lại giữ nguyên giờ hết hạn ban đầu (không được cộng thêm thời gian).
- Tài khoản đang bị khóa (`is_banned`) không dập hoặc thắp lại được.
- Mỗi tài khoản dập tối đa 20 nén nhang trong 10 phút.
- Nhang bị dập vẫn nằm trên bàn đến khi hết hạn, kèm tên người đã dập.

## Các phần liên quan

| Phần | File |
| --- | --- |
| Cột và hàm trong database | `supabase/migrations/20261024000100_incense_extinguish.sql` |
| Gọi từ giao diện | `extinguishIncense`, `relightIncense` trong `src/services/incense-service.ts` |
| Danh sách nhang | `listBurningIncense()` trả thêm `is_mine`, `extinguished_at`, `extinguished_by_name` |
| Cập nhật tức thời | `subscribeToIncenseBlessings` nghe thêm sự kiện UPDATE của `incense_offerings` |
| Giao diện | `src/components/incense-view.tsx` |

Mọi lần dập / thắp lại được ghi vào bảng `incense_extinguish_log` (chỉ admin đọc được) để truy vết khi bị lạm dụng.

## Thứ tự triển khai

Chạy file migration trong Supabase **trước**, rồi mới đẩy code lên GitHub. Nếu làm ngược lại, trang sẽ báo lỗi tải bàn hương vì cột `extinguished_at` chưa tồn tại.
