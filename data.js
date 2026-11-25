// Dữ liệu gốc: bài tập (cho dàn tập đa năng + tại nhà), món ăn Việt, buổi tập mẫu.
// type: 'machine' (có tạ) | 'bw' (tạ cơ thể, có thể thêm tạ) | 'time' (tính giây)
const EXERCISES = [
  // Ngực
  { id: 'chest-press', name: 'Đẩy ngực (chest press)', g: 'Ngực', type: 'machine', min: 8, max: 12, big: 1, cue: 'Ép bả vai về sau, đẩy thẳng, hạ chậm 2–3 giây.' },
  { id: 'pec-fly', name: 'Ép ngực (butterfly)', g: 'Ngực', type: 'machine', min: 10, max: 15, cue: 'Khuỷu hơi gập, ép bằng ngực, không dùng quán tính.' },
  { id: 'pushup', name: 'Hít đất', g: 'Ngực', type: 'bw', min: 8, max: 20, cue: 'Thân thẳng như tấm ván, ngực chạm gần sàn.' },
  // Vai
  { id: 'shoulder-press', name: 'Đẩy vai (shoulder press)', g: 'Vai', type: 'machine', min: 8, max: 12, big: 1, cue: 'Không ưỡn lưng, đẩy lên đến khi tay gần thẳng.' },
  { id: 'lateral-raise', name: 'Nâng vai bên (cáp)', g: 'Vai', type: 'machine', min: 12, max: 20, cue: 'Nhấc khuỷu lên ngang vai, tạ nhẹ, kiểm soát.' },
  { id: 'face-pull', name: 'Face pull (cáp)', g: 'Vai', type: 'machine', min: 12, max: 20, cue: 'Kéo về phía mặt, mở khuỷu, tốt cho vai sau và tư thế.' },
  // Tay sau
  { id: 'pushdown', name: 'Kéo cáp tay sau (pushdown)', g: 'Tay sau', type: 'machine', min: 10, max: 15, cue: 'Cố định khuỷu sát thân, duỗi thẳng tay.' },
  { id: 'dips', name: 'Dips ghế / xà kép', g: 'Tay sau', type: 'bw', min: 6, max: 15, cue: 'Hạ người đến khi khuỷu khoảng 90°, đẩy lên chậm.' },
  // Lưng
  { id: 'lat-pulldown', name: 'Kéo xô (lat pulldown)', g: 'Lưng', type: 'machine', min: 8, max: 12, big: 1, cue: 'Kéo khuỷu xuống túi quần, ưỡn nhẹ ngực.' },
  { id: 'seated-row', name: 'Kéo cáp ngồi (seated row)', g: 'Lưng', type: 'machine', min: 8, max: 12, big: 1, cue: 'Kéo về bụng, siết bả vai 1 giây rồi thả chậm.' },
  { id: 'straight-arm', name: 'Kéo cáp thẳng tay', g: 'Lưng', type: 'machine', min: 12, max: 15, cue: 'Tay gần thẳng, kéo bằng lưng xô.' },
  { id: 'pullup', name: 'Hít xà', g: 'Lưng', type: 'bw', min: 3, max: 10, cue: 'Kéo cằm qua xà, hạ hết tầm, có thể dùng dây hỗ trợ.' },
  // Tay trước
  { id: 'biceps-curl', name: 'Cuốn cáp tay trước', g: 'Tay trước', type: 'machine', min: 10, max: 15, cue: 'Khuỷu sát thân, không đung đưa người.' },
  // Chân
  { id: 'leg-press', name: 'Đạp đùi (leg press)', g: 'Chân', type: 'machine', min: 8, max: 12, big: 1, cue: 'Gối thẳng hàng mũi chân, không khóa gối khi duỗi.' },
  { id: 'leg-ext', name: 'Duỗi đùi trước (leg extension)', g: 'Chân', type: 'machine', min: 10, max: 15, cue: 'Siết đùi trước ở điểm cao nhất 1 giây.' },
  { id: 'leg-curl', name: 'Gập đùi sau (leg curl)', g: 'Chân', type: 'machine', min: 10, max: 15, cue: 'Gập chậm, hạ chậm, hông không nhấc lên.' },
  { id: 'squat-bw', name: 'Squat tạ cơ thể', g: 'Chân', type: 'bw', min: 12, max: 25, cue: 'Hông ra sau, lưng thẳng, gối theo hướng mũi chân.' },
  { id: 'lunge', name: 'Lunge (bước chùng)', g: 'Chân', type: 'bw', min: 8, max: 15, cue: 'Mỗi bên tính một lần, thân thẳng.' },
  { id: 'glute-bridge', name: 'Cầu mông (glute bridge)', g: 'Mông', type: 'bw', min: 10, max: 20, cue: 'Siết mông ở trên cùng, không ưỡn thắt lưng.' },
  { id: 'calf-raise', name: 'Nâng gót chân', g: 'Bắp chân', type: 'bw', min: 12, max: 25, cue: 'Lên hết cỡ, dừng 1 giây, hạ chậm.' },
  // Core
  { id: 'plank', name: 'Plank', g: 'Core', type: 'time', min: 30, max: 90, cue: 'Siết bụng và mông, không võng lưng. Nhập số giây.' },
  { id: 'crunch', name: 'Gập bụng', g: 'Core', type: 'bw', min: 12, max: 25, cue: 'Cuộn thân trên, thở ra khi gập.' },
  { id: 'leg-raise', name: 'Nâng chân (core dưới)', g: 'Core', type: 'bw', min: 8, max: 15, cue: 'Lưng dán sát, hạ chân chậm.' },
];

const DEFAULT_ROUTINES = [
  { id: 'push', name: 'Đẩy', sub: 'Ngực · Vai · Tay sau', main: 1, ex: [
    { id: 'chest-press', sets: 4 }, { id: 'shoulder-press', sets: 3 }, { id: 'pec-fly', sets: 3 },
    { id: 'lateral-raise', sets: 3 }, { id: 'pushdown', sets: 3 } ] },
  { id: 'pull', name: 'Kéo', sub: 'Lưng · Tay trước · Vai sau', main: 1, ex: [
    { id: 'lat-pulldown', sets: 4 }, { id: 'seated-row', sets: 3 }, { id: 'straight-arm', sets: 3 },
    { id: 'face-pull', sets: 3 }, { id: 'biceps-curl', sets: 3 } ] },
  { id: 'legs', name: 'Chân & Core', sub: 'Đùi · Mông · Bụng', main: 1, ex: [
    { id: 'leg-press', sets: 4 }, { id: 'leg-curl', sets: 3 }, { id: 'leg-ext', sets: 3 },
    { id: 'glute-bridge', sets: 3 }, { id: 'calf-raise', sets: 3 }, { id: 'plank', sets: 3 } ] },
  { id: 'full', name: 'Toàn thân nhanh', sub: 'Khoảng 40 phút khi ít thời gian', ex: [
    { id: 'chest-press', sets: 3 }, { id: 'lat-pulldown', sets: 3 }, { id: 'leg-press', sets: 3 },
    { id: 'shoulder-press', sets: 2 }, { id: 'seated-row', sets: 2 }, { id: 'plank', sets: 2 } ] },
];

// k = kcal, p = đạm (g) cho 1 khẩu phần
const FOODS = [
  { n: 'Cơm trắng (1 chén)', g: 150, k: 200, p: 4 },
  { n: 'Ức gà luộc (100g)', g: 100, k: 165, p: 31 },
  { n: 'Trứng gà luộc (1 quả)', g: 50, k: 78, p: 6 },
  { n: 'Phở bò (1 tô)', g: 500, k: 450, p: 25 },
  { n: 'Bún bò Huế (1 tô)', g: 500, k: 500, p: 28 },
  { n: 'Hủ tiếu (1 tô)', g: 450, k: 450, p: 20 },
  { n: 'Bún thịt nướng (1 tô)', g: 400, k: 550, p: 25 },
  { n: 'Cơm tấm sườn (1 dĩa)', g: 450, k: 650, p: 30 },
  { n: 'Bánh mì thịt (1 ổ)', g: 200, k: 400, p: 15 },
  { n: 'Thịt bò nạc (100g)', g: 100, k: 170, p: 26 },
  { n: 'Thịt heo nạc (100g)', g: 100, k: 140, p: 21 },
  { n: 'Cá basa/cá thu (100g)', g: 100, k: 110, p: 18 },
  { n: 'Cá hồi (100g)', g: 100, k: 208, p: 20 },
  { n: 'Tôm (100g)', g: 100, k: 99, p: 24 },
  { n: 'Đậu hũ (100g)', g: 100, k: 76, p: 8 },
  { n: 'Trứng ốp la (1 quả)', g: 55, k: 90, p: 6 },
  { n: 'Sữa tươi không đường (1 hộp)', g: 180, k: 110, p: 6 },
  { n: 'Sữa chua không đường (1 hũ)', g: 100, k: 60, p: 4 },
  { n: 'Whey protein (1 muỗng)', g: 30, k: 120, p: 24 },
  { n: 'Yến mạch (40g)', g: 40, k: 150, p: 5 },
  { n: 'Khoai lang (100g)', g: 100, k: 86, p: 2 },
  { n: 'Bắp luộc (1 trái)', g: 150, k: 120, p: 4 },
  { n: 'Chuối (1 quả)', g: 120, k: 105, p: 1 },
  { n: 'Rau luộc (1 đĩa)', g: 100, k: 40, p: 3 },
  { n: 'Đậu phộng (30g)', g: 30, k: 170, p: 7 },
  { n: 'Cà phê sữa (1 ly)', g: 200, k: 120, p: 2 },
  { n: 'Trà sữa (1 ly)', g: 500, k: 350, p: 3 },
  { n: 'Mì gói (1 gói)', g: 80, k: 380, p: 8 },
  { n: 'Cơm gạo lứt (1 chén)', g: 150, k: 215, p: 5 },
  { n: 'Bún tươi (1 chén)', g: 150, k: 220, p: 4 },
  { n: 'Bánh cuốn (1 dĩa)', g: 200, k: 300, p: 10 },
  { n: 'Gỏi cuốn (2 cuốn)', g: 140, k: 180, p: 10 },
  { n: 'Xôi (1 gói)', g: 150, k: 400, p: 8 },
  { n: 'Cháo gà (1 tô)', g: 400, k: 250, p: 15 },
  { n: 'Canh rau/canh chua (1 chén)', g: 200, k: 50, p: 4 },
  { n: 'Đùi gà nướng/luộc (1 cái)', g: 120, k: 210, p: 22 },
  { n: 'Sườn nướng (1 miếng)', g: 80, k: 250, p: 18 },
  { n: 'Cá ngừ hộp (1 hộp)', g: 140, k: 130, p: 28 },
  { n: 'Trứng cút (5 quả)', g: 50, k: 70, p: 6 },
  { n: 'Đậu hũ chiên (1 miếng)', g: 50, k: 90, p: 6 },
  { n: 'Bông cải xanh (100g)', g: 100, k: 34, p: 3 },
  { n: 'Táo (1 quả)', g: 180, k: 95, p: 0.5 },
  { n: 'Cam (1 quả)', g: 150, k: 62, p: 1 },
  { n: 'Dưa hấu (200g)', g: 200, k: 60, p: 1 },
  { n: 'Bơ (1/2 quả)', g: 100, k: 160, p: 2 },
  { n: 'Hạt điều/hạnh nhân (30g)', g: 30, k: 175, p: 6 },
  { n: 'Sinh tố chuối + sữa (1 ly)', g: 300, k: 250, p: 8 },
  { n: 'Bia (1 lon)', g: 330, k: 150, p: 1 },
  { n: 'Nước ngọt (1 lon)', g: 330, k: 140, p: 0 },
];

// MET cho cardio (ước tính kcal = MET × kg × giờ); chạy bộ tính riêng theo km
const CARDIO_TYPES = [
  { id: 'run', name: 'Chạy bộ', km: 1 },
  { id: 'walk', name: 'Đi bộ nhanh', km: 1, met: 4.3 },
  { id: 'cycle', name: 'Đạp xe', km: 1, met: 7.5 },
  { id: 'rope', name: 'Nhảy dây', met: 11 },
  { id: 'hiit', name: 'HIIT tại nhà', met: 9 },
  { id: 'other', name: 'Khác', met: 6 },
];

const TIPS = {
  'giam-mo': [
    'Thâm hụt vừa phải (300–500 kcal) giữ được cơ tốt hơn nhịn ăn quá mạnh.',
    'Ăn đủ đạm ở mỗi bữa (25–40g) giúp no lâu và giữ cơ khi giảm mỡ.',
    'Đi bộ 7.000–10.000 bước mỗi ngày đốt thêm calo mà không làm mệt buổi tập tạ.',
    'Cân mỗi sáng sau khi đi vệ sinh, nhìn xu hướng cả tuần thay vì từng ngày.',
  ],
  'tang-co': [
    'Tăng tạ hoặc tăng reps đều đặn mỗi tuần là yếu tố quan trọng nhất để lên cơ.',
    'Ngủ 7–9 tiếng: cơ phát triển lúc nghỉ, không phải lúc tập.',
    'Mỗi nhóm cơ nên được tập ít nhất 2 lần mỗi tuần.',
  ],
  recomp: [
    'Tập tạ nặng dần cộng ăn đủ đạm là công thức giảm mỡ và tăng cơ cùng lúc.',
    'Chạy nhẹ 2 buổi mỗi tuần giúp tim mạch tốt mà không ảnh hưởng nhiều tới phục hồi cơ.',
    'Đừng chạy nặng ngay trước buổi tập chân, hãy để cách nhau ít nhất 6 tiếng.',
  ],
};
