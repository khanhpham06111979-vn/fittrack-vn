/* FitTrack VN — nhật ký tập luyện, chạy bộ, cân nặng, dinh dưỡng. Dữ liệu lưu trên máy (localStorage). */
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };
const round = (n, d = 0) => { const m = 10 ** d; return Math.round(n * m) / m; };
const uid = () => Math.random().toString(36).slice(2, 10);
const DAY = 864e5;
const dk = (t = Date.now()) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const weekStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.getTime(); };
const fmtD = t => { const d = new Date(t); return d.getDate() + '/' + (d.getMonth() + 1); };
const dayLabel = k => k === dk() ? 'Hôm nay' : k === dk(Date.now() - DAY) ? 'Hôm qua' : k.split('-').reverse().join('/');
const nowT = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const dtl = t => dk(t) + 'T' + (n => String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0'))(new Date(t));
const hm = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const hband = h => h >= 5 && h < 11 ? 'Sáng' : h >= 11 && h < 14 ? 'Trưa' : h >= 14 && h < 18 ? 'Chiều' : h >= 18 && h < 22 ? 'Tối' : 'Khuya';
const fmtDur = s => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return m >= 60 ? Math.floor(m / 60) + 'g' + String(m % 60).padStart(2, '0') + 'p' : m + ':' + String(s % 60).padStart(2, '0'); };

/* ---------- Trạng thái ---------- */
const KEY = 'fittrack-vn-v1';
const defaults = () => ({
  profile: { name: '', sex: 'm', age: 30, height: 170, weight: 70, goalWeight: 0, goal: 'recomp', activity: 1.375, weeklyGoal: 3, rest: 90, accent: '#B7E21E', mode: 'auto' },
  remind: { on: false, days: [1, 3, 5], time: '18:00' }, deload: { on: false, start: 0, last: 0, every: 6 }, customFoods: [],
  routines: JSON.parse(JSON.stringify(DEFAULT_ROUTINES)), customEx: [],
  sessions: [], cardio: [], body: [], food: {}, water: {}, active: null, updated: 0, health: { records: [], imaging: [], notes: [], recheck: '' }, reportSeen: '', waterLog: {}, seeded: ['home', 'arms'], equip: { dbOpts: [5, 10, 15], dbBar: 0 },
});
let S = load(); migrate();
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d) { const b = defaults(); return { ...b, ...d, profile: { ...b.profile, ...d.profile }, remind: { ...b.remind, ...d.remind }, deload: { ...b.deload, ...d.deload }, health: { ...b.health, ...d.health }, seeded: d.seeded || [], equip: { ...b.equip, ...d.equip } }; } } catch (e) {}
  return defaults();
}
function migrate() {
  S.seeded = S.seeded || []; let ch = false;
  DEFAULT_ROUTINES.filter(r => r.seed).forEach(r => { if (S.seeded.includes(r.id)) return; if (!S.routines.some(x => x.id === r.id)) S.routines.push(JSON.parse(JSON.stringify(r))); S.seeded.push(r.id); ch = true; });
  if (ch) { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
}
function save() { S.updated = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} schedPush(); }

const allEx = () => [...EXERCISES, ...S.customEx];
const exOf = id => allEx().find(e => e.id === id) || { id, name: id, g: '', type: 'machine', min: 8, max: 12 };

/* ---------- Tính toán ---------- */
function targets() {
  const p = S.profile, w = p.weight || 70;
  const bmr = 10 * w + 6.25 * p.height - 5 * p.age + (p.sex === 'm' ? 5 : -161);
  const tdee = bmr * p.activity;
  const adj = { 'giam-mo': -400, 'tang-co': 250, recomp: -150 }[p.goal] ?? 0;
  const kcal = Math.round(Math.max(bmr, tdee + adj) / 10) * 10;
  const protein = Math.round(w * (p.goal === 'giam-mo' ? 2.2 : 2));
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, protein, water: Math.round(w * 35 / 250) * 250 };
}
const e1rm = (w, r) => w > 0 ? w * (1 + r / 30) : r;
const lastWeight = () => { const b = [...S.body].filter(x => x.weight).sort((a, b) => a.date - b.date); return b.length ? b[b.length - 1].weight : S.profile.weight; };
function lastSessionOf(exId, before = Infinity) {
  for (let i = S.sessions.length - 1; i >= 0; i--) { const s = S.sessions[i]; if (s.date >= before) continue; const e = s.exs.find(x => x.id === exId); if (e && e.sets.length) return e; }
  return null;
}
function cardioKcal(c) {
  const t = CARDIO_TYPES.find(x => x.id === c.type) || CARDIO_TYPES[5], w = lastWeight();
  if (t.id === 'run') return Math.round(w * (c.km || 0) * 1.0);
  return Math.round((t.met || 6) * w * (c.min || 0) / 60);
}
function weekStats(ts = Date.now()) {
  const a = weekStart(ts), b = a + 7 * DAY;
  const ss = S.sessions.filter(s => s.date >= a && s.date < b), cs = S.cardio.filter(c => c.date >= a && c.date < b);
  return { sessions: ss.length, vol: ss.reduce((t, s) => t + s.vol, 0), km: cs.reduce((t, c) => t + (c.km || 0), 0), cardioMin: cs.reduce((t, c) => t + (c.min || 0), 0) };
}
function weekStreak() {
  let n = 0, t = weekStart(Date.now()); const g = S.profile.weeklyGoal;
  if (weekStats(t).sessions >= g) n++;
  for (t -= 7 * DAY; ; t -= 7 * DAY) { if (weekStats(t).sessions >= g) n++; else break; if (n > 520) break; }
  return n;
}
function nextRoutine() {
  const main = S.routines.filter(r => r.main); const pool = main.length ? main : S.routines;
  let best = null, bt = Infinity;
  for (const r of pool) { let last = 0; for (const s of S.sessions) if (s.routineId === r.id) last = Math.max(last, s.date); if (last < bt) { bt = last; best = r; } }
  return best;
}
const ACCENTS = [['#B7E21E', '#101400', 'Xanh chanh'], ['#3B82F6', '#fff', 'Xanh dương'], ['#14B8A6', '#001a17', 'Xanh ngọc'], ['#FF7A1A', '#1a0d00', 'Cam'], ['#EC4899', '#fff', 'Hồng'], ['#8B5CF6', '#fff', 'Tím'], ['#EF4444', '#fff', 'Đỏ']];
function applyTheme() {
  const r = document.documentElement, a = ACCENTS.find(x => x[0] === S.profile.accent) || ACCENTS[0];
  r.style.setProperty('--acc', a[0]); r.style.setProperty('--acc-ink', a[1]);
  if (S.profile.mode === 'auto') r.removeAttribute('data-theme'); else r.dataset.theme = S.profile.mode;
}
function deloadActive() {
  const d = S.deload;
  if (d.on && Date.now() - d.start >= 7 * DAY) { d.on = false; d.last = d.start + 7 * DAY; save(); }
  return d.on;
}
const trainingWeeks = () => new Set(S.sessions.filter(s => s.date > S.deload.last).map(s => weekStart(s.date))).size;
const deloadDue = () => !deloadActive() && trainingWeeks() >= S.deload.every;
const daysSince = ts => ts ? Math.floor((Date.now() - ts) / DAY) : null;
const lastDoneOf = id => S.sessions.reduce((m, s) => s.routineId === id ? Math.max(m, s.date) : m, 0);
const foodOf = k => S.food[k] || [];
const foodTotal = k => foodOf(k).reduce((t, f) => ({ k: t.k + f.k * f.q, p: t.p + f.p * f.q }), { k: 0, p: 0 });

/* ---------- Biểu đồ SVG ---------- */
function lineChart(pts) {
  if (pts.length < 2) return '<div class="empty">Cần ít nhất 2 lần ghi để vẽ biểu đồ.</div>';
  const W = 320, H = 150, L = 30; const ys = pts.map(q => q.y); let mn = Math.min(...ys), mx = Math.max(...ys); if (mn === mx) { mn -= 1; mx += 1; }
  const pad = (mx - mn) * .15; mn -= pad; mx += pad;
  const X = i => L + i * (W - L - 8) / (pts.length - 1), Y = v => H - 22 - (v - mn) / (mx - mn) * (H - 38);
  const d = pts.map((q, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(q.y).toFixed(1)).join(' ');
  const dots = pts.length <= 30 ? pts.map((q, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(q.y).toFixed(1)}" r="2.5" fill="var(--acc)"/>`).join('') : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}"><text x="2" y="14">${round(mx, 1)}</text><text x="2" y="${H - 24}">${round(mn, 1)}</text>
  <path d="${d}" fill="none" stroke="var(--acc)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${dots}
  <text x="${L}" y="${H - 6}">${esc(pts[0].x)}</text><text x="${W - 8}" y="${H - 6}" text-anchor="end">${esc(pts[pts.length - 1].x)}</text></svg>`;
}
function barChart(items, unit = '') {
  const W = 320, H = 140, mx = Math.max(1, ...items.map(i => i.v)), bw = (W - 10) / items.length;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${items.map((it, i) => {
    const h = it.v / mx * (H - 40), x = 5 + i * bw;
    return `<rect x="${(x + 4).toFixed(1)}" y="${(H - 22 - h).toFixed(1)}" width="${(bw - 8).toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" rx="4" fill="${it.cur ? 'var(--acc)' : 'var(--line)'}"/>
    <text x="${(x + bw / 2).toFixed(1)}" y="${(H - 24 - h).toFixed(1)}" text-anchor="middle">${it.v ? round(it.v, it.v < 10 ? 1 : 0) + unit : ''}</text>
    <text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(it.label)}</text>`;
  }).join('')}</svg>`;
}
const weeksBack = n => { const base = weekStart(Date.now()); return Array.from({ length: n }, (_, i) => base - (n - 1 - i) * 7 * DAY); };

/* ---------- Giao diện chung ---------- */
let foodCat = '', foodDay = dk(), cardioTab = 'all', progEx = '', foodQ = '', pickCb = null, pickQ = '';
const toast = (m) => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2200); };
const modal = html => { const m = $('#modal'); m.innerHTML = `<div class="sheet">${html}</div>`; m.hidden = false; };
const closeModal = () => { $('#modal').hidden = true; $('#modal').innerHTML = ''; };
const head = (t, back) => `<div class="head">${back ? `<a class="back" href="${back}">‹</a>` : ''}<h1>${t}</h1></div>`;
const NAV = [['#/', 'Home', '🏠', 'Trang chủ'], ['#/train', 'train', '🏋️', 'Tập'], ['#/food', 'food', '🍚', 'Ăn uống'], ['#/progress', 'progress', '📈', 'Tiến độ'], ['#/profile', 'profile', '👤', 'Hồ sơ']];
function drawNav(route) {
  const key = route.split('/')[1] || 'Home';
  const map = { workout: 'train', routine: 'train', cardio: 'train', exercises: 'train', body: 'progress', health: 'profile', report: 'progress' };
  const cur = map[key] || key;
  $('#nav').innerHTML = NAV.map(([h, k, ic, lb]) => `<a href="${h}" class="${cur === k ? 'on' : ''}"><span class="ic">${ic}</span>${lb}</a>`).join('');
}

/* ---------- Trang chủ ---------- */
function vHome() {
  const p = S.profile, w = weekStats(), nx = nextRoutine(), t = targets(), ft = foodTotal(dk());
  const hr = new Date().getHours(), hi = hr < 11 ? 'Chào buổi sáng' : hr < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const dots = Array.from({ length: Math.max(p.weeklyGoal, w.sessions) }, (_, i) => `<i class="${i < w.sessions ? 'on' : ''}"></i>`).join('');
  const lw = [...S.body].filter(b => b.weight).sort((a, b) => a.date - b.date), cur = lw.length ? lw[lw.length - 1].weight : null;
  const old = lw.filter(b => b.date <= Date.now() - 28 * DAY).pop(), diff = cur && old ? round(cur - old.weight, 1) : null;
  const tips = TIPS[p.goal] || TIPS.recomp, tip = tips[Math.floor(Date.now() / DAY) % tips.length];
  let top = '';
  if (deloadActive()) top += `<div class="banner"><b>🌿 Đang trong tuần nhẹ</b><div class="sub">Còn ${Math.max(1, Math.ceil((S.deload.start + 7 * DAY - Date.now()) / DAY))} ngày. Tạ nhẹ hơn, tập vừa sức để cơ và khớp phục hồi.</div></div>`;
  else if (deloadDue()) top += `<div class="warn"><b>Đã tập liên tục ${trainingWeeks()} tuần</b><div class="sub">Nên có một tuần nhẹ (giảm ~10% tạ, bớt 1 set) để phục hồi và tiếp tục tiến bộ.</div><a class="btn sm mt" href="#/profile">Xem tuần nhẹ</a></div>`;
  const R = S.remind, td = new Date(), sinceLast = daysSince(S.sessions.length ? S.sessions[S.sessions.length - 1].date : 0);
  const trainedToday = S.sessions.some(s => dk(s.date) === dk());
  if (R.on && R.days.includes(td.getDay()) && !trainedToday && !S.active) top += `<div class="warn">⏰ Hôm nay là ngày tập dự kiến (${esc(R.time)}).</div>`;
  else if (S.sessions.length && sinceLast >= 4 && !S.active) top += `<div class="warn">Đã ${sinceLast} ngày chưa tập tạ. Một buổi ngắn 'Toàn thân nhanh' cũng đủ giữ nhịp.</div>`;
  if (S.active) top += `<div class="banner"><b>Đang tập: ${esc(S.active.name)}</b><div class="sub">Bạn có buổi tập chưa hoàn thành.</div><a class="btn pri sm mt" href="#/workout">Tiếp tục</a></div>`;
  else if (nx) {
    const ds = daysSince(lastDoneOf(nx.id));
    top += `<div class="card hero"><div class="sub">Gợi ý cho hôm nay</div><h3>${esc(nx.name)}</h3><div class="sub">${esc(nx.sub || '')} · ${nx.ex.length} bài · ${ds === null ? 'chưa tập lần nào' : ds === 0 ? 'đã tập hôm nay' : 'lần cuối ' + ds + ' ngày trước'}</div>
    <div class="row mt"><button class="btn" data-a="start" data-id="${nx.id}">Bắt đầu</button><a class="btn" href="#/train" style="background:transparent;color:var(--acc-ink);border:1px solid var(--acc-ink)">Chọn buổi khác</a></div></div>`;
  }
  return `<div class="sub">${hi}${p.name ? ', ' + esc(p.name) : ''}</div><h1>Hôm nay</h1>${top}
  ${reportBanner()}${healthCard()}${todayCard()}
  <h2>Tuần này</h2><div class="card"><div class="row"><div class="dots">${dots}</div><span class="sp"></span><b>${w.sessions}/${p.weeklyGoal} buổi tạ</b></div>
  <div class="sub mt">Chạy/cardio: ${round(w.km, 1)} km · ${Math.round(w.cardioMin)} phút · Chuỗi tuần đạt mục tiêu: ${weekStreak()} 🔥</div></div>
  <h2>Dinh dưỡng hôm nay</h2><a class="card" href="#/food" style="display:block"><div class="row"><b>${Math.round(ft.k)}</b><span class="sub">/ ${t.kcal} kcal</span><span class="sp"></span><b>${Math.round(ft.p)}</b><span class="sub">/ ${t.protein}g đạm</span></div>
  <div class="bar"><i class="${ft.k > t.kcal * 1.1 ? 'over' : ''}" style="width:${Math.min(100, ft.k / t.kcal * 100)}%"></i></div><div class="bar"><i style="width:${Math.min(100, ft.p / t.protein * 100)}%"></i></div></a>
  <div class="grid2"><a class="stat" href="#/body"><b>${cur ? cur + ' kg' : '—'}</b><span>Cân nặng${diff !== null ? ' · ' + (diff > 0 ? '+' : '') + diff + ' kg/4 tuần' : ''}</span></a>
  <a class="stat" href="#/cardio"><b>+ Cardio</b><span>Ghi buổi chạy</span></a></div>
  <div class="card mt"><div class="sub">💡 Gợi ý</div>${esc(tip)}</div>`;
}

function todayCard() {
  const k = dk(), ss = S.sessions.filter(x => dk(x.date) === k), cs = S.cardio.filter(x => dk(x.date) === k), fs = foodOf(k), wt = S.water[k] || 0, bd = S.body.filter(x => dk(x.date) === k);
  const ft = foodTotal(k), tm = t => { const n = new Date(t); return String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0'); };
  const row = (ok, label, detail) => `<div class="item" style="padding:9px 0"><span style="font-size:18px">${ok ? '✅' : '⬜'}</span><div class="sp"><b>${label}</b>${detail ? `<div class="sub">${detail}</div>` : ''}</div></div>`;
  const sorted = [...fs].sort((a, b) => (a.t || '99').localeCompare(b.t || '99'));
  const meals = sorted.slice(0, 4).map(f => `${f.t ? f.t + ' ' : ''}${esc(f.n.replace(/ \(.*/, ''))}`).join(' · ') + (sorted.length > 4 ? ` · +${sorted.length - 4} món` : '');
  return `<h2>Hôm nay đã ghi nhận</h2><div class="card" style="padding:6px 16px">
  ${row(ss.length, 'Tập tạ', ss.map(x => `${esc(x.name)} lúc ${tm(x.date)} · ${Math.round(x.dur / 60)} phút · ${Math.round(x.vol)} kg tổng tạ`).join('<br>') || 'Chưa có buổi nào hôm nay')}
  ${row(fs.length, 'Ăn uống', fs.length ? `${fs.length} món · ${Math.round(ft.k)} kcal · ${Math.round(ft.p)}g đạm<br>${meals}` : 'Chưa ghi món nào')}
  ${row(wt > 0, 'Nước uống', wt ? wt + ' ml' : 'Chưa ghi')}
  ${row(cs.length, 'Cardio', cs.map(x => (x.km ? round(x.km, 1) + ' km · ' : '') + x.min + ' phút').join(', ') || 'Chưa ghi')}
  ${row(bd.length, 'Cân nặng', bd.length ? bd.map(x => x.weight ? x.weight + ' kg' : 'đã đo').join(', ') : 'Chưa cân hôm nay')}
  ${SY.token ? `<div class="sub" style="padding:8px 0">☁️ Đồng bộ GitHub: ${esc(SY.last ? 'lần cuối ' + new Date(SY.last).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'chưa đồng bộ')}</div>` : ''}</div>`;
}

/* ---------- Tập luyện ---------- */
function vTrain() {
  const rs = S.routines.map(r => {
    const ds = daysSince(lastDoneOf(r.id));
    return `<div class="card"><div class="row"><div class="sp"><h3>${esc(r.name)}</h3><div class="sub">${esc(r.sub || '')} · ${r.ex.length} bài${ds === null ? '' : ' · ' + (ds === 0 ? 'hôm nay' : ds + ' ngày trước')}</div></div>
    <a class="btn sm" href="#/routine/${r.id}">Sửa</a><button class="btn pri sm" data-a="start" data-id="${r.id}">Tập</button></div></div>`;
  }).join('');
  const hist = [...S.sessions].reverse().slice(0, 8).map(s => `<div class="item"><div class="sp"><b>${esc(s.name)}</b><div class="sub">${fmtD(s.date)} ${new Date(s.date).toTimeString().slice(0, 5)} · ${Math.round(s.dur / 60)} phút · ${Math.round(s.vol)} kg tổng tạ${s.feel ? ' · ' + ['😫', '😐', '🙂', '💪'][s.feel - 1] : ''}</div>${s.note ? `<div class="sub">📝 ${esc(s.note)}</div>` : ''}<input type="datetime-local" class="tin" data-in="stime" data-id="${s.id}" value="${dtl(s.date)}" max="${dtl(Date.now())}" aria-label="Giờ bắt đầu"></div><button class="x" data-a="delSession" data-id="${s.id}" aria-label="Xoá">✕</button></div>`).join('');
  return `${head('Tập luyện')}${S.active ? `<div class="banner row"><span class="sp"><b>Đang tập: ${esc(S.active.name)}</b></span><a class="btn pri sm" href="#/workout">Tiếp tục</a></div>` : ''}
  <div class="sub">Tập lúc nào rảnh cũng được: app gợi ý buổi kế tiếp theo vòng Đẩy → Kéo → Chân.</div>${rs}
  <a class="btn block mt" href="#/routine/new">+ Tạo buổi tập mới</a>
  <div class="grid2 mt"><a class="btn" href="#/cardio">🏃 Cardio / chạy bộ</a><a class="btn" href="#/exercises">📚 Thư viện bài</a></div>
  <h2>Lịch sử gần đây</h2><div class="card">${hist || '<div class="empty">Chưa có buổi tập nào.</div>'}</div>`;
}

function startRoutine(id) {
  if (S.active && !confirm('Bạn đang có một buổi tập chưa xong. Bỏ buổi đó và bắt đầu buổi mới?')) { location.hash = '#/workout'; return; }
  const r = S.routines.find(x => x.id === id); if (!r) return;
  S.active = { routineId: r.id, name: r.name, start: Date.now(), exs: r.ex.map(e => buildEx(e.id, e.sets)) };
  save(); location.hash = '#/workout';
}
const dbTotals = () => [...new Set((S.equip.dbOpts || [5]).map(Number).filter(x => x > 0))].sort((a, b) => a - b).map(o => round(o + (S.equip.dbBar || 0), 2));
const snapDb = plates => { const t = dbTotals(), target = plates + (S.equip.dbBar || 0); return t.reduce((b, x) => Math.abs(x - target) < Math.abs(b - target) ? x : b, t[0]); };
function buildEx(id, n = 3) {
  const ex = exOf(id), last = lastSessionOf(id); let sets;
  if (last) sets = last.sets.map(s => ({ w: s.w, r: s.r, done: false }));
  else sets = Array.from({ length: n }, () => ({ w: ex.type === 'db' ? snapDb(ex.w0 || 5) : ex.w0 || 0, r: ex.min, done: false }));
  while (sets.length < n) sets.push({ ...sets[sets.length - 1], done: false });
  sets = sets.slice(0, Math.max(n, 1));
  // Gợi ý tăng tạ nếu lần trước đạt hết mức reps cao nhất
  let hint = '';
  if (deloadActive()) {
    if (ex.type === 'machine') sets.forEach(s => s.w = Math.round(s.w * 0.9 * 2) / 2);
    else if (ex.type === 'db') sets.forEach(s => { const lo = dbTotals().filter(x => x < s.w - 0.01); if (lo.length) s.w = lo[lo.length - 1]; });
    sets = sets.slice(0, Math.max(2, n - 1)); sets.forEach(s => s.r = Math.min(s.r, ex.max));
    hint = 'Tuần nhẹ: tạ giảm ~10%, bớt 1 set, dừng cách giới hạn 3–4 reps.';
  } else if (last && ex.type !== 'time' && last.sets.every(s => s.r >= ex.max)) {
    if (ex.fixed) hint = `Lần trước đạt ${ex.max} reps: tăng độ khó bằng nhịp chậm hơn, giữ 1–2 giây ở điểm ép tối đa, hoặc thêm một set.`;
    else if (ex.type === 'db') { const cur = Math.max(...sets.map(s => s.w)), nxt = dbTotals().find(t => t > cur + 0.01); if (nxt) { sets.forEach(s => { s.w = nxt; s.r = ex.min; }); hint = `Lần trước đạt ${ex.max} reps ở mọi set: thử tạ ${nxt} kg (mức tạ kế tiếp của bạn).`; } else hint = 'Đã ở mức tạ lớn nhất của bạn: tăng nhịp chậm, giữ 1–2 giây ở điểm siết hoặc thêm set.'; }
    else if (ex.type === 'machine') { const inc = 2.5; sets.forEach(s => { s.w = round(s.w + inc, 1); s.r = ex.min; }); hint = `Lần trước đạt ${ex.max} reps ở mọi set: thử tăng lên ${sets[0].w} kg.`; }
    else hint = `Lần trước đạt ${ex.max} reps: thử thêm tạ hoặc chọn biến thể khó hơn.`;
  }
  return { id, sets, hint };
}
function vWorkout() {
  const a = S.active; if (!a) { location.hash = '#/'; return ''; }
  const pn = [...S.sessions].reverse().find(x => x.routineId === a.routineId && x.note), prevNote = pn ? `<div class="hint">📝 Ghi chú lần trước (${fmtD(pn.date)}): ${esc(pn.note)}</div>` : '';
  const cards = a.exs.map((e, i) => {
    const ex = exOf(e.id), last = lastSessionOf(e.id), tm = ex.type === 'time';
    const lastTxt = last ? last.sets.map(s => tm ? s.r + 's' : (s.w ? s.w + '×' : '') + s.r).join(' · ') : 'chưa có dữ liệu';
    return `<div class="card"><div class="row"><div class="sp"><h3>${esc(ex.name)}</h3><div class="sub">${esc(ex.g)} · mục tiêu ${ex.min}–${ex.max}${tm ? ' giây' : ' reps'}</div></div><button class="x" data-a="rmEx" data-i="${i}" aria-label="Bỏ bài">🗑</button></div>
    <div class="sub mt">Lần trước: ${esc(lastTxt)}</div>${e.hint ? `<div class="hint">⬆ ${esc(e.hint)}</div>` : ''}
    <details><summary class="sub" style="cursor:pointer">Cách tập</summary>${ex.img ? `<img src="${ex.img}" alt="${esc(ex.name)}" style="width:100%;max-width:240px;border-radius:12px;margin:8px 0;display:block" loading="lazy">` : ''}<div class="sub">${esc(ex.cue || '')}</div></details>
    <div class="setrow ${tm ? 'time' : ''} sub"><span></span>${tm ? '' : '<span>kg</span>'}<span>${tm ? 'giây' : 'reps'}</span><span></span><span></span></div>
    ${e.sets.map((s, j) => `<div class="setrow ${tm ? 'time' : ''}"><span class="n">${j + 1}</span>
      ${tm ? '' : `<input inputmode="decimal" data-in="ws" data-i="${i}" data-j="${j}" data-f="w" value="${s.w || ''}" placeholder="0">`}
      <input inputmode="numeric" data-in="ws" data-i="${i}" data-j="${j}" data-f="r" value="${s.r || ''}" placeholder="0">
      <button class="chk ${s.done ? 'on' : ''}" data-a="chk" data-i="${i}" data-j="${j}" aria-label="Xong set">✓</button><button class="x" data-a="rmSet" data-i="${i}" data-j="${j}" aria-label="Xoá set">−</button></div>`).join('')}
    <button class="btn sm ghost" data-a="addSet" data-i="${i}">+ Thêm set</button>${ex.type === 'db' ? `<div class="sub" style="margin-top:6px">Chọn nhanh tạ mỗi quả: ${dbTotals().map(t => `<button class="btn sm" style="margin:2px 2px 0 0" data-a="dbw" data-i="${i}" data-v="${t}">${t} kg</button>`).join('')}</div>` : ''}</div>`;
  }).join('');
  return `<div class="row">${head(esc(a.name))}<span class="sp"></span><b id="elapsed" class="sub">${fmtDur((Date.now() - a.start) / 1000)}</b></div>
  <div class="row"><span class="sub">Giờ bắt đầu</span><input type="datetime-local" data-in="wstart" value="${dtl(a.start)}" max="${dtl(Date.now())}" style="width:auto;flex:1"></div>
  ${prevNote}${healthHint()}<div class="sub">Khởi động 5 phút (xoay khớp, set nhẹ đầu tiên) trước khi vào tạ nặng.</div>${cards}
  <button class="btn block" data-a="addEx">+ Thêm bài</button>
  <div class="card"><label>Cảm giác buổi tập</label><div class="days">${[['😫', 'Mệt'], ['😐', 'Bình thường'], ['🙂', 'Tốt'], ['💪', 'Rất tốt']].map((m, i) => `<button class="btn ${a.feel === i + 1 ? 'on' : ''}" data-a="feel" data-v="${i + 1}" aria-label="${m[1]}">${m[0]}</button>`).join('')}</div>
  <label>Ghi chú (đau mỏi, tạ cảm thấy nặng/nhẹ, bài cần đổi...)</label><textarea data-in="note" rows="3" placeholder="Ghi chú cho buổi này">${esc(a.note || '')}</textarea></div>
  <button class="btn pri block mt" data-a="finish">Hoàn thành buổi tập</button>
  <button class="btn ghost block danger" data-a="cancel">Huỷ buổi tập</button>`;
}
function finishWorkout() {
  const a = S.active, exs = a.exs.map(e => ({ id: e.id, sets: e.sets.filter(s => s.done).map(s => ({ w: num(s.w), r: num(s.r) })) })).filter(e => e.sets.length);
  if (!exs.length) { if (confirm('Chưa có set nào được đánh dấu xong. Huỷ buổi tập này?')) { S.active = null; save(); stopRest(); location.hash = '#/'; } return; }
  let dur = (Date.now() - a.start) / 1000;
  if (dur > 4 * 3600) { const m = prompt('Buổi tập kéo dài bao nhiêu phút? (bạn đã đặt giờ bắt đầu từ sớm)', '60'); dur = (num(m) || 60) * 60; }
  const date = a.start, prs = [];
  exs.forEach(e => {
    const ex = exOf(e.id); const prev = S.sessions.flatMap(s => s.exs.filter(x => x.id === e.id).flatMap(x => x.sets));
    if (!prev.length) return;
    const best = Math.max(...prev.map(s => ex.type === 'time' ? s.r : e1rm(s.w, s.r))), now = Math.max(...e.sets.map(s => ex.type === 'time' ? s.r : e1rm(s.w, s.r)));
    if (now > best + 0.01) prs.push(ex.name);
  });
  const vol = exs.reduce((t, e) => t + e.sets.reduce((u, s) => u + s.w * s.r, 0), 0);
  const s = { id: uid(), date, routineId: a.routineId, name: a.name, dur, exs, vol, note: (a.note || '').trim(), feel: a.feel || 0 };
  S.sessions.push(s); S.active = null; save(); stopRest();
  const sets = exs.reduce((t, e) => t + e.sets.length, 0), kcal = Math.round(s.dur / 60 * 5.5);
  modal(`<h1>Hoàn thành! 🎉</h1><div class="grid2 mt"><div class="stat"><b>${Math.round(s.dur / 60)}′</b><span>Thời gian</span></div><div class="stat"><b>${sets}</b><span>Số set</span></div><div class="stat"><b>${Math.round(vol)}</b><span>Tổng tạ (kg)</span></div><div class="stat"><b>~${kcal}</b><span>kcal ước tính</span></div></div>
  ${prs.length ? `<div class="banner mt">🏆 Kỷ lục mới: ${prs.map(esc).join(', ')}</div>` : ''}
  <div class="sub mt">Nhớ ăn đủ đạm trong 1–2 giờ tới và uống nước.</div><button class="btn pri block mt" data-a="closeDone">Xong</button>`);
}

/* ---------- Đồng hồ nghỉ ---------- */
let rest = null, actx = null;
function beep() {
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const o = actx.createOscillator(), g = actx.createGain(); o.connect(g); g.connect(actx.destination); o.frequency.value = 880; g.gain.setValueAtTime(.2, actx.currentTime); g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + .6); o.start(); o.stop(actx.currentTime + .6); } catch (e) {}
  try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {}
}
function startRest(sec) { rest = { end: Date.now() + sec * 1000 }; try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} tickRest(); }
function stopRest() { rest = null; $('#restbar').hidden = true; }
function tickRest() {
  const bar = $('#restbar');
  if (!rest) { bar.hidden = true; return; }
  const left = Math.ceil((rest.end - Date.now()) / 1000);
  if (left <= 0) { beep(); toast('Hết giờ nghỉ, vào set tiếp theo!'); stopRest(); return; }
  bar.hidden = false;
  bar.innerHTML = `<span>Nghỉ</span><b>${fmtDur(left)}</b><span class="sp"></span><button class="btn sm" data-a="restAdd">+15s</button><button class="btn sm" data-a="restStop">Bỏ qua</button>`;
}
setInterval(() => { tickRest(); const el = $('#elapsed'); if (el && S.active) el.textContent = fmtDur((Date.now() - S.active.start) / 1000); }, 500);

/* ---------- Chỉnh buổi tập ---------- */
function vRoutine(id) {
  let r = S.routines.find(x => x.id === id);
  if (id === 'new') { r = { id: uid(), name: 'Buổi tập mới', sub: '', ex: [] }; S.routines.push(r); save(); location.replace('#/routine/' + r.id); return ''; }
  if (!r) { location.hash = '#/train'; return ''; }
  return `${head('Sửa buổi tập', '#/train')}<div class="card"><label>Tên</label><input data-in="rt" data-f="name" value="${esc(r.name)}"><label>Mô tả ngắn</label><input data-in="rt" data-f="sub" value="${esc(r.sub || '')}"></div>
  <h2>Các bài</h2>${r.ex.map((e, i) => `<div class="card row"><div class="sp"><b>${esc(exOf(e.id).name)}</b><div class="sub">${esc(exOf(e.id).g)}</div></div>
  <button class="btn sm" data-a="setsDec" data-i="${i}">−</button><b>${e.sets} set</b><button class="btn sm" data-a="setsInc" data-i="${i}">+</button>
  <button class="x" data-a="rtUp" data-i="${i}" aria-label="Lên">↑</button><button class="x" data-a="rtRm" data-i="${i}" aria-label="Xoá">✕</button></div>`).join('') || '<div class="empty">Chưa có bài nào.</div>'}
  <button class="btn block" data-a="rtAdd">+ Thêm bài</button><button class="btn block danger mt" data-a="rtDel">Xoá buổi tập này</button>`;
}
function openPicker(cb) { pickCb = cb; pickQ = ''; drawPicker(); }
function drawPicker() {
  const q = fold(pickQ), list = allEx().filter(e => !q || fold(e.name + e.g).includes(q));
  modal(`<div class="row"><h3 class="sp">Chọn bài tập</h3><button class="btn sm" data-a="closeModal">Đóng</button></div><input id="pq" class="mt" placeholder="Tìm bài hoặc nhóm cơ..." value="${esc(pickQ)}" data-in="pq">
  <div id="plist">${pickList(list)}</div>`);
}
const pickList = list => list.map(e => `<div class="item" data-a="pick" data-id="${e.id}" style="cursor:pointer"><div class="sp"><b>${esc(e.name)}</b><div class="sub">${esc(e.g)}</div></div><span class="chip">+</span></div>`).join('') || '<div class="empty">Không tìm thấy.</div>';

/* ---------- Theo dõi GPS, nhập GPX/TCX ---------- */
const TKEY = 'fittrack-track-v1', TLIM = { run: { acc: 30, vmax: 7.5, min: 3 }, walk: { acc: 30, vmax: 3.5, min: 3 }, cycle: { acc: 40, vmax: 18, min: 5 } };
const hav = (a, b) => { const R = 6371000, r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lon - a.lon), x = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const fmtPace = m => { if (!isFinite(m) || m <= 0) return '--:--'; let mi = Math.floor(m), sc = Math.round((m - mi) * 60); if (sc === 60) { mi++; sc = 0; } return mi + ':' + String(sc).padStart(2, '0'); };
const strideOf = type => (S.profile.height || 170) / 100 * (type === 'walk' ? 0.415 : type === 'run' ? 0.65 : 0);
const stepsOf = c => c.steps || (c.km && strideOf(c.type) ? Math.round(c.km * 1000 / strideOf(c.type)) : 0);
let TR = null, trWatch = null, wl = null, trSaveAt = 0, dimOn = false, lastTouch = Date.now(), holdT = null, IMP = [];
const autoDim = () => { try { return localStorage.getItem('fittrack-dim') !== '0'; } catch (e) { return true; } };
(function trkLoad() { try { const d = JSON.parse(localStorage.getItem(TKEY)); if (d && d.points && d.start) { TR = d; if (TR.status === 'tracking') TR.status = 'recovered'; } } catch (e) {} })();
function trkSave(force) { if (!TR) return; const n = Date.now(); if (!force && n - trSaveAt < 5000) return; trSaveAt = n; TR.seen = n; try { localStorage.setItem(TKEY, JSON.stringify(TR)); } catch (e) {} }
const trkClear = () => { TR = null; try { localStorage.removeItem(TKEY); } catch (e) {} };
const trkElapsed = () => { const end = TR.status === 'tracking' ? Date.now() : TR.status === 'paused' ? TR.pauseStart : (TR.seen || Date.now()); return Math.max(0, (end - TR.start - (TR.pausedMs || 0)) / 1000); };
function trkStats() {
  const km = TR.dist / 1000, el = trkElapsed(), pace = km > 0.02 ? el / 60 / km : 0; let now = 0; const P = TR.points;
  if (P.length > 1) { const last = P[P.length - 1]; let j = P.length - 1, d = 0; while (j > 0 && last.t - P[j - 1].t <= 30000) j--; for (let i = j + 1; i < P.length; i++) if (!P[i].g) d += hav(P[i - 1], P[i]); const dt = (last.t - P[j].t) / 1000; if (d >= 15 && dt >= 10) now = dt / 60 / (d / 1000); }
  const sl = strideOf(TR.type); return { km, el, pace, now, spd: el > 0 ? km / (el / 3600) : 0, kcal: cardioKcal({ type: TR.type, km, min: el / 60 }), steps: sl ? Math.round(TR.dist / sl) : 0 };
}
function onPos(pos) {
  if (!TR || TR.status !== 'tracking') return; const c = pos.coords, lim = TLIM[TR.type] || TLIM.run; TR.acc = c.accuracy;
  if (c.accuracy > lim.acc) return;
  const p = { t: pos.timestamp, lat: +c.latitude.toFixed(6), lon: +c.longitude.toFixed(6) }, last = TR.points[TR.points.length - 1];
  if (!last || TR.gap) { if (last && TR.gap) p.g = 1; TR.gap = false; TR.points.push(p); trkSave(); return; }
  const d = hav(last, p), dt = (p.t - last.t) / 1000; if (dt <= 0 || d < Math.max(lim.min, c.accuracy * 0.3) || d / dt > lim.vmax) return;
  if (dt > 30) TR.interrupted = true; TR.dist += d; TR.points.push(p); trkSave();
}
function onGeoErr(e) { if (e.code === 1) { toast('Bạn chưa cho phép truy cập vị trí. Hãy bật quyền Vị trí cho trang này.'); stopWatch(); wlOff(); trkClear(); rerender(); } else if (TR) TR.acc = 0; }
function trkWatch() { stopWatch(); trWatch = navigator.geolocation.watchPosition(onPos, onGeoErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }); }
function stopWatch() { if (trWatch !== null) { try { navigator.geolocation.clearWatch(trWatch); } catch (e) {} trWatch = null; } }
async function wlOn() { try { if ('wakeLock' in navigator && !wl) { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); } } catch (e) { wl = null; } }
async function wlOff() { try { if (wl) await wl.release(); } catch (e) {} wl = null; }
document.addEventListener('visibilitychange', () => { if (!document.hidden && TR && TR.status === 'tracking') wlOn(); });
function showDim() { if (dimOn) return; dimOn = true; const d = $('#dim'); d.hidden = false; d.innerHTML = '<div id="dim-main"></div><button id="dim-hold" type="button"><i></i><span>Giữ 1,5 giây để mở khoá</span></button>'; dimTick(); }
function hideDim() { dimOn = false; const d = $('#dim'); d.hidden = true; d.innerHTML = ''; lastTouch = Date.now(); }
function dimTick() { const m = $('#dim-main'); if (!m || !TR) return; const s = trkStats(); m.innerHTML = `<b>${s.km.toFixed(2)} km</b><span>${fmtDur(s.el)} · ${fmtPace(s.pace)}/km</span>`; }
document.addEventListener('pointerdown', e => { lastTouch = Date.now(); const h = e.target.closest && e.target.closest('#dim-hold'); if (h) { h.classList.add('holding'); clearTimeout(holdT); holdT = setTimeout(hideDim, 1500); } }, true);
['pointerup', 'pointercancel'].forEach(ev => document.addEventListener(ev, () => { clearTimeout(holdT); const h = $('#dim-hold'); if (h) h.classList.remove('holding'); }, true));
document.addEventListener('touchmove', e => { if (dimOn) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', e => { if (dimOn) e.preventDefault(); });
function trkTick() {
  const bar = $('#trkbar'); if (!TR) { bar.hidden = true; return; }
  const s = trkStats(), set = (id, v) => { const e = $('#' + id); if (e) e.textContent = v; };
  set('t-time', fmtDur(s.el)); set('t-dist', s.km.toFixed(2)); set('t-pace', fmtPace(s.pace)); set('t-now', fmtPace(s.now)); set('t-spd', round(s.spd, 1)); set('t-kcal', Math.round(s.kcal)); set('t-steps', s.steps ? s.steps.toLocaleString('vi-VN') : '–');
  const g = $('#t-gps'); if (g) g.textContent = TR.status === 'paused' ? '⏸ Đang tạm dừng' : !TR.points.length ? '📡 Đang tìm tín hiệu GPS, hãy ra chỗ thoáng...' : TR.acc ? (TR.acc <= 20 ? '🟢' : '🟠') + ' GPS ±' + Math.round(TR.acc) + ' m' : '';
  const w = $('#t-warn'); if (w) w.hidden = !TR.interrupted;
  if (dimOn) dimTick();
  const show = !location.hash.startsWith('#/cardio') && !dimOn; if (show && bar.hidden) bar.innerHTML = '<span id="trkbar-t"></span><a class="btn sm" href="#/cardio">Mở</a>'; bar.hidden = !show;
  if (show) { const t = $('#trkbar-t'); if (t) t.textContent = TR.status === 'recovered' ? '⚠ Buổi theo dõi dở dang' : (TR.status === 'paused' ? '⏸ ' : '📍 ') + s.km.toFixed(2) + ' km · ' + fmtDur(s.el); }
  if (TR.status === 'tracking' && autoDim() && !dimOn && document.visibilityState === 'visible' && Date.now() - lastTouch > 20000) showDim();
}
setInterval(trkTick, 1000);
function routeOf(P) {
  if (!P.length) return []; let tot = 0; for (let i = 1; i < P.length; i++) if (!P[i].g) tot += hav(P[i - 1], P[i]);
  const step = Math.max(5, tot / 250), out = [[P[0].lat, P[0].lon]]; let acc = 0;
  for (let i = 1; i < P.length; i++) { const g = P[i].g; acc += g ? 0 : hav(P[i - 1], P[i]); if (g || acc >= step || i === P.length - 1) { out.push(g ? [P[i].lat, P[i].lon, 1] : [P[i].lat, P[i].lon]); acc = 0; } }
  return out;
}
function routeSvg(R) {
  if (R.length < 2) return ''; const la = R.map(p => p[0]), lo = R.map(p => p[1]), a0 = Math.min(...la), a1 = Math.max(...la), o0 = Math.min(...lo), o1 = Math.max(...lo), k = Math.cos((a0 + a1) / 2 * Math.PI / 180), W = 300, pad = 16;
  const w = Math.max((o1 - o0) * k, 1e-6), h = Math.max(a1 - a0, 1e-6), sc = Math.min((W - 2 * pad) / w, (W - 2 * pad) / h), ox = (W - w * sc) / 2, oy = (W - h * sc) / 2, X = x => ox + (x - o0) * k * sc, Y = y => W - (oy + (y - a0) * sc);
  let d = ''; R.forEach((p, i) => { d += (i === 0 || p[2] ? 'M' : 'L') + X(p[1]).toFixed(1) + ' ' + Y(p[0]).toFixed(1) + ' '; }); const a = R[0], z = R[R.length - 1];
  return `<svg viewBox="0 0 300 300" style="width:100%;background:var(--bg);border-radius:14px"><path d="${d}" fill="none" stroke="var(--acc)" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${X(a[1]).toFixed(1)}" cy="${Y(a[0]).toFixed(1)}" r="6" fill="#2FA84F"/><circle cx="${X(z[1]).toFixed(1)}" cy="${Y(z[0]).toFixed(1)}" r="6" fill="#E5484D"/></svg>`;
}
function trkPanel() {
  const types = [['run', '🏃 Chạy bộ'], ['walk', '🚶 Đi bộ nhanh'], ['cycle', '🚴 Đạp xe']];
  if (!TR) return `<div class="card"><b>📍 Theo dõi GPS</b><div class="sub">Đo km, pace, kcal và bước chân ước tính. Mở app, app sẽ giữ màn hình sáng và tự làm tối để chống chạm nhầm.</div><label>Loại</label><select id="trk-type">${types.map(t => `<option value="${t[0]}">${t[1]}</option>`).join('')}</select><button class="btn pri block mt" data-a="trkStart">▶ Bắt đầu</button><label style="display:flex;gap:8px;align-items:center;margin-top:12px"><input type="checkbox" style="width:auto" data-in="dimAuto" ${autoDim() ? 'checked' : ''}> Tự làm tối màn hình sau 20 giây khi đang theo dõi</label></div>`;
  if (TR.status === 'recovered') { const s = trkStats(); return `<div class="card"><div class="ins warn"><b>⚠️ Buổi theo dõi dở dang</b><div class="sub">${s.km.toFixed(2)} km, ${fmtDur(s.el)}. App đã bị đóng hoặc tải lại giữa chừng.</div></div><div class="grid2 mt"><button class="btn pri" data-a="trkResume">Tiếp tục</button><button class="btn" data-a="trkFinish">Lưu buổi này</button></div><button class="btn danger block mt" data-a="trkDiscard">Bỏ buổi này</button></div>`; }
  const st = (id, v, l) => `<div class="stat"><b id="${id}">${v}</b><span>${l}</span></div>`;
  return `<div class="card trk"><div class="sub" id="t-gps"></div><div class="grid2 mt">${st('t-dist', '0.00', 'km')}${st('t-time', '0:00', 'thời gian')}${st('t-pace', '--:--', 'pace trung bình (/km)')}${st('t-now', '--:--', 'pace hiện tại (/km)')}${st('t-spd', '0', 'km/h')}${st('t-kcal', '0', 'kcal ước tính')}</div>
  <div class="sub mt">Bước chân ước tính: <b id="t-steps">–</b> (tính từ quãng đường và chiều cao)</div><div class="hint" id="t-warn" hidden>Có đoạn GPS bị gián đoạn (khoá màn hình hoặc mất tín hiệu), quãng đường có thể thiếu.</div>
  <div class="grid2 mt">${TR.status === 'paused' ? '<button class="btn pri" data-a="trkResume">▶ Tiếp tục</button>' : '<button class="btn" data-a="trkPause">⏸ Tạm dừng</button>'}<button class="btn" data-a="dimNow">🌑 Làm tối màn hình</button></div><button class="btn pri block mt" data-a="trkFinish">⏹ Kết thúc và lưu</button></div>`;
}
function mkType(s) { s = String(s || '').toLowerCase(); return /run|chạy/.test(s) ? 'run' : /walk|hik|đi bộ/.test(s) ? 'walk' : /bik|cycl|ride|đạp/.test(s) ? 'cycle' : 'other'; }
function finishAct(pts, type, dist, secs, fname, start) {
  if (!pts.length && !dist) return null; let d = 0; const lim = type === 'cycle' ? 25 : type === 'other' ? 30 : 12;
  for (let i = 1; i < pts.length; i++) { if (pts[i].g) continue; const dd = hav(pts[i - 1], pts[i]), a = pts[i - 1].t, b = pts[i].t, dt = a && b ? (b - a) / 1000 : 0; if (dt > 0 && dd / dt > lim) continue; d += dd; }
  const ts = pts.filter(p => p.t), st = start || (ts[0] && ts[0].t) || null, hrs = pts.filter(p => p.hr > 30 && p.hr < 230).map(p => p.hr);
  return { name: fname, type, start: st, km: (dist || d) / 1000, min: secs ? secs / 60 : ts.length > 1 ? (ts[ts.length - 1].t - ts[0].t) / 60000 : 0, hr: hrs.length ? avgOf(hrs) : 0, route: routeOf(pts) };
}
function parseActivities(text, fname) {
  const doc = new DOMParser().parseFromString(text, 'application/xml'); if (doc.getElementsByTagName('parsererror').length) throw new Error('xml');
  const q = (n, r = doc) => [...r.getElementsByTagNameNS('*', n)], tx = (el, n) => { const e = q(n, el)[0]; return e ? e.textContent.trim() : ''; }, out = [];
  if (q('trk').length) q('trk').forEach(trk => { const pts = []; q('trkseg', trk).forEach(sg => q('trkpt', sg).forEach((pt, i) => { const t = Date.parse(tx(pt, 'time')); pts.push({ lat: +pt.getAttribute('lat'), lon: +pt.getAttribute('lon'), t: isFinite(t) ? t : null, g: i === 0 && pts.length ? 1 : 0, hr: +tx(pt, 'hr') || 0 }); })); out.push(finishAct(pts, mkType(tx(trk, 'type') || tx(trk, 'name')), 0, 0, fname)); });
  else if (q('Activity').length) q('Activity').forEach(act => {
    const laps = q('Lap', act), pts = []; let dist = 0, secs = 0;
    laps.forEach(l => { dist += +tx(l, 'DistanceMeters') || 0; secs += +tx(l, 'TotalTimeSeconds') || 0; q('Trackpoint', l).forEach((tp, i) => { const la = tx(tp, 'LatitudeDegrees'), lo = tx(tp, 'LongitudeDegrees'), t = Date.parse(tx(tp, 'Time')); if (la && lo) pts.push({ lat: +la, lon: +lo, t: isFinite(t) ? t : null, g: i === 0 && pts.length ? 1 : 0, hr: +tx(q('HeartRateBpm', tp)[0] || tp, 'Value') || 0 }); }); });
    out.push(finishAct(pts, mkType(act.getAttribute('Sport')), dist, secs, fname, Date.parse(tx(act, 'Id')) || (laps[0] && Date.parse(laps[0].getAttribute('StartTime'))) || null));
  });
  return out.filter(Boolean);
}
function impModal() {
  modal(`<div class="row"><h3 class="sp">Nhập buổi tập từ file</h3><button class="btn sm" data-a="closeModal">Đóng</button></div>${IMP.map((a, i) => `<div class="item"><input type="checkbox" style="width:auto" data-in="impck" data-i="${i}" ${a.on ? 'checked' : ''} ${a.bad ? 'disabled' : ''}><div class="sp"><b>${a.start ? new Date(a.start).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : 'Không rõ ngày'}</b><div class="sub">${round(a.km, 2)} km · ${Math.round(a.min)} phút${a.km && a.min ? ' · ' + fmtPace(a.min / a.km) + '/km' : ''}${a.hr ? ' · ❤ ' + Math.round(a.hr) : ''}</div><div class="sub">${esc(a.name)}${a.dup ? ' · đã có trong app' : ''}${a.bad ? ' · thiếu dữ liệu' : ''}</div></div><select data-in="imptype" data-i="${i}" style="width:auto">${CARDIO_TYPES.map(t => `<option value="${t.id}" ${t.id === a.type ? 'selected' : ''}>${t.name}</option>`).join('')}</select></div>`).join('') || '<div class="empty">Không đọc được buổi tập nào.</div>'}<button class="btn pri block mt" data-a="impDo">Nhập các buổi đã chọn</button>`);
}

/* ---------- Cardio ---------- */
function vCardio() {
  const ts = CARDIO_TYPES.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  const list = [...S.cardio].sort((a, b) => b.date - a.date).slice(0, 20).map(c => {
    const t = CARDIO_TYPES.find(x => x.id === c.type) || CARDIO_TYPES[5], pace = c.km && c.min ? c.min / c.km : 0, st = stepsOf(c);
    return `<div class="item"><div class="sp"><b>${t.name}</b> ${c.src === 'gps' ? '📍' : c.src ? '📥' : ''} <span class="sub">${fmtD(c.date)} ${new Date(c.date).toTimeString().slice(0, 5)}</span><div class="sub">${c.km ? round(c.km, 2) + ' km · ' : ''}${Math.round(c.min)} phút${pace ? ' · ' + fmtPace(pace) + '/km' : ''}${st ? ' · ~' + st.toLocaleString('vi-VN') + ' bước' : ''}${c.hr ? ' · ❤ ' + Math.round(c.hr) : ''} · ~${cardioKcal(c)} kcal</div></div>${c.route ? `<button class="btn sm" data-a="routeView" data-id="${c.id}">Lộ trình</button>` : ''}<button class="x" data-a="delCardio" data-id="${c.id}">✕</button></div>`;
  }).join('');
  const wk = weeksBack(8).map((t, i, a) => ({ label: fmtD(t), v: S.cardio.filter(c => c.date >= t && c.date < t + 7 * DAY).reduce((s, c) => s + (c.km || 0), 0), cur: i === a.length - 1 }));
  return `${head('Cardio & chạy bộ', '#/train')}<div id="trk">${trkPanel()}</div>
  <h2>Ghi tay</h2><div class="card"><label>Loại</label><select id="c-type">${ts}</select>
  <div class="grid2"><div><label>Quãng đường (km)</label><input id="c-km" inputmode="decimal" placeholder="vd 3.5"></div><div><label>Thời gian (phút)</label><input id="c-min" inputmode="decimal" placeholder="vd 25"></div></div>
  <button class="btn pri block mt" data-a="addCardio">Lưu buổi tập</button><div class="sub mt">Người mới nên chạy xen đi bộ, tăng không quá 10% quãng đường mỗi tuần.</div></div>
  <h2>Nhập từ app hoặc đồng hồ khác</h2><div class="card"><div class="sub">Xuất file GPX hoặc TCX từ Strava, Garmin, Coros, Samsung Health, Google Fit... rồi chọn ở đây. Chọn được nhiều file một lúc.</div><label class="btn block mt" style="margin:12px 0 0">📥 Chọn file GPX / TCX<input type="file" multiple accept=".gpx,.tcx,application/gpx+xml,application/xml,text/xml" data-in="gpx" hidden></label></div>
  <h2>Km mỗi tuần</h2><div class="card">${barChart(wk)}</div><h2>Gần đây</h2><div class="card">${list || '<div class="empty">Chưa có buổi cardio nào.</div>'}</div>`;
}

/* ---------- Cơ thể ---------- */
function vBody() {
  const b = [...S.body].sort((a, c) => a.date - c.date), p = S.profile, w = lastWeight(), bmi = w / ((p.height / 100) ** 2);
  const wpts = b.filter(x => x.weight).map(x => ({ x: fmtD(x.date), y: x.weight })), cur = wpts.length ? wpts[wpts.length - 1].y : null;
  const gw = p.goalWeight; const rem = gw && cur ? round(cur - gw, 1) : null;
  const list = [...b].reverse().slice(0, 15).map(x => `<div class="item"><div class="sp"><b>${x.weight ? x.weight + ' kg' : '—'}</b> <span class="sub">${fmtD(x.date)}</span><div class="sub">${x.waist ? 'Eo ' + x.waist + ' cm' : ''}${x.waist && x.fat ? ' · ' : ''}${x.fat ? 'Mỡ ' + x.fat + '%' : ''}</div></div><button class="x" data-a="delBody" data-id="${x.id}">✕</button></div>`).join('');
  return `${head('Cơ thể', '#/progress')}<div class="grid3"><div class="stat"><b>${cur || '—'}</b><span>Cân (kg)</span></div><div class="stat"><b>${round(bmi, 1)}</b><span>BMI</span></div><div class="stat"><b>${rem === null ? '—' : (rem > 0 ? rem : 0)}</b><span>kg tới mục tiêu</span></div></div>
  <div class="card"><div class="grid3"><div><label>Cân nặng (kg)</label><input id="b-w" inputmode="decimal"></div><div><label>Vòng eo (cm)</label><input id="b-waist" inputmode="decimal"></div><div><label>% mỡ (nếu biết)</label><input id="b-fat" inputmode="decimal"></div></div>
  <button class="btn pri block mt" data-a="addBody">Lưu số đo</button><div class="sub mt">Giảm mỡ: vòng eo giảm trong khi sức mạnh giữ nguyên nghĩa là bạn đang mất mỡ, không mất cơ.</div></div>
  <h2>Cân nặng</h2><div class="card">${lineChart(wpts)}</div><h2>Lịch sử</h2><div class="card">${list || '<div class="empty">Chưa có số đo nào.</div>'}</div>${vBodyPhotos()}`;
}

/* ---------- Ảnh tiến độ (IndexedDB) ---------- */
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('fittrack-photos', 1); r.onupgradeneeded = () => r.result.createObjectStore('p', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idbDo = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('p', mode), rq = fn(t.objectStore('p')); t.oncomplete = () => { db.close(); res(rq && rq.result); }; t.onerror = () => rej(t.error); }); };
const shrink = (file, max = 1000) => new Promise((res, rej) => { const img = new Image(), u = URL.createObjectURL(file); img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob(b => b ? res(b) : rej(new Error('blob')), 'image/jpeg', .82); }; img.onerror = () => rej(new Error('img')); img.src = u; });
let photos = [];
async function loadPhotos() {
  const box = $('#photos'); if (!box) return;
  try { photos = ((await idbDo('readonly', s => s.getAll())) || []).filter(p => !p.kind).sort((a, b) => a.date - b.date); } catch (e) { box.innerHTML = '<div class="empty">Trình duyệt này không cho lưu ảnh.</div>'; return; }
  photos.forEach(p => p.url = URL.createObjectURL(p.blob));
  box.innerHTML = photos.length ? `<div class="grid3">${[...photos].reverse().map(p => `<div data-a="photoView" data-id="${p.id}" style="cursor:pointer"><img src="${p.url}" alt="" style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:12px"><div class="sub" style="text-align:center">${fmtD(p.date)} · ${esc(p.label)}</div></div>`).join('')}</div><button class="btn block mt" data-a="photoCmp">↔ So sánh trước và sau</button>` : '<div class="empty">Chưa có ảnh nào. Chụp cùng góc, cùng ánh sáng mỗi 2–4 tuần để so sánh rõ nhất.</div>';
}
function vBodyPhotos() {
  return `<h2>Ảnh tiến độ</h2><div class="card"><div class="row"><select id="ph-label" style="flex:1"><option>Trước</option><option>Bên</option><option>Sau</option></select><label class="btn pri" style="margin:0">📷 Thêm ảnh<input type="file" accept="image/*" data-in="photo" hidden></label></div>
  <div class="sub mt">Ảnh chỉ lưu trên điện thoại này, không tải lên đâu cả. Ảnh không nằm trong file sao lưu JSON.</div><div id="photos" class="mt"><div class="empty">Đang tải...</div></div></div>`;
}

/* ---------- Ăn uống ---------- */
const fold = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
function waterAdd(ml, t, day = foodDay) { S.water[day] = Math.max(0, (S.water[day] || 0) + ml); (S.waterLog[day] = S.waterLog[day] || []).push({ id: uid(), t, ml }); }
const foodPool = () => [...S.customFoods.map(f => ({ ...f, mine: 1 })), ...FOODS];
let foodSel = null;
function openFood(name) {
  const f = foodPool().find(x => x.n === name); if (!f) return; foodSel = f;
  modal(`<h3>${esc(f.n)}</h3><div class="sub">${f.g ? `${round(f.k / f.g * 100)} kcal · ${round(f.p / f.g * 100, 1)}g đạm mỗi 100${f.ml ? 'ml' : 'g'} (1 khẩu phần ≈ ${f.g}${f.ml ? 'ml' : 'g'})` : `${f.k} kcal · ${f.p}g đạm mỗi khẩu phần`}</div>
  ${f.w ? '<div class="sub">Gần như không calo, được cộng vào mục nước uống.</div>' : ''}${(f.pur || f.alc) && uricHigh() ? '<div class="hint">⚠️ Acid uric của bạn đang cao: nên hạn chế món/đồ uống này (nhiều purin hoặc đường fructose, hoặc cồn).</div>' : ''}${f.alc ? '<div class="hint">Cồn cộng calo "rỗng" và làm chậm phục hồi cơ, nên hạn chế khi đang giảm mỡ hoặc tăng cơ.</div>' : ''}<div class="grid2"><div><label>${f.ml ? 'Số ly/lon/chai' : 'Số khẩu phần'}</label><input id="fm-q" inputmode="decimal" data-in="fm" data-f="q" value="1"></div>${f.g ? `<div><label>${f.ml ? 'Hoặc nhập ml' : 'Hoặc nhập gam'}</label><input id="fm-g" inputmode="decimal" data-in="fm" data-f="g" value="${f.g}"></div>` : ''}</div>
  <div class="row mt"><label style="margin:0">Giờ ăn</label><input id="fm-t" type="time" value="${foodDay === dk() ? nowT() : '12:00'}" style="width:auto;flex:1"></div><div class="stat mt" id="fm-pre"></div><button class="btn pri block mt" data-a="foodAdd">Thêm vào ${dayLabel(foodDay).toLowerCase()}</button><button class="btn ghost block" data-a="closeModal">Đóng</button>`);
  fmUpdate('q');
}
function fmUpdate(src) {
  const f = foodSel, q = $('#fm-q'), g = $('#fm-g'); if (!f) return;
  if (g && src === 'q') g.value = round(num(q.value) * f.g); else if (g && src === 'g') q.value = round(num(g.value) / f.g, 2);
  const m = num(q.value); $('#fm-pre').innerHTML = f.w ? `<b>${round(f.g * m)} ml nước</b>` : `<b>${Math.round(f.k * m)} kcal</b><span> · ${round(f.p * m, 1)}g đạm</span>`;
}
function foodButtons() {
  const q = fold(foodQ); let all = foodPool().filter(f => !q || fold(f.n).includes(q));
  if (foodCat === 'drink') all = all.filter(f => f.ml); else if (foodCat === 'alc') all = all.filter(f => f.alc); else if (foodCat === 'snack') all = all.filter(f => f.snk && !f.ml);
  const list = (q || foodCat) ? all : all.slice(0, 14);
  return list.map(f => `<button class="btn sm" data-a="addFood" data-n="${esc(f.n)}" style="margin:3px 3px 0 0">${f.mine ? '⭐ ' : ''}${esc(f.n)} · ${f.k}</button>`).join('') || '<span class="sub">Không có, hãy thêm món riêng bên dưới.</span>';
}
function vFood() {
  const t = targets(), tot = foodTotal(foodDay), items = foodOf(foodDay), wt = S.water[foodDay] || 0, isToday = foodDay === dk();
  const shown = foodButtons();
  return `${head('Ăn uống')}<div class="row"><button class="btn sm" data-a="dayPrev">‹</button><b class="sp" style="text-align:center">${dayLabel(foodDay)}</b><button class="btn sm" data-a="dayNext" ${isToday ? 'disabled style="opacity:.4"' : ''}>›</button></div>
  <div class="card"><div class="row"><b style="font-size:24px">${Math.round(tot.k)}</b><span class="sub">/ ${t.kcal} kcal</span><span class="sp"></span><span class="sub">còn ${Math.max(0, Math.round(t.kcal - tot.k))}</span></div>
  <div class="bar"><i class="${tot.k > t.kcal * 1.1 ? 'over' : ''}" style="width:${Math.min(100, tot.k / t.kcal * 100)}%"></i></div>
  <div class="row"><b>${Math.round(tot.p)}g</b><span class="sub">/ ${t.protein}g đạm</span></div><div class="bar"><i style="width:${Math.min(100, tot.p / t.protein * 100)}%"></i></div>
  <div class="row"><b>${wt} ml</b><span class="sub">/ ${t.water * 1} ml nước</span><span class="sp"></span><button class="btn sm" data-a="water" data-v="250">+250</button><button class="btn sm" data-a="water" data-v="-250">−</button></div><div class="bar"><i style="width:${Math.min(100, wt / t.water * 100)}%"></i></div>${(() => { const wl = [...(S.waterLog[foodDay] || [])].sort((a, b) => a.t.localeCompare(b.t)), rest = wt - wl.reduce((u, w) => u + w.ml, 0); return wl.length || rest > 0 ? `<div class="mt">${wl.map(w => `<div class="row" style="padding:3px 0"><input type="time" class="tin" data-in="wtime" data-id="${w.id}" value="${w.t}"><b>${w.ml} ml</b><span class="sp"></span><button class="x" data-a="waterDel" data-id="${w.id}" aria-label="Xoá">✕</button></div>`).join('')}${rest > 0 ? `<div class="sub">Ngoài ra ${rest} ml chưa ghi giờ</div>` : ''}</div>` : ''; })()}</div>
  <h2>Đã ăn</h2><div class="card">${items.map((f, i) => ({ f, i })).sort((a, b) => (a.f.t || '99').localeCompare(b.f.t || '99')).map(({ f, i }) => `<div class="item"><div class="sp"><b>${esc(f.n)}</b><div class="sub">${Math.round(f.k * f.q)} kcal · ${round(f.p * f.q, 1)}g đạm</div><input type="time" class="tin" data-in="ftime" data-i="${i}" value="${f.t || ''}" aria-label="Giờ ăn"></div><button class="btn sm" data-a="qty" data-i="${i}" data-v="-0.5">−</button><b>${f.gr ? f.gr + (f.ml ? ' ml' : ' g') : round(f.q, 2)}</b><button class="btn sm" data-a="qty" data-i="${i}" data-v="0.5">+</button><button class="x" data-a="delFood" data-i="${i}">✕</button></div>`).join('') || '<div class="empty">Chưa ghi món nào.</div>'}</div>
  <h2>Thêm món</h2><div class="card"><div class="tabs">${[['', 'Gợi ý'], ['snack', '🍞 Ăn sáng, ăn vặt'], ['drink', '🥤 Đồ uống'], ['alc', '🍺 Rượu bia'], ['all', 'Tất cả']].map(c => `<button class="btn sm ${foodCat === c[0] ? 'on' : ''}" data-a="cat" data-c="${c[0]}">${c[1]}</button>`).join('')}</div><input id="fq" data-in="fq" placeholder="Tìm: cơm, phở, ức gà..." value="${esc(foodQ)}"><div id="flist" class="mt">${shown}</div>
  <label>Món riêng</label><input id="f-n" placeholder="Tên món"><div class="grid3"><div><label>kcal</label><input id="f-k" inputmode="decimal"></div><div><label>Đạm (g)</label><input id="f-p" inputmode="decimal"></div><div><label>Gam/phần</label><input id="f-g" inputmode="decimal" placeholder="tuỳ chọn"></div></div><button class="btn block mt" data-a="addCustomFood">Thêm món này</button></div>
  ${S.customFoods.length ? `<h2>Món của tôi</h2><div class="card">${S.customFoods.map((f, i) => `<div class="item"><div class="sp"><b>${esc(f.n)}</b><div class="sub">${f.k} kcal · ${f.p}g đạm</div></div><button class="x" data-a="delCustomFood" data-i="${i}">✕</button></div>`).join('')}</div>` : ''}<div class="sub">Số liệu calo/đạm là ước tính theo khẩu phần phổ biến. Điều chỉnh theo thực tế của bạn.</div>`;
}

/* ---------- Tiến độ ---------- */
function vProgress() {
  const t = S.sessions.length, tv = S.sessions.reduce((s, x) => s + x.vol, 0), km = S.cardio.reduce((s, c) => s + (c.km || 0), 0);
  const wk = weeksBack(8), vol = wk.map((w, i) => ({ label: fmtD(w), v: weekStats(w).vol / 1000, cur: i === 7 })), cnt = wk.map((w, i) => ({ label: fmtD(w), v: weekStats(w).sessions, cur: i === 7 }));
  const used = [...new Set(S.sessions.flatMap(s => s.exs.map(e => e.id)))]; if (!used.includes(progEx)) progEx = used[0] || '';
  let lift = '';
  if (progEx) {
    const ex = exOf(progEx), pts = S.sessions.filter(s => s.exs.some(e => e.id === progEx)).map(s => { const e = s.exs.find(x => x.id === progEx); return { x: fmtD(s.date), y: round(Math.max(...e.sets.map(z => ex.type === 'time' ? z.r : e1rm(z.w, z.r))), 1) }; });
    lift = `<select data-in="progEx">${used.map(id => `<option value="${id}" ${id === progEx ? 'selected' : ''}>${esc(exOf(id).name)}</option>`).join('')}</select><div class="sub mt">${ex.type === 'time' ? 'Thời gian tốt nhất mỗi buổi (giây)' : 'Sức mạnh ước tính (1RM) mỗi buổi, kg'}</div>${lineChart(pts)}`;
  } else lift = '<div class="empty">Hoàn thành vài buổi tập để xem tiến bộ từng bài.</div>';
  return `${head('Tiến độ')}<div class="grid3"><div class="stat"><b>${t}</b><span>Buổi tạ</span></div><div class="stat"><b>${round(tv / 1000, 1)}t</b><span>Tổng tạ</span></div><div class="stat"><b>${round(km, 1)}</b><span>Km đã chạy</span></div></div>
  <div class="grid2 mt"><a class="btn" href="#/body">⚖️ Cân nặng & số đo</a><a class="btn" href="#/cardio">🏃 Cardio</a></div><div class="grid2 mt"><a class="btn" href="#/report">📊 Báo cáo tuần</a><a class="btn" href="#/health">🩺 Sức khoẻ</a></div>
  ${vInsights()}
  <h2>Số buổi tạ mỗi tuần</h2><div class="card">${barChart(cnt)}</div><h2>Khối lượng tạ mỗi tuần (tấn)</h2><div class="card">${barChart(vol)}</div><h2>Tiến bộ theo bài</h2><div class="card">${lift}</div>${vTiming()}`;
}

/* ---------- Phân tích thời gian ---------- */
const BANDS = ['Sáng', 'Trưa', 'Chiều', 'Tối', 'Khuya'];
function vTiming() {
  const feelIc = v => v ? ['😫', '😐', '🙂', '💪'][Math.max(0, Math.min(3, Math.round(v) - 1))] : '–';
  // Tập
  const g = {}; BANDS.forEach(b => g[b] = { n: 0, vol: 0, f: 0, fn: 0 });
  S.sessions.forEach(x => { const b = g[hband(new Date(x.date).getHours())]; b.n++; b.vol += x.vol; if (x.feel) { b.f += x.feel; b.fn++; } });
  let wk;
  if (S.sessions.length < 3) wk = '<div class="empty">Cần ít nhất 3 buổi tập để phân tích.</div>';
  else {
    const rows = BANDS.filter(b => g[b].n).map(b => `<div class="item"><b style="width:64px">${b}</b><span class="sub sp">${g[b].n} buổi · ${Math.round(g[b].vol / g[b].n)} kg/buổi</span><span>${feelIc(g[b].fn ? g[b].f / g[b].fn : 0)}</span></div>`).join('');
    const ok = BANDS.filter(b => g[b].n >= 3 && g[b].fn >= 3).sort((a, b) => g[b].f / g[b].fn - g[a].f / g[a].fn || g[b].vol / g[b].n - g[a].vol / g[a].n);
    const best = ok[0];
    wk = `<div class="card">${barChart(BANDS.map(b => ({ label: b, v: g[b].n, cur: b === best })))}${rows}
    <div class="hint">${best ? `Bạn thường cảm thấy tốt nhất khi tập buổi <b>${best.toLowerCase()}</b> (${g[best].n} buổi, khối lượng TB ${Math.round(g[best].vol / g[best].n)} kg). Đây chỉ là tương quan từ dữ liệu của bạn, chưa chắc là nguyên nhân.` : 'Chọn cảm giác sau mỗi buổi (😫 → 💪) và tập ít nhất 3 buổi ở một khung giờ để app so sánh.'}</div></div>`;
  }
  // Ăn uống
  const since = dk(Date.now() - 30 * DAY), days = Object.keys(S.food).filter(k => k >= since && S.food[k].some(f => f.t));
  const kc = {}, pr = {}; BANDS.forEach(b => { kc[b] = 0; pr[b] = 0; });
  days.forEach(k => S.food[k].forEach(f => { if (!f.t) return; const b = hband(Math.floor(hm(f.t) / 60)); kc[b] += f.k * f.q; pr[b] += f.p * f.q; }));
  const tk = BANDS.reduce((t, b) => t + kc[b], 0); let fd;
  if (days.length < 3 || !tk) fd = `<div class="empty">Ghi món ăn kèm giờ trong ít nhất 3 ngày để xem phân tích (hiện có ${days.length} ngày).</div>`;
  else {
    const pc = b => Math.round(kc[b] / tk * 100), notes = [], lbl = { Sáng: 'Sáng (5–11h)', Trưa: 'Trưa (11–14h)', Chiều: 'Chiều (14–18h)', Tối: 'Tối (18–22h)', Khuya: 'Khuya (22–5h)' };
    if (pc('Khuya') >= 15) notes.push(`Ăn khuya chiếm ${pc('Khuya')}% năng lượng: khi giảm mỡ nên dồn bữa sớm hơn, ăn khuya dễ làm vượt mục tiêu calo và ngủ kém.`);
    if (pr['Sáng'] / days.length < 15) notes.push(`Đạm bữa sáng trung bình chỉ ${Math.round(pr['Sáng'] / days.length)}g/ngày. Thêm trứng, sữa chua hoặc sữa đậu nành để đạt 20–30g, giúp no lâu và giữ cơ.`);
    if (pc('Tối') >= 50) notes.push(`Bữa tối chiếm ${pc('Tối')}% năng lượng: thử chia đều hơn sang bữa trưa để đỡ nặng bụng và tập luyện tốt hơn.`);
    if (!notes.length) notes.push('Phân bổ năng lượng trong ngày khá cân đối.');
    fd = `<div class="card">${barChart(BANDS.map(b => ({ label: lbl[b].split(' ')[0], v: pc(b), cur: kc[b] === Math.max(...BANDS.map(x => kc[x])) })), '%')}<div class="sub">Tỷ lệ năng lượng theo khung giờ, ${days.length} ngày gần nhất có ghi giờ ăn.</div>${notes.map(n => `<div class="hint">${esc(n)}</div>`).join('')}</div>`;
  }
  // Ăn so với giờ tập
  let pre = 0, post = 0, cnt = 0;
  S.sessions.filter(x => x.date >= Date.now() - 60 * DAY).forEach(x => {
    const fs = (S.food[dk(x.date)] || []).filter(f => f.t); if (!fs.length) return; cnt++;
    const d = new Date(x.date), st = d.getHours() * 60 + d.getMinutes(), en = st + Math.round(x.dur / 60);
    if (fs.some(f => { const m = hm(f.t); return m >= st - 180 && m <= st - 30 && f.k * f.q >= 150; })) pre++;
    if (fs.filter(f => { const m = hm(f.t); return m >= en - 15 && m <= en + 120; }).reduce((t, f) => t + f.p * f.q, 0) >= 20) post++;
  });
  const lk = cnt < 3 ? '<div class="empty">Cần ít nhất 3 ngày vừa có buổi tập vừa có ghi giờ ăn.</div>'
    : `<div class="card"><div class="grid2"><div class="stat"><b>${Math.round(pre / cnt * 100)}%</b><span>có bữa ăn 0,5–3 giờ trước tập</span></div><div class="stat"><b>${Math.round(post / cnt * 100)}%</b><span>có ≥20g đạm trong 2 giờ sau tập</span></div></div>
    <div class="hint">${post / cnt < .6 ? 'Hãy bổ sung bữa giàu đạm (20–40g) trong 2 giờ sau tập để hỗ trợ phục hồi cơ. ' : ''}${pre / cnt < .6 ? 'Ăn nhẹ có tinh bột (chuối, yến mạch, cơm) 1–2 giờ trước tập giúp bạn có sức hơn.' : ''}${post / cnt >= .6 && pre / cnt >= .6 ? 'Bạn đang ăn trước và sau tập khá tốt, hãy duy trì.' : ''}</div><div class="sub">Dựa trên ${cnt} buổi tập trong 60 ngày qua.</div></div>`;
  // Nước uống
  const nowT0 = Date.now(), wdays = Object.keys(S.waterLog || {}).filter(k => k >= dk(nowT0 - 14 * DAY)).map(k => ({ k, l: [...S.waterLog[k]].sort((a, b) => a.t.localeCompare(b.t)) })).filter(x => x.l.length);
  let wt;
  if (wdays.length < 3) wt = `<div class="empty">Ghi nước kèm giờ trong ít nhất 3 ngày để xem nhịp uống nước (hiện có ${wdays.length} ngày).</div>`;
  else {
    const mlB = {}; BANDS.forEach(b => mlB[b] = 0); wdays.forEach(x => x.l.forEach(w => { mlB[hband(Math.floor(hm(w.t) / 60))] += w.ml; }));
    const tot = BANDS.reduce((t, b) => t + mlB[b], 0), pcw = b => Math.round(mlB[b] / tot * 100);
    const gaps = wdays.filter(x => x.l.length >= 2).map(x => Math.max(...x.l.slice(1).map((w, i) => hm(w.t) - hm(x.l[i].t)))), avgGap = gaps.length ? avgOf(gaps) : 0, perDay = avgOf(wdays.map(x => x.l.length)), mlDay = tot / wdays.length;
    const notes = [];
    if (avgGap >= 240) notes.push(`Khoảng cách dài nhất giữa hai lần uống trung bình ${round(avgGap / 60, 1)} giờ. Nên uống rải đều, mỗi 1–2 giờ một ly nhỏ, thay vì dồn một lúc.`);
    if (pcw('Tối') + pcw('Khuya') >= 40) notes.push(`${pcw('Tối') + pcw('Khuya')}% lượng nước uống sau 18h. Dồn nước về tối dễ phải thức giấc đi vệ sinh, hãy uống nhiều hơn từ sáng đến chiều.`);
    if (pcw('Sáng') < 15) notes.push('Buổi sáng uống ít nước. Một ly nước sau khi thức dậy giúp bù nước sau một đêm.');
    if (!notes.length) notes.push('Nhịp uống nước khá đều trong ngày.');
    wt = `<div class="card">${barChart(BANDS.map(b => ({ label: b, v: pcw(b), cur: mlB[b] === Math.max(...BANDS.map(x => mlB[x])) })), '%')}<div class="grid2"><div class="stat"><b>${Math.round(mlDay)}</b><span>ml/ngày (14 ngày)</span></div><div class="stat"><b>${round(perDay, 1)}</b><span>lần uống/ngày</span></div></div>${notes.map(n => `<div class="hint">${esc(n)}</div>`).join('')}</div>`;
  }
  let wpre = 0, wdur = 0, wc = 0;
  S.sessions.filter(x => x.date >= nowT0 - 60 * DAY).forEach(x => {
    const l = S.waterLog[dk(x.date)]; if (!l || !l.length) return; wc++;
    const d = new Date(x.date), st = d.getHours() * 60 + d.getMinutes(), en = st + Math.round(x.dur / 60);
    if (l.filter(w => { const m = hm(w.t); return m >= st - 120 && m <= st; }).reduce((u, w) => u + w.ml, 0) >= 250) wpre++;
    if (l.filter(w => { const m = hm(w.t); return m > st && m <= en + 60; }).reduce((u, w) => u + w.ml, 0) >= 250) wdur++;
  });
  const wl2 = wc >= 3 ? `<div class="card"><div class="grid2"><div class="stat"><b>${Math.round(wpre / wc * 100)}%</b><span>có uống ≥250ml trong 2 giờ trước tập</span></div><div class="stat"><b>${Math.round(wdur / wc * 100)}%</b><span>có uống ≥250ml trong lúc và 1 giờ sau tập</span></div></div>${wpre / wc < .6 || wdur / wc < .6 ? '<div class="hint">Hãy uống một ly nước trước khi tập và nhấp từng ngụm giữa các set, nhất là khi acid uric cao hoặc trời nóng.</div>' : '<div class="hint">Bạn bù nước quanh buổi tập khá tốt.</div>'}<div class="sub">Dựa trên ${wc} buổi tập có ghi nước cùng ngày.</div></div>` : '';
  return `<h2>Phân tích: giờ tập</h2>${wk}<h2>Phân tích: giờ ăn</h2>${fd}<h2>Ăn uống quanh buổi tập</h2>${lk}<h2>Phân tích: giờ uống nước</h2>${wt}${wl2}`;
}

/* ---------- Phân tích chuyên sâu ---------- */
const GROUPS = { 'Ngực': 10, 'Lưng': 10, 'Chân': 10, 'Vai': 8, 'Tay trước': 6, 'Tay sau': 6, 'Mông': 6, 'Core': 6, 'Bắp chân': 6 };
const GSHORT = { 'Tay trước': 'Tay T.', 'Tay sau': 'Tay S.', 'Bắp chân': 'B.chân' };
const PUSHG = ['Ngực', 'Vai', 'Tay sau'], PULLG = ['Lưng', 'Tay trước'];
const avgOf = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
function lsSlope(pts) { // độ dốc bình phương tối thiểu (đơn vị y trên mỗi ngày)
  const mx = avgOf(pts.map(p => p.t)), my = avgOf(pts.map(p => p.y)); let n = 0, d = 0;
  pts.forEach(p => { n += (p.t - mx) * (p.y - my); d += (p.t - mx) ** 2; }); return d ? n / d : 0;
}
function vInsights() {
  const now = Date.now(), I = [], P = S.profile, T = targets(), gl = P.goal;
  const add = (lvl, title, body) => I.push({ lvl, title, body });
  const ss = [...S.sessions].sort((a, b) => a.date - b.date), first = ss.length ? ss[0].date : now, histDays = (now - first) / DAY;
  const kpi = { adh: null, kc: null, pr: null, wt: null };
  if (uricHigh()) {
    const since = dk(now - 14 * DAY), ents = Object.keys(S.food).filter(k => k >= since).flatMap(k => S.food[k]), bad = ents.filter(f => f.pur || f.alc);
    const wd = Object.keys(S.water).filter(k => k >= since && S.water[k] > 0).map(k => S.water[k]), wavg = avgOf(wd);
    add(bad.length ? 'warn' : 'good', 'Acid uric: món cần hạn chế', bad.length ? `14 ngày qua bạn ghi ${bad.length} lần món hoặc đồ uống dễ làm tăng acid uric (${[...new Set(bad.map(f => f.n.replace(/ \(.*/, '')))].slice(0, 5).join(', ')}). Thử giảm dần, nhất là bia rượu và nước ngọt.` : 'Nhật ký 14 ngày qua chưa có món nhiều purin hoặc đường. Hãy duy trì.');
    add(wd.length && wavg >= 2000 ? 'good' : 'warn', 'Uống nước khi acid uric cao', wd.length ? `Trung bình ${Math.round(wavg)} ml/ngày. Thường khuyến nghị khoảng 2000–2500 ml/ngày nếu bác sĩ không hạn chế.` : 'Chưa ghi lượng nước. Hãy ghi nước lọc ở tab Ăn uống để theo dõi mục tiêu 2–2,5 lít/ngày.');
  }
  if (fattyLiver()) {
    const bw = S.body.filter(b => b.weight).sort((a, b) => a.date - b.date);
    if (bw.length >= 2) { const p = (bw[0].weight - bw[bw.length - 1].weight) / bw[0].weight * 100; add(p >= 5 ? 'good' : 'info', 'Gan nhiễm mỡ: tiến độ giảm cân', `Đã ${p >= 0 ? 'giảm' : 'tăng'} ${round(Math.abs(p), 1)}% cân nặng so với lần cân đầu (${bw[0].weight} → ${bw[bw.length - 1].weight} kg). Giảm 5–10% cân nặng thường cải thiện rõ gan nhiễm mỡ.`); }
    else add('info', 'Gan nhiễm mỡ: mục tiêu cân nặng', `Giảm khoảng 5–10% cân nặng (${round(lastWeight() * .05, 1)}–${round(lastWeight() * .1, 1)} kg) thường cải thiện rõ. Hãy ghi cân nặng đều để theo dõi.`);
  }

  /* 1. Tuân thủ lịch tập */
  const fullWeeks = weeksBack(5).slice(0, -1).filter(w => w >= weekStart(first)).map(w => weekStats(w).sessions);
  if (fullWeeks.length) {
    const ok = fullWeeks.filter(n => n >= P.weeklyGoal).length; kpi.adh = Math.round(ok / fullWeeks.length * 100);
    const av = round(avgOf(fullWeeks), 1);
    if (kpi.adh >= 75) add('good', 'Tập rất đều đặn', `Đạt mục tiêu ${P.weeklyGoal} buổi ở ${ok}/${fullWeeks.length} tuần gần nhất (trung bình ${av} buổi/tuần). Đều đặn là yếu tố dự báo kết quả mạnh nhất.`);
    else if (kpi.adh >= 40) add('info', 'Tuân thủ lịch ở mức trung bình', `Đạt mục tiêu ${ok}/${fullWeeks.length} tuần, trung bình ${av} buổi/tuần. Thử đặt sẵn ngày giờ cố định trong phần Nhắc lịch tập.`);
    else add('warn', 'Chưa đạt mục tiêu số buổi', `Chỉ ${ok}/${fullWeeks.length} tuần đạt ${P.weeklyGoal} buổi (trung bình ${av}). Nếu mục tiêu hiện quá cao, hạ xuống ${Math.max(2, Math.round(av) || 2)} buổi/tuần: đều đặn quan trọng hơn lý tưởng.`);
  } else if (ss.length) add('info', 'Bạn vừa bắt đầu', `Mới có ${ss.length} buổi tập. Cần hết ít nhất một tuần đầy đủ để đánh giá mức tuân thủ.`);

  /* 2. Tải tập (acute:chronic) */
  if (histDays >= 14) {
    const vol = (a, b) => ss.filter(s => s.date >= a && s.date < b).reduce((t, s) => t + s.vol, 0);
    const acute = vol(now - 7 * DAY, now + 1), chronic = vol(now - 35 * DAY, now - 7 * DAY) / Math.min(4, (histDays - 7) / 7 || 1);
    if (chronic > 0) { const r = acute / chronic, pct = Math.round((r - 1) * 100);
      if (r > 1.5) add('warn', 'Tải tập tăng quá nhanh', `7 ngày qua cao hơn trung bình các tuần trước ${pct}%. Tăng đột ngột trên khoảng 30–50% làm tăng nguy cơ đau khớp, chấn thương. Cân nhắc giữ tải tuần này hoặc làm tuần nhẹ.`);
      else if (r < 0.6) add('info', 'Tải tập giảm rõ rệt', `7 ngày qua thấp hơn trung bình các tuần trước ${Math.abs(pct)}%. Nếu không chủ ý nghỉ nhẹ, hãy kiểm tra lịch và mức mệt.`);
      else add('good', 'Tải tập tăng ổn định', `Khối lượng 7 ngày qua ${pct >= 0 ? '+' : ''}${pct}% so với trung bình các tuần trước, nằm trong vùng an toàn.`); }
  }

  /* 3. Cân đối nhóm cơ */
  const wkDiv = Math.max(1, Math.min(4, histDays / 7)), gs = {}; Object.keys(GROUPS).forEach(g => gs[g] = 0);
  ss.filter(s => s.date >= now - 28 * DAY).forEach(s => s.exs.forEach(e => { const g = exOf(e.id).g; if (g in gs) gs[g] += e.sets.length; }));
  const perWk = g => gs[g] / wkDiv;
  if (ss.length >= 3) {
    const low = Object.keys(GROUPS).filter(g => perWk(g) < GROUPS[g] * 0.6);
    if (low.length) add('warn', 'Nhóm cơ đang tập ít', `${low.map(g => `${g} (${round(perWk(g), 1)}/${GROUPS[g]} set/tuần)`).join(', ')}. Mức tối thiểu hiệu quả thường là khoảng ${GROUPS['Ngực']} set cứng mỗi tuần cho nhóm lớn và ${GROUPS['Tay sau']} cho nhóm nhỏ.`);
    else add('good', 'Phân bổ nhóm cơ cân đối', 'Mọi nhóm cơ chính đều đạt gần mức set tối thiểu mỗi tuần.');
    const push = PUSHG.reduce((t, g) => t + perWk(g), 0), pull = PULLG.reduce((t, g) => t + perWk(g), 0);
    if (push > 0 && pull < push * 0.7) add('warn', 'Lệch đẩy nhiều hơn kéo', `Tỷ lệ đẩy:kéo hiện là ${round(push / Math.max(pull, .1), 1)}:1. Nên kéo bằng hoặc nhiều hơn đẩy để bảo vệ vai và tư thế. Thêm bài kéo xô, kéo cáp, face pull.`);
  }

  /* 4. Sức mạnh theo bài */
  const lifts = {}; ss.forEach(s => s.exs.forEach(e => { const ex = exOf(e.id); if (ex.type === 'time' || !e.sets.length) return; (lifts[e.id] = lifts[e.id] || []).push({ d: s.date, v: Math.max(...e.sets.map(z => e1rm(z.w, z.r))) }); }));
  const multi = Object.entries(lifts).filter(([, l]) => l.length >= 2).map(([id, l]) => ({ id, n: l.length, pct: (l[l.length - 1].v / l[0].v - 1) * 100, l }));
  const up = multi.filter(x => x.pct > 1).sort((a, b) => b.pct - a.pct).slice(0, 3);
  if (up.length) add('good', 'Bài đang tiến bộ nhanh', up.map(x => `${exOf(x.id).name.replace(/ \(.*/, '')} +${round(x.pct, 1)}% (${x.n} buổi)`).join('; ') + '.');
  const stall = multi.filter(x => x.n >= 4 && Math.max(...x.l.slice(-3).map(z => z.v)) <= Math.max(...x.l.slice(0, -3).map(z => z.v)) + 0.01);
  if (stall.length) add('warn', 'Bài đang chững', `${stall.map(x => exOf(x.id).name.replace(/ \(.*/, '')).join(', ')}: 3 buổi gần nhất chưa vượt đỉnh trước. Thử tăng reps trong vùng 8–12, đổi thứ tự bài, nghỉ nhẹ một tuần hoặc ăn thêm đủ calo.`);

  /* 5. Cân nặng, vòng eo */
  const wpts = S.body.filter(b => b.weight && b.date >= now - 42 * DAY).sort((a, b) => a.date - b.date);
  let wSlopeWk = null;
  if (wpts.length >= 3 && (wpts[wpts.length - 1].date - wpts[0].date) >= 7 * DAY) {
    wSlopeWk = lsSlope(wpts.map(b => ({ t: b.date / DAY, y: b.weight }))) * 7; kpi.wt = wSlopeWk;
    const cur = wpts[wpts.length - 1].weight, pct = wSlopeWk / cur * 100, rate = `${wSlopeWk > 0 ? '+' : ''}${round(wSlopeWk, 2)} kg/tuần (${round(pct, 2)}% cân nặng)`;
    let eta = '';
    if (P.goalWeight && ((gl === 'giam-mo' && wSlopeWk < -0.05 && cur > P.goalWeight) || (gl === 'tang-co' && wSlopeWk > 0.05 && cur < P.goalWeight))) eta = ` Giữ tốc độ này, bạn đạt ${P.goalWeight} kg sau khoảng ${Math.ceil(Math.abs((cur - P.goalWeight) / wSlopeWk))} tuần.`;
    if (gl === 'giam-mo') {
      if (pct < -1) add('warn', 'Giảm cân hơi nhanh', `Xu hướng ${rate}. Giảm trên 1%/tuần dễ mất cơ và tụt năng lượng: tăng nhẹ calo hoặc đạm.`);
      else if (pct <= -0.25) add('good', 'Tốc độ giảm cân hợp lý', `Xu hướng ${rate}, nằm trong vùng 0,25–1%/tuần là bền vững.${eta}`);
      else add('info', 'Cân nặng đang đi ngang', `Xu hướng ${rate}. Nếu mục tiêu là giảm mỡ, cân nhắc giảm 100–200 kcal/ngày hoặc thêm 1 buổi cardio, rồi theo dõi 2 tuần.`);
    } else if (gl === 'tang-co') {
      if (pct > 0.5) add('warn', 'Tăng cân hơi nhanh', `Xu hướng ${rate}. Trên 0,5%/tuần phần lớn là mỡ: giảm nhẹ calo dư.`);
      else if (pct >= 0.1) add('good', 'Tốc độ tăng cân hợp lý', `Xu hướng ${rate}, vùng 0,1–0,5%/tuần phù hợp để tăng cơ.${eta}`);
      else add('info', 'Cân nặng chưa tăng', `Xu hướng ${rate}. Muốn tăng cơ cần dư khoảng 200–300 kcal/ngày.`);
    } else add(Math.abs(pct) <= 0.5 ? 'good' : 'info', 'Xu hướng cân nặng (recomp)', `${rate}. Với giảm mỡ và tăng cơ đồng thời, cân đi ngang hoặc thay đổi nhẹ là bình thường, hãy theo dõi vòng eo và sức mạnh.`);
  } else add('info', 'Chưa đủ số đo cân', `Cần ít nhất 3 lần cân cách nhau từ 7 ngày để tính xu hướng (hiện ${wpts.length}). Nên cân cùng giờ mỗi sáng, 2–3 lần/tuần.`);
  const wa = S.body.filter(b => b.waist && b.date >= now - 56 * DAY).sort((a, b) => a.date - b.date);
  if (wa.length >= 2 && wa[wa.length - 1].date - wa[0].date >= 7 * DAY) {
    const d = round(wa[wa.length - 1].waist - wa[0].waist, 1);
    add(d < 0 ? 'good' : d > 1 ? 'warn' : 'info', 'Vòng eo', `Thay đổi ${d > 0 ? '+' : ''}${d} cm trong ${Math.round((wa[wa.length - 1].date - wa[0].date) / DAY)} ngày.${wSlopeWk !== null && Math.abs(wSlopeWk) < .15 && d < 0 ? ' Cân giữ nguyên nhưng eo giảm là dấu hiệu tốt của giảm mỡ, tăng cơ.' : ''}`);
  }

  /* 6. Dinh dưỡng */
  const fd = Object.keys(S.food).filter(k => k >= dk(now - 28 * DAY)).map(k => { const t = foodTotal(k); return { day: k, kc: t.k, pr: t.p }; });
  const valid = fd.filter(d => d.kc >= 800), v14 = valid.filter(d => d.day >= dk(now - 14 * DAY));
  if (v14.length >= 3) {
    const ak = avgOf(v14.map(d => d.kc)), ap = avgOf(v14.map(d => d.pr));
    kpi.kc = Math.round(v14.filter(d => Math.abs(d.kc - T.kcal) / T.kcal <= .1).length / v14.length * 100);
    kpi.pr = Math.round(v14.filter(d => d.pr >= T.protein * .9).length / v14.length * 100);
    const diff = Math.round(ak - T.kcal);
    add(Math.abs(diff) <= T.kcal * .1 ? 'good' : 'warn', 'Năng lượng so với mục tiêu', `Trung bình ${Math.round(ak)} kcal/ngày (mục tiêu ${T.kcal}), ${diff >= 0 ? 'dư' : 'thiếu'} ${Math.abs(diff)} kcal. Đạt ±10% mục tiêu ở ${kpi.kc}% số ngày (${v14.length} ngày có dữ liệu).`);
    add(ap >= T.protein * .9 ? 'good' : 'warn', 'Đạm', `Trung bình ${Math.round(ap)}g/ngày (mục tiêu ${T.protein}g), đạt ở ${kpi.pr}% số ngày.${ap < T.protein * .9 ? ' Thêm trứng, ức gà, sữa chua, đậu hũ hoặc whey vào các bữa còn thiếu.' : ''}`);
    const wk = valid.filter(d => [0, 6].includes(new Date(d.day + 'T12:00').getDay())), wd = valid.filter(d => ![0, 6].includes(new Date(d.day + 'T12:00').getDay()));
    if (wk.length >= 2 && wd.length >= 3) { const a = avgOf(wk.map(d => d.kc)), b = avgOf(wd.map(d => d.kc)), p = Math.round((a / b - 1) * 100);
      if (p >= 15) add('warn', 'Cuối tuần ăn nhiều hơn', `Thứ 7 và CN trung bình ${Math.round(a)} kcal, cao hơn ngày thường ${p}%. Đây là nguyên nhân phổ biến khiến cân đứng yên dù tuần ăn đúng.`); }
  } else add('info', 'Chưa đủ dữ liệu ăn uống', `Cần ít nhất 3 ngày ghi đủ bữa (từ 800 kcal trở lên) để đánh giá. Hiện có ${v14.length} ngày. Ngày ghi dở dang sẽ không được tính để tránh kết luận sai.`);
  const wp28 = S.body.filter(b => b.weight && b.date >= now - 28 * DAY).sort((a, b) => a.date - b.date);
  if (wp28.length >= 3 && wp28[wp28.length - 1].date - wp28[0].date >= 14 * DAY && valid.length >= 10) {
    const sl = lsSlope(wp28.map(b => ({ t: b.date / DAY, y: b.weight }))), est = Math.round(avgOf(valid.map(d => d.kc)) - sl * 7700);
    add('info', 'Mức đốt calo thực tế (ước tính)', `Từ ăn uống và cân nặng 4 tuần: khoảng ${est} kcal/ngày, so với công thức ${T.tdee}. Nếu chênh nhiều, hãy dùng số thực tế để đặt mục tiêu calo. Chính xác khi bạn ghi ăn đầy đủ.`);
  }

  /* 7. Cardio */
  const cs = S.cardio, c7 = cs.filter(c => c.date >= now - 7 * DAY), c14 = cs.filter(c => c.date >= now - 14 * DAY && c.date < now - 7 * DAY);
  const k7 = c7.reduce((t, c) => t + (c.km || 0), 0), k14 = c14.reduce((t, c) => t + (c.km || 0), 0), m28 = cs.filter(c => c.date >= now - 28 * DAY).reduce((t, c) => t + c.min, 0) / 4;
  if (k14 > 0 && k7 > k14 * 1.1) add('warn', 'Tăng quãng đường chạy nhanh', `7 ngày qua ${round(k7, 1)} km so với ${round(k14, 1)} km tuần trước (+${Math.round((k7 / k14 - 1) * 100)}%). Quy tắc an toàn là tăng không quá khoảng 10% mỗi tuần.`);
  const runs8 = cs.filter(c => c.type === 'run' && c.km >= 1 && c.min > 0 && c.date >= now - 56 * DAY).sort((a, b) => a.date - b.date);
  if (runs8.length >= 4) { const sl = lsSlope(runs8.map(c => ({ t: c.date / DAY, y: c.min / c.km }))) * 28 * 60;
    add(sl < -5 ? 'good' : 'info', 'Xu hướng pace chạy', sl < -5 ? `Pace đang nhanh dần khoảng ${Math.round(-sl)} giây/km mỗi 4 tuần (${runs8.length} buổi chạy).` : sl > 8 ? `Pace đang chậm dần khoảng ${Math.round(sl)} giây/km mỗi 4 tuần. Có thể do mệt, thời tiết nóng hoặc chạy dài hơn; hãy kiểm tra giấc ngủ và nghỉ ngơi.` : `Pace gần như ổn định (${runs8.length} buổi chạy gần đây).`); }
  if (cs.length >= 2) add(m28 >= 150 ? 'good' : 'info', 'Cardio hằng tuần', `Trung bình ${Math.round(m28)} phút/tuần trong 4 tuần. Khuyến nghị sức khoẻ chung là từ 150 phút/tuần cường độ vừa.`);

  /* Hiển thị */
  const order = { warn: 0, good: 1, info: 2 }, ic = { warn: '⚠️', good: '✅', info: '💡' };
  I.sort((a, b) => order[a.lvl] - order[b.lvl]);
  const pctTxt = v => v === null ? '—' : v + '%';
  const kp = `<div class="grid2">
    <div class="stat"><b>${pctTxt(kpi.adh)}</b><span>Tuần đạt mục tiêu buổi tập</span></div><div class="stat"><b>${pctTxt(kpi.kc)}</b><span>Ngày đạt calo (±10%)</span></div>
    <div class="stat"><b>${pctTxt(kpi.pr)}</b><span>Ngày đủ đạm (≥90%)</span></div><div class="stat"><b>${kpi.wt === null ? '—' : (kpi.wt > 0 ? '+' : '') + round(kpi.wt, 2)}</b><span>Cân nặng kg/tuần</span></div></div>`;
  const maxLift = Math.max(0, ...Object.values(lifts).map(l => l.length)), wspan = wpts.length >= 2 ? (wpts[wpts.length - 1].date - wpts[0].date) / DAY : 0;
  const need = [['Buổi tập', ss.length, 3, 'tải tập và cân đối nhóm cơ'], ['Ngày ghi ăn đủ bữa', v14.length, 3, 'đánh giá calo và đạm'], ['Lần cân', wspan >= 7 ? wpts.length : Math.min(wpts.length, 2), 3, 'xu hướng cân nặng (cách ≥7 ngày)'], ['Buổi cho một bài tập', maxLift, 4, 'phát hiện bài đang chững']].filter(n => n[1] < n[2]);
  const unlock = need.length ? `<div class="card"><b>Mở khoá thêm phân tích</b><div class="sub">Càng nhiều dữ liệu, kết luận càng đáng tin.</div>${need.map(n => `<div class="mt"><div class="row"><span class="sp">${n[0]}</span><b>${n[1]}/${n[2]}</b></div><div class="bar"><i style="width:${Math.round(n[1] / n[2] * 100)}%"></i></div><div class="sub">Mở khoá: ${n[3]}</div></div>`).join('')}</div>` : '';
  const cards = I.map(x => `<div class="ins ${x.lvl}"><b>${ic[x.lvl]} ${esc(x.title)}</b><div class="sub">${esc(x.body)}</div></div>`).join('');
  // Biểu đồ
  const charts = [];
  if (ss.length >= 1) { const keys = Object.keys(GROUPS); charts.push(`<h2>Set mỗi nhóm cơ (trung bình/tuần)</h2><div class="card">${barChart(keys.map(g => ({ label: GSHORT[g] || g, v: round(perWk(g), 1), cur: perWk(g) >= GROUPS[g] })))}<div class="sub">Màu nổi bật là nhóm đã đạt mức tối thiểu (${GROUPS['Ngực']} set cho nhóm lớn, ${GROUPS['Tay sau']} cho nhóm nhỏ).</div></div>`); }
  if (wpts.length >= 2) charts.push(`<h2>Xu hướng cân nặng (6 tuần)</h2><div class="card">${lineChart(wpts.map(b => ({ x: fmtD(b.date), y: b.weight })))}</div>`);
  if (fd.length) { const days = Array.from({ length: 10 }, (_, i) => now - (9 - i) * DAY); charts.push(`<h2>Calo 10 ngày gần nhất</h2><div class="card">${barChart(days.map((t, i) => { const k = foodTotal(dk(t)).k; return { label: fmtD(t), v: Math.round(k), cur: k > 0 && Math.abs(k - T.kcal) / T.kcal <= .1 }; }))}<div class="sub">Mục tiêu ${T.kcal} kcal. Cột nổi bật là ngày nằm trong ±10%.</div></div>`); }
  if (ss.length >= 4) { const wd = [0, 0, 0, 0, 0, 0, 0]; ss.forEach(s => wd[(new Date(s.date).getDay() + 6) % 7]++); charts.push(`<h2>Bạn hay tập vào thứ mấy</h2><div class="card">${barChart(['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((l, i) => ({ label: l, v: wd[i], cur: wd[i] === Math.max(...wd) })))}</div>`); }
  if (runs8.length >= 3) charts.push(`<h2>Pace chạy theo buổi (phút/km, thấp là nhanh)</h2><div class="card">${lineChart(runs8.map(c => ({ x: fmtD(c.date), y: round(c.min / c.km, 2) })))}</div>`);
  const stp = weeksBack(8).map((t, i, a) => ({ label: fmtD(t), v: cs.filter(c => c.date >= t && c.date < t + 7 * DAY).reduce((u, c) => u + stepsOf(c), 0) / 1000, cur: i === a.length - 1 }));
  if (stp.some(x => x.v > 0)) charts.push(`<h2>Bước chân ước tính mỗi tuần (nghìn bước)</h2><div class="card">${barChart(stp, 'k')}<div class="sub">Tính từ quãng đường cardio đi bộ và chạy, không gồm bước đi trong ngày.</div></div>`);
  return `<h2>Chỉ số chính</h2>${kp}${unlock}<h2>Nhận định của chuyên gia</h2>${cards || '<div class="empty">Chưa có nhận định.</div>'}<div class="sub" style="margin:6px 4px">Nhận định dựa trên quy tắc phổ biến trong huấn luyện và dinh dưỡng thể thao, mang tính tham khảo, không thay thế tư vấn y tế hay huấn luyện viên.</div>${charts.join('')}`;
}

/* ---------- Hồ sơ sức khoẻ ---------- */
const mkOf = k => MARKERS.find(m => m.k === k);
const hStatus = (m, v) => m.lo != null && v < m.lo ? 'L' : m.hi != null && v > m.hi ? 'H' : m.opt != null && v > m.opt ? 'N' : 'ok';
function hLatest(k) {
  const rs = S.health.records.filter(r => r.v && r.v[k] != null).sort((a, b) => b.date - a.date);
  return rs.length ? { v: rs[0].v[k], date: rs[0].date, rid: rs[0].id, prev: rs[1] ? { v: rs[1].v[k], date: rs[1].date } : null } : null;
}
const hFlags = () => MARKERS.map(m => { const l = hLatest(m.k); return l ? { m, l, st: hStatus(m, l.v) } : null; }).filter(x => x && x.st !== 'ok');
const fattyLiver = () => S.health.imaging.some(i => /gan nhiễm mỡ/i.test((i.conclusion || '') + ' ' + (i.title || '')));
const uricHigh = () => { const l = hLatest('uric'); return !!l && l.v > mkOf('uric').hi; };
const refTxt = m => m.lo != null && m.hi != null ? `${m.lo}–${m.hi}` : m.hi != null ? `≤ ${m.hi}` : `≥ ${m.lo}`;
const stInfo = { H: ['Cao', 'warn'], L: ['Thấp', 'warn'], N: ['Hơi cao', 'info'], ok: ['Bình thường', 'good'] };
function healthHint() {
  const p = [];
  if (uricHigh()) p.push('Acid uric đang cao: uống đủ nước trước, trong và sau tập; tránh tập đến kiệt sức.');
  if (fattyLiver()) p.push('Gan nhiễm mỡ: ưu tiên tập đều đặn, kết hợp cardio vừa sức.');
  S.health.notes.slice(0, 3).forEach(n => p.push('Bác sĩ dặn: ' + n.text));
  return p.length ? `<div class="hint">🩺 ${p.map(esc).join('<br>🩺 ')}</div>` : '';
}
function healthCard() {
  const H = S.health; if (!H.records.length && !H.imaging.length) return '';
  const fl = hFlags(), chips = fl.map(x => `<span class="chip ${stInfo[x.st][1]}">${esc(x.m.n)} ${round(x.l.v, 2)} ${esc(x.m.u)} · ${stInfo[x.st][0]}</span>`).join(' ') + (fattyLiver() ? ' <span class="chip warn">Gan nhiễm mỡ</span>' : '');
  const rc = H.recheck ? Math.ceil((new Date(H.recheck + 'T12:00').getTime() - Date.now()) / DAY) : null;
  return `<h2>Sức khoẻ</h2><a class="card" href="#/health" style="display:block"><div class="sub">Theo hồ sơ khám gần nhất</div><div class="mt">${chips || '<span class="chip good">Các chỉ số trong giới hạn</span>'}</div>${rc !== null && rc <= 14 ? `<div class="hint">📅 ${rc < 0 ? 'Đã quá hạn tái khám ' + (-rc) + ' ngày' : 'Tái khám sau ' + rc + ' ngày'}</div>` : ''}<div class="sub mt">Chạm để xem gợi ý cho tập và ăn.</div></a>`;
}
let docs = [];
async function loadDocs() {
  const box = $('#docs'); if (!box) return;
  try { docs = ((await idbDo('readonly', s => s.getAll())) || []).filter(p => p.kind === 'doc').sort((a, b) => b.date - a.date); } catch (e) { box.innerHTML = '<div class="empty">Trình duyệt này không cho lưu tài liệu.</div>'; return; }
  docs.forEach(p => p.url = URL.createObjectURL(p.blob));
  box.innerHTML = docs.length ? docs.map(p => `<div class="item"><div class="sp"><b>${esc(p.label)}</b><div class="sub">${fmtD(p.date)} · ${p.blob.type === 'application/pdf' ? 'PDF' : 'Ảnh'}</div></div><button class="btn sm" data-a="docView" data-id="${p.id}">Xem</button><button class="x" data-a="docDel" data-id="${p.id}" aria-label="Xoá">✕</button></div>`).join('') : '<div class="empty">Chưa có tài liệu nào.</div>';
}
function vHealth() {
  const H = S.health, fl = hFlags(), uric = uricHigh(), fat = fattyLiver(), w = lastWeight();
  const lastDate = H.records.length ? Math.max(...H.records.map(r => r.date)) : 0;
  const ul = hLatest('uric'), tgl = hLatest('tg'), alt = hLatest('alt'), ast = hLatest('ast'), ggt = hLatest('ggt');
  const advice = [];
  if (uric) advice.push(`<div class="ins warn"><b>⚠️ Acid uric cao: ${round(ul.v, 2)} mg/dL (≈ ${Math.round(ul.v * 59.48)} µmol/L, ngưỡng 3,4–7,0)</b>
    <ul class="sub" style="margin:6px 0 0;padding-left:18px"><li><b>Uống nước:</b> khoảng 2–2,5 lít/ngày, chia đều, nhất là quanh buổi tập (trừ khi bác sĩ hạn chế).</li>
    <li><b>Hạn chế:</b> bia, rượu; nước ngọt, nước mía, nước ép nhiều đường; nội tạng, hải sản (tôm, cua, sò, mực), cá cơm, cá mòi; nước hầm xương và lẩu đậm; thịt đỏ nhiều.</li>
    <li><b>Ưu tiên:</b> rau, sữa và sữa chua ít béo, trứng, đậu hũ, ngũ cốc nguyên hạt; thịt gà hoặc heo nạc với lượng vừa.</li>
    <li><b>Giảm cân từ từ:</b> nhịn ăn hoặc giảm cân quá nhanh có thể làm acid uric tăng tạm thời.</li>
    <li><b>Khi tập:</b> tránh để mất nước, không tập đến kiệt sức. Nếu khớp đột ngột sưng, đỏ, nóng, đau (nghi cơn gout), nghỉ tập khớp đó và đi khám.</li>
    <li><b>Theo dõi:</b> hỏi bác sĩ về thời điểm xét nghiệm lại và có cần dùng thuốc hay không.</li></ul></div>`);
  if (fat) advice.push(`<div class="ins warn"><b>⚠️ Gan nhiễm mỡ độ I (siêu âm)</b>
    <ul class="sub" style="margin:6px 0 0;padding-left:18px"><li><b>Cân nặng:</b> giảm khoảng 5–10% (${round(w * .05, 1)}–${round(w * .1, 1)} kg từ ${round(w, 1)} kg) trong vài tháng thường cải thiện rõ. Ăn đúng và tập đều là hướng chính.</li>
    <li><b>Ăn:</b> giảm đường, nước ngọt, bánh kẹo, đồ chiên rán; hạn chế rượu bia, tốt nhất là tránh.</li>
    <li><b>Tập:</b> kết hợp tạ và cardio vừa sức, tổng khoảng 150 phút/tuần trở lên đều có lợi.</li>
    <li><b>Men gan hiện tại:</b> ${[alt && `ALT ${round(alt.v, 1)}`, ast && `AST ${round(ast.v, 1)}`, ggt && `GGT ${round(ggt.v, 1)}`].filter(Boolean).join(', ') || 'chưa có dữ liệu'}${alt && ast && ggt ? ' (đều trong giới hạn theo phiếu).' : '.'}</li>
    <li><b>Theo dõi:</b> tái khám siêu âm và men gan theo hẹn của bác sĩ.</li></ul></div>`);
  if (tgl && hStatus(mkOf('tg'), tgl.v) === 'N') advice.push(`<div class="ins"><b>💡 Triglyceride ${round(tgl.v, 2)} mmol/L</b><div class="sub">Nằm trong giới hạn của phiếu nhưng cao hơn mức lý tưởng thường dùng (dưới 1,7). Giảm đường, rượu bia, đồ chiên và tăng cardio sẽ giúp, đặc biệt khi có gan nhiễm mỡ.</div></div>`);
  const others = fl.filter(x => !['uric'].includes(x.m.k) && !(x.m.k === 'tg' && x.st === 'N'));
  others.forEach(x => advice.push(`<div class="ins warn"><b>⚠️ ${esc(x.m.n)} ${round(x.l.v, 2)} ${esc(x.m.u)} (${stInfo[x.st][0].toLowerCase()}, tham chiếu ${refTxt(x.m)})</b><div class="sub">Hãy trao đổi với bác sĩ về chỉ số này.</div></div>`));
  const groups = [...new Set(MARKERS.map(m => m.g))];
  const table = groups.map(g => {
    const rows = MARKERS.filter(m => m.g === g && hLatest(m.k)).map(m => {
      const l = hLatest(m.k), st = hStatus(m, l.v), [tx, cl] = stInfo[st];
      return `<div class="item" style="padding:9px 0"><div class="sp"><b>${esc(m.n)}</b><div class="sub">Tham chiếu ${refTxt(m)} ${esc(m.u)} · ${fmtD(l.date)}${l.prev ? ` · trước: ${round(l.prev.v, 2)} (${fmtD(l.prev.date)})` : ''}</div></div><div style="text-align:right"><b>${round(l.v, 2)}</b> <span class="sub">${esc(m.u)}</span><div><span class="chip ${cl}">${tx}</span></div></div><button class="x" data-a="hDel" data-k="${m.k}" data-r="${l.rid}" aria-label="Xoá">✕</button></div>`;
    }).join('');
    return rows ? `<h2>${g}</h2><div class="card" style="padding:4px 16px">${rows}</div>` : '';
  }).join('');
  const withHist = MARKERS.filter(m => S.health.records.filter(r => r.v && r.v[m.k] != null).length >= 2);
  const hm = window.__hm && withHist.find(m => m.k === window.__hm) ? window.__hm : (withHist[0] && withHist[0].k);
  const trend = withHist.length ? `<h2>Xu hướng theo thời gian</h2><div class="card"><select data-in="hMarker">${withHist.map(m => `<option value="${m.k}" ${m.k === hm ? 'selected' : ''}>${esc(m.n)}</option>`).join('')}</select><div class="mt">${lineChart(S.health.records.filter(r => r.v && r.v[hm] != null).sort((a, b) => a.date - b.date).map(r => ({ x: fmtD(r.date), y: r.v[hm] })))}</div></div>` : '';
  const img = [...H.imaging].sort((a, b) => b.date - a.date).map(i => `<div class="item"><div class="sp"><b>${esc(i.title)}</b> <span class="sub">${fmtD(i.date)}</span><div class="sub">${esc(i.conclusion)}</div></div><button class="x" data-a="iDel" data-id="${i.id}" aria-label="Xoá">✕</button></div>`).join('');
  const notes = H.notes.map(n => `<div class="item"><div class="sp">${esc(n.text)}<div class="sub">${fmtD(n.date)}</div></div><button class="x" data-a="nDel" data-id="${n.id}" aria-label="Xoá">✕</button></div>`).join('');
  const opts = groups.map(g => `<optgroup label="${g}">${MARKERS.filter(m => m.g === g).map(m => `<option value="${m.k}">${esc(m.n)} (${esc(m.u)})</option>`).join('')}</optgroup>`).join('');
  return `${head('Sức khoẻ', '#/profile')}<div class="sub">${lastDate ? 'Đợt khám gần nhất: ' + new Date(lastDate).toLocaleDateString('vi-VN') : 'Chưa có dữ liệu. Nhập từ file hoặc thêm từng chỉ số bên dưới.'}</div>
  ${advice.length ? `<h2>Cần chú ý và gợi ý cho tập, ăn</h2>${advice.join('')}` : H.records.length ? '<div class="ins good"><b>✅ Các chỉ số đang trong giới hạn</b></div>' : ''}
  ${table}${trend}
  <h2>Siêu âm, kết quả khác</h2><div class="card">${img || '<div class="empty">Chưa có kết quả nào.</div>'}<label>Thêm kết quả</label><input id="i-title" placeholder="Tên, ví dụ: Siêu âm ổ bụng"><input id="i-date" type="date" class="mt" value="${dk()}"><input id="i-text" class="mt" placeholder="Kết luận của bác sĩ"><button class="btn block mt" data-a="iAdd">Lưu kết quả</button></div>
  <h2>Bác sĩ dặn</h2><div class="card">${notes || '<div class="empty">Chưa có dặn dò nào. Lời dặn sẽ hiện ở đầu mỗi buổi tập.</div>'}<input id="n-text" class="mt" placeholder="Ví dụ: tránh nín thở khi gắng sức"><button class="btn block mt" data-a="nAdd">Thêm lời dặn</button>
  <label>Ngày tái khám dự kiến</label><input type="date" data-in="hRecheck" value="${esc(H.recheck || '')}"></div>
  <h2>Thêm chỉ số</h2><div class="card"><label>Ngày xét nghiệm</label><input id="h-date" type="date" value="${dk()}"><label>Chỉ số</label><select id="h-m">${opts}</select><label>Giá trị</label><input id="h-v" inputmode="decimal" placeholder="Nhập số"><button class="btn pri block mt" data-a="hAdd">Lưu chỉ số</button></div>
  <h2>Tài liệu (ảnh, PDF)</h2><div class="card"><div id="docs"><div class="empty">Đang tải...</div></div><label>Thêm tài liệu</label><input id="d-title" placeholder="Tên, ví dụ: Xét nghiệm máu 21/09/2026"><label class="btn block mt" style="margin:12px 0 0">📎 Chọn ảnh hoặc PDF<input type="file" accept="image/*,application/pdf" data-in="hdoc" hidden></label><div class="sub mt">Tài liệu chỉ lưu trên máy này, không đồng bộ qua GitHub (nặng và nhạy cảm). Các chỉ số và ghi chú ở trên thì được đồng bộ.</div></div>
  <h2>Nhập từ file</h2><div class="card"><label class="btn block" style="margin:0">📥 Nhập file sức khoẻ (.json)<input type="file" accept="application/json" data-in="himport" hidden></label></div>
  <div class="sub mt">Thông tin chỉ mang tính tham khảo, không thay thế chẩn đoán hay tư vấn của bác sĩ. Khoảng tham chiếu lấy từ phiếu của phòng khám nếu có, hoặc giá trị phổ biến.</div>`;
}

/* ---------- Báo cáo tuần ---------- */
function weekHasData(ws) {
  const we = ws + 7 * DAY, inW = t => t >= ws && t < we;
  return S.sessions.some(x => inW(x.date)) || S.cardio.some(x => inW(x.date)) || S.body.some(x => inW(x.date)) || Array.from({ length: 7 }, (_, i) => dk(ws + i * DAY)).some(k => foodOf(k).length);
}
function reportBanner() {
  const last = weekStart(Date.now()) - 7 * DAY;
  if (!weekHasData(last) || (S.reportSeen || '') >= dk(last)) return '';
  return `<div class="banner row"><div class="sp"><b>📊 Báo cáo tuần ${fmtD(last)} – ${fmtD(last + 6 * DAY)} đã sẵn sàng</b><div class="sub">Tóm tắt tập, ăn uống, cơ thể và sức khoẻ.</div></div><a class="btn pri sm" href="#/report">Xem</a></div>`;
}
const pctCh = (a, b) => b > 0 ? (a >= b ? '▲ ' : '▼ ') + Math.abs(Math.round((a / b - 1) * 100)) + '%' : '';
function reportData(ws) {
  const now = Date.now(), we = ws + 7 * DAY, pws = ws - 7 * DAY, T = targets(), P = S.profile, inW = (t, a = ws, b = we) => t >= a && t < b;
  const D = { ws, we, T, P, partial: we > now };
  const ss = S.sessions.filter(x => inW(x.date)), ps = S.sessions.filter(x => inW(x.date, pws, ws)), sum = (a, f) => a.reduce((t, x) => t + f(x), 0);
  D.ss = ss; D.vol = sum(ss, x => x.vol); D.pvol = sum(ps, x => x.vol); D.sets = sum(ss, x => x.exs.reduce((u, e) => u + e.sets.length, 0)); D.dur = ss.length ? sum(ss, x => x.dur) / ss.length / 60 : 0;
  const fe = ss.filter(x => x.feel); D.feel = fe.length ? sum(fe, x => x.feel) / fe.length : 0;
  D.prs = []; ss.forEach(x => x.exs.forEach(e => { const ex = exOf(e.id); if (ex.type === 'time' || D.prs.some(p => p.id === e.id)) return;
    const prior = S.sessions.filter(y => y.date < ws).flatMap(y => y.exs.filter(z => z.id === e.id).flatMap(z => z.sets)); if (!prior.length) return;
    const best = Math.max(...prior.map(z => e1rm(z.w, z.r))), cur = Math.max(...e.sets.map(z => e1rm(z.w, z.r))); if (cur > best + 0.01) D.prs.push({ id: e.id, pct: (cur / best - 1) * 100 }); }));
  const gs = {}; Object.keys(GROUPS).forEach(g => gs[g] = 0); ss.forEach(x => x.exs.forEach(e => { const g = exOf(e.id).g; if (g in gs) gs[g] += e.sets.length; }));
  D.low = ss.length >= 2 ? Object.keys(GROUPS).filter(g => gs[g] < GROUPS[g] * 0.6) : [];
  const cs = S.cardio.filter(x => inW(x.date)), pcs = S.cardio.filter(x => inW(x.date, pws, ws));
  D.km = sum(cs, x => x.km || 0); D.pkm = sum(pcs, x => x.km || 0); D.cmin = sum(cs, x => x.min); D.cn = cs.length;
  D.steps = sum(cs, stepsOf); const runs = cs.filter(x => x.type === 'run' && x.km > 0 && x.min > 0), pruns = pcs.filter(x => x.type === 'run' && x.km > 0 && x.min > 0), pkr = sum(pruns, x => x.km);
  D.runKm = sum(runs, x => x.km); D.runPace = D.runKm ? sum(runs, x => x.min) / D.runKm : 0; D.pRunPace = pkr ? sum(pruns, x => x.min) / pkr : 0; D.longRun = runs.length ? Math.max(...runs.map(x => x.km)) : 0;
  const days = Array.from({ length: 7 }, (_, i) => ws + i * DAY), pdays = days.map(t => t - 7 * DAY);
  D.days = days.map(t => { const k = dk(t); return { t, k, train: S.sessions.some(x => dk(x.date) === k), food: foodOf(k).length > 0, water: (S.water[k] || 0) > 0, weigh: S.body.some(b => dk(b.date) === k && b.weight), future: t > now, kc: foodTotal(k).k, pr: foodTotal(k).p, w: S.water[k] || 0 }; });
  const valid = D.days.filter(d => d.kc >= 800), pvalid = pdays.map(t => foodTotal(dk(t))).filter(f => f.k >= 800);
  D.logged = D.days.filter(d => d.food).length; D.valid = valid.length;
  D.ak = valid.length ? avgOf(valid.map(d => d.kc)) : 0; D.ap = valid.length ? avgOf(valid.map(d => d.pr)) : 0; D.pak = pvalid.length ? avgOf(pvalid.map(f => f.k)) : 0;
  D.kHit = valid.length ? valid.filter(d => Math.abs(d.kc - T.kcal) / T.kcal <= .1).length / valid.length : null;
  D.pHit = valid.length ? valid.filter(d => d.pr >= T.protein * .9).length / valid.length : null;
  const wd = D.days.filter(d => d.w > 0); D.aw = wd.length ? avgOf(wd.map(d => d.w)) : 0; D.wDays = wd.length;
  const ents = D.days.flatMap(d => foodOf(d.k)); D.badFoods = ents.filter(f => f.pur || f.alc);
  const bw = S.body.filter(b => b.weight && inW(b.date)).sort((a, b) => a.date - b.date), pbw = S.body.filter(b => b.weight && inW(b.date, pws, ws));
  D.bw = bw; D.wavg = bw.length ? avgOf(bw.map(b => b.weight)) : 0; D.pwavg = pbw.length ? avgOf(pbw.map(b => b.weight)) : 0;
  const wa = S.body.filter(b => b.waist && b.date < we).sort((a, b) => a.date - b.date); D.waist = wa.length ? wa[wa.length - 1] : null; D.pwaist = wa.filter(b => b.date < ws).pop() || null;
  // điểm tuần
  const comp = [{ n: 'Tập luyện', w: 40, v: Math.min(1, ss.length / P.weeklyGoal) }];
  if (D.kHit !== null && D.valid >= 3) comp.push({ n: 'Calo đúng mục tiêu', w: 25, v: D.kHit }, { n: 'Đủ đạm', w: 20, v: D.pHit });
  if (D.wDays >= 3) comp.push({ n: 'Uống đủ nước', w: 15, v: Math.min(1, D.aw / T.water) });
  D.comp = comp; D.score = comp.length >= 2 ? Math.round(sum(comp, c => c.w * c.v) / sum(comp, c => c.w) * 100) : null;
  // nổi bật, cần cải thiện, ưu tiên tuần tới
  const good = [], bad = [], next = [];
  if (ss.length >= P.weeklyGoal) good.push(`Đạt mục tiêu ${P.weeklyGoal} buổi tạ (${ss.length} buổi).`);
  if (D.prs.length) good.push(`${D.prs.length} kỷ lục sức mạnh mới: ${D.prs.slice(0, 3).map(p => exOf(p.id).name.replace(/ \(.*/, '') + ' +' + round(p.pct, 1) + '%').join(', ')}.`);
  if (D.kHit !== null && D.kHit >= .7) good.push(`Calo sát mục tiêu ở ${Math.round(D.kHit * 100)}% số ngày ghi đủ.`);
  if (D.pHit !== null && D.pHit >= .7) good.push(`Đủ đạm ở ${Math.round(D.pHit * 100)}% số ngày.`);
  if (D.pvol > 0 && D.vol > D.pvol * 1.05) good.push(`Khối lượng tạ tăng ${Math.round((D.vol / D.pvol - 1) * 100)}% so với tuần trước.`);
  if (D.runPace && D.pRunPace && D.runPace < D.pRunPace * 0.97) good.push(`Pace chạy nhanh hơn tuần trước ${Math.round((D.pRunPace - D.runPace) * 60)} giây/km (${fmtPace(D.runPace)}/km).`);
  if (D.pkm > 0 && D.km > D.pkm * 1.3) bad.push(`Quãng đường cardio tăng ${Math.round((D.km / D.pkm - 1) * 100)}% so với tuần trước. Nên giữ mức tăng khoảng 10% để tránh chấn thương.`);
  if (ss.length < P.weeklyGoal) { bad.push(`Mới ${ss.length}/${P.weeklyGoal} buổi tạ.`); const nx = nextRoutine(); next.push(`Tập đủ ${P.weeklyGoal} buổi${nx ? `, bắt đầu bằng buổi "${nx.name}"` : ''}. Đặt giờ cố định trong phần Nhắc lịch tập.`); }
  if (D.logged < 5 && !D.partial) { bad.push(`Chỉ ghi ăn uống ${D.logged}/7 ngày nên số liệu dinh dưỡng chưa chắc chắn.`); next.push('Ghi ăn uống đủ các ngày (kể cả cuối tuần) để phân tích chính xác hơn.'); }
  if (D.valid >= 3 && D.ap < T.protein * .9) { bad.push(`Đạm trung bình ${Math.round(D.ap)}g, thấp hơn mục tiêu ${T.protein}g.`); next.push(`Thêm khoảng ${Math.round(T.protein - D.ap)}g đạm mỗi ngày: trứng, sữa chua, ức gà, đậu hũ hoặc whey.`); }
  if (D.valid >= 3 && Math.abs(D.ak - T.kcal) / T.kcal > .1) { const df = Math.round(D.ak - T.kcal); bad.push(`Calo trung bình ${Math.round(D.ak)} kcal, ${df > 0 ? 'dư' : 'thiếu'} ${Math.abs(df)} so với mục tiêu ${T.kcal}.`); next.push(df > 0 ? `Giảm khoảng ${Math.min(Math.abs(df), 300)} kcal/ngày (bớt đồ ngọt, tinh bột tinh chế, đồ uống có đường).` : `Ăn thêm khoảng ${Math.min(Math.abs(df), 300)} kcal/ngày nếu bạn thấy mệt hoặc tụt sức.`); }
  if (uricHigh()) {
    if (D.badFoods.length) { bad.push(`${D.badFoods.length} lần ghi món/đồ uống dễ làm tăng acid uric (${[...new Set(D.badFoods.map(f => f.n.replace(/ \(.*/, '')))].slice(0, 4).join(', ')}).`); next.push('Giảm bia rượu, nước ngọt, hải sản, nội tạng, lẩu vì acid uric của bạn đang cao.'); }
    if (D.wDays < 3 || D.aw < 2000) next.push('Uống nước khoảng 2–2,5 lít/ngày và ghi nước lọc trong app (acid uric đang cao).');
  }
  if (D.bw.length === 0 && !D.partial) next.push('Cân ít nhất 2 lần mỗi tuần, cùng giờ buổi sáng.');
  if (D.low.length) next.push(`Thêm bài cho ${D.low.slice(0, 3).join(', ')} (đang dưới mức set tối thiểu).`);
  if (deloadDue()) next.push('Đã tập nhiều tuần liên tục: cân nhắc một tuần nhẹ (Hồ sơ → Tuần nhẹ).');
  if (S.health.recheck) { const rc = Math.ceil((new Date(S.health.recheck + 'T12:00').getTime() - now) / DAY); if (rc <= 14) next.push(rc < 0 ? `Đã quá hạn tái khám ${-rc} ngày, hãy đặt lịch.` : `Tái khám sau ${rc} ngày, chuẩn bị đặt lịch.`); }
  if (!next.length) next.push('Duy trì nhịp hiện tại và cố tăng nhẹ tạ ở các bài đã đạt đủ reps.');
  D.good = good; D.bad = bad; D.next = next.slice(0, 4);
  return D;
}
function reportText(D) {
  const L = [`FitTrack · Tuần ${fmtD(D.ws)} – ${fmtD(D.we - DAY)}${D.partial ? ' (tạm tính)' : ''}`];
  if (D.score !== null) L.push(`Điểm tuần: ${D.score}/100`);
  L.push(`Tập: ${D.ss.length}/${D.P.weeklyGoal} buổi, ${D.sets} set, tổng tạ ${round(D.vol / 1000, 1)} tấn${D.pvol ? ' (' + pctCh(D.vol, D.pvol) + ' so với tuần trước)' : ''}${D.prs.length ? ', ' + D.prs.length + ' kỷ lục' : ''}`);
  if (D.cn) L.push(`Cardio: ${D.cn} buổi, ${round(D.km, 1)} km, ${Math.round(D.cmin)} phút${D.steps ? ', ~' + D.steps.toLocaleString('vi-VN') + ' bước' : ''}${D.runPace ? ', pace chạy ' + fmtPace(D.runPace) + '/km' : ''}`);
  if (D.valid) L.push(`Ăn uống: trung bình ${Math.round(D.ak)} kcal (mục tiêu ${D.T.kcal}), đạm ${Math.round(D.ap)}g (mục tiêu ${D.T.protein}g), ghi ${D.logged}/7 ngày`);
  if (D.bw.length) L.push(`Cân nặng: trung bình ${round(D.wavg, 1)} kg${D.pwavg ? ' (' + (D.wavg - D.pwavg >= 0 ? '+' : '') + round(D.wavg - D.pwavg, 1) + ' kg so với tuần trước)' : ''}`);
  L.push('Ưu tiên tuần tới:'); D.next.forEach((n, i) => L.push(`${i + 1}. ${n}`));
  return L.join('\n');
}
function vReport(key) {
  const cur = weekStart(Date.now()); let ws = key ? weekStart(new Date(key + 'T12:00').getTime()) : (weekHasData(cur - 7 * DAY) ? cur - 7 * DAY : cur);
  if (ws > cur) ws = cur; const D = reportData(ws); window.__rep = D;
  if (!D.partial && (S.reportSeen || '') < dk(ws)) { S.reportSeen = dk(ws); save(); }
  const st = D.score === null ? ['', 'Chưa đủ dữ liệu'] : D.score >= 80 ? ['', 'Rất tốt'] : D.score >= 60 ? ['', 'Tốt'] : D.score >= 40 ? ['', 'Trung bình'] : ['', 'Cần cải thiện'];
  const nav = `<div class="row"><a class="btn sm" href="#/report/${dk(ws - 7 * DAY)}">‹</a><div class="sp" style="text-align:center"><b>${fmtD(ws)} – ${fmtD(ws + 6 * DAY)}</b><div class="sub">${D.partial ? 'Tuần đang diễn ra (tạm tính)' : ws === cur - 7 * DAY ? 'Tuần vừa rồi' : 'Tuần đã qua'}</div></div>${ws < cur ? `<a class="btn sm" href="#/report/${dk(ws + 7 * DAY)}">›</a>` : '<span style="width:42px"></span>'}</div>`;
  if (!weekHasData(ws)) return `${head('Báo cáo tuần', '#/progress')}${nav}<div class="empty mt">Tuần này chưa có dữ liệu để tổng hợp.</div>`;
  const score = D.score === null ? `<div class="sub">Cần thêm dữ liệu (ít nhất 3 ngày ghi ăn đủ bữa) để chấm điểm.</div>` : `<div class="row"><b style="font-size:42px;letter-spacing:-.03em">${D.score}</b><span class="sub">/ 100 · ${st[1]}</span></div>${D.comp.map(c => `<div class="mt"><div class="row sub"><span class="sp">${c.n}</span><b>${Math.round(c.v * 100)}%</b></div><div class="bar"><i style="width:${Math.round(c.v * 100)}%"></i></div></div>`).join('')}`;
  const rhythm = `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;text-align:center">${D.days.map((d, i) => `<div style="opacity:${d.future ? .35 : 1}"><div class="sub">${['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i]}</div><div>${d.train ? '🏋️' : '·'}</div><div>${d.food ? '🍚' : '·'}</div><div>${d.water ? '💧' : '·'}</div><div>${d.weigh ? '⚖️' : '·'}</div></div>`).join('')}</div><div class="sub mt">🏋️ tập · 🍚 ghi ăn · 💧 ghi nước · ⚖️ cân</div>`;
  const stat = (v, l) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`;
  const train = `<div class="grid2">${stat(D.ss.length + '/' + D.P.weeklyGoal, 'Buổi tạ')}${stat(round(D.vol / 1000, 1) + 't', 'Tổng tạ ' + (D.pvol ? pctCh(D.vol, D.pvol) : ''))}${stat(D.sets, 'Tổng số set')}${stat(D.ss.length ? Math.round(D.dur) + ' phút' : '—', 'Thời lượng TB')}</div>
    <div class="sub mt">${D.feel ? 'Cảm giác TB: ' + ['😫', '😐', '🙂', '💪'][Math.max(0, Math.min(3, Math.round(D.feel) - 1))] + ' · ' : ''}${D.cn ? `Cardio: ${D.cn} buổi, ${round(D.km, 1)} km, ${Math.round(D.cmin)} phút ${D.pkm ? pctCh(D.km, D.pkm) : ''}${D.steps ? ' · ~' + D.steps.toLocaleString('vi-VN') + ' bước' : ''}${D.runPace ? ' · pace chạy ' + fmtPace(D.runPace) + '/km' + (D.pRunPace ? (D.runPace <= D.pRunPace ? ' (nhanh hơn tuần trước)' : ' (chậm hơn tuần trước)') : '') : ''}${D.longRun ? ' · chạy dài nhất ' + round(D.longRun, 1) + ' km' : ''}` : 'Chưa ghi cardio'}</div>
    ${D.prs.length ? `<div class="hint">🏆 Kỷ lục: ${D.prs.map(p => esc(exOf(p.id).name.replace(/ \(.*/, '')) + ' +' + round(p.pct, 1) + '%').join(', ')}</div>` : ''}`;
  const food = D.valid ? `<div class="grid2">${stat(Math.round(D.ak), 'kcal TB/ngày (mục tiêu ' + D.T.kcal + ')')}${stat(Math.round(D.ap) + 'g', 'Đạm TB (mục tiêu ' + D.T.protein + 'g)')}${stat(D.logged + '/7', 'Ngày có ghi ăn')}${stat(D.wDays ? Math.round(D.aw) + ' ml' : '—', 'Nước TB/ngày')}</div>${barChart(D.days.map((d, i) => ({ label: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i], v: Math.round(d.kc), cur: d.kc > 0 && Math.abs(d.kc - D.T.kcal) / D.T.kcal <= .1 })))}<div class="sub">Cột nổi bật là ngày nằm trong ±10% mục tiêu ${D.T.kcal} kcal.${D.pak ? ' Tuần trước trung bình ' + Math.round(D.pak) + ' kcal.' : ''}</div>` : `<div class="empty">Chưa đủ dữ liệu ăn uống (cần ít nhất 3 ngày ghi từ 800 kcal).</div>`;
  const body = D.bw.length ? `<div class="grid2">${stat(round(D.wavg, 1) + ' kg', 'Cân TB tuần (' + D.bw.length + ' lần cân)')}${stat(D.pwavg ? (D.wavg - D.pwavg >= 0 ? '+' : '') + round(D.wavg - D.pwavg, 1) + ' kg' : '—', 'So với tuần trước')}</div>${D.waist ? `<div class="sub mt">Vòng eo gần nhất: ${D.waist.waist} cm${D.pwaist ? ' (' + (D.waist.waist - D.pwaist.waist >= 0 ? '+' : '') + round(D.waist.waist - D.pwaist.waist, 1) + ' cm so với trước đó)' : ''}</div>` : ''}` : '<div class="empty">Tuần này chưa cân. Nên cân 2–3 lần/tuần, cùng giờ buổi sáng.</div>';
  const fl = hFlags(), hl = [];
  fl.forEach(x => hl.push(`${x.m.n} ${round(x.l.v, 2)} ${x.m.u} (${stInfo[x.st][0].toLowerCase()})`)); if (fattyLiver()) hl.push('Gan nhiễm mỡ độ I (siêu âm)');
  const health = S.health.records.length || S.health.imaging.length ? `${hl.length ? `<div>${hl.map(h => `<span class="chip warn">${esc(h)}</span>`).join(' ')}</div>` : '<span class="chip good">Chỉ số trong giới hạn</span>'}
    ${uricHigh() ? `<div class="sub mt">Acid uric cao: tuần này ${D.badFoods.length ? D.badFoods.length + ' lần ghi món/đồ uống cần hạn chế' : 'không ghi món cần hạn chế'}; nước ${D.wDays ? 'TB ' + Math.round(D.aw) + ' ml/ngày' : 'chưa ghi'} (mục tiêu 2000–2500 ml).</div>` : ''}${fattyLiver() ? `<div class="sub">Gan nhiễm mỡ: cân nặng tuần này ${D.bw.length ? 'TB ' + round(D.wavg, 1) + ' kg' : 'chưa ghi'}. Mục tiêu giảm 5–10% cân nặng.</div>` : ''}<a class="btn sm mt" href="#/health">Xem hồ sơ sức khoẻ</a>` : '<div class="sub">Chưa có hồ sơ sức khoẻ. <a href="#/health" style="text-decoration:underline">Thêm tại đây</a>.</div>';
  const insl = (arr, lvl, ic) => arr.map(t => `<div class="ins ${lvl}"><div class="sub">${ic} ${esc(t)}</div></div>`).join('');
  return `${head('Báo cáo tuần', '#/progress')}${nav}
  <div class="card"><div class="sub">Điểm tuần</div>${score}</div>
  <h2>Nhịp trong tuần</h2><div class="card">${rhythm}</div>
  ${D.good.length || D.bad.length ? `<h2>Nhận định</h2>${insl(D.good, 'good', '✅')}${insl(D.bad, 'warn', '⚠️')}` : ''}
  <h2>Tập luyện</h2><div class="card">${train}</div>
  <h2>Ăn uống</h2><div class="card">${food}</div>
  <h2>Cơ thể</h2><div class="card">${body}</div>
  <h2>Sức khoẻ</h2><div class="card">${health}</div>
  <h2>Ưu tiên cho tuần tới</h2>${D.next.map((n, i) => `<div class="ins"><b>${i + 1}.</b> <span class="sub">${esc(n)}</span></div>`).join('')}
  <div class="grid2 mt noprint"><button class="btn" data-a="repCopy">📋 Sao chép tóm tắt</button><button class="btn" data-a="repShare">📤 Chia sẻ</button><button class="btn" data-a="repPrint">🖨️ In / lưu PDF</button><button class="btn" data-a="repIcs">📅 Nhắc xem báo cáo</button></div>
  <div class="sub mt">Báo cáo tự tổng hợp từ dữ liệu bạn ghi. Bản sao chép và chia sẻ không gồm thông tin sức khoẻ. Ngày ghi ăn dưới 800 kcal không được tính.</div>`;
}

/* ---------- Thư viện bài ---------- */
function vExercises() {
  const groups = {}; allEx().forEach(e => (groups[e.g] = groups[e.g] || []).push(e));
  return `${head('Thư viện bài tập', '#/train')}${Object.entries(groups).map(([g, l]) => `<h2>${esc(g)}</h2><div class="card">${l.map(e => `<div class="item">${e.img ? `<img src="${e.img}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:10px" loading="lazy">` : ''}<div class="sp"><b>${esc(e.name)}</b><div class="sub">${esc(e.cue || '')}</div></div><span class="chip">${e.min}–${e.max}</span></div>`).join('')}</div>`).join('')}
  <h2>Thêm bài riêng</h2><div class="card"><label>Tên bài</label><input id="x-n"><label>Nhóm cơ</label><input id="x-g" placeholder="vd Ngực"><label>Loại</label><select id="x-t"><option value="machine">Có tạ (kg)</option><option value="bw">Tạ cơ thể</option><option value="time">Tính giây</option></select><button class="btn pri block mt" data-a="addEx2">Thêm</button></div>`;
}

/* ---------- Hồ sơ ---------- */
function vProfile() {
  const p = S.profile, t = targets(), hasDemo = S.sessions.some(s => s.demo);
  const f = (lb, path, extra = '') => `<div><label>${lb}</label><input data-in="pf" data-f="${path}" inputmode="decimal" value="${esc(p[path] || '')}" ${extra}></div>`;
  return `${head('Hồ sơ & mục tiêu')}<a class="btn block" href="#/health">🩺 Hồ sơ sức khoẻ (khám, xét nghiệm)</a><div class="card"><label>Tên</label><input data-in="pf" data-f="name" data-s="1" value="${esc(p.name)}">
  <div class="grid2"><div><label>Giới tính</label><select data-in="pf" data-f="sex" data-s="1"><option value="m" ${p.sex === 'm' ? 'selected' : ''}>Nam</option><option value="f" ${p.sex === 'f' ? 'selected' : ''}>Nữ</option></select></div>${f('Tuổi', 'age')}</div>
  <div class="grid3">${f('Cao (cm)', 'height')}${f('Nặng (kg)', 'weight')}${f('Mục tiêu (kg)', 'goalWeight')}</div>
  <label>Mục tiêu chính</label><select data-in="pf" data-f="goal" data-s="1"><option value="recomp" ${p.goal === 'recomp' ? 'selected' : ''}>Giảm mỡ và tăng cơ (recomp)</option><option value="giam-mo" ${p.goal === 'giam-mo' ? 'selected' : ''}>Giảm mỡ</option><option value="tang-co" ${p.goal === 'tang-co' ? 'selected' : ''}>Tăng cơ</option></select>
  <label>Mức vận động hằng ngày</label><select data-in="pf" data-f="activity"><option value="1.2" ${p.activity == 1.2 ? 'selected' : ''}>Ít (ngồi nhiều)</option><option value="1.375" ${p.activity == 1.375 ? 'selected' : ''}>Nhẹ (tập 1–3 buổi/tuần)</option><option value="1.55" ${p.activity == 1.55 ? 'selected' : ''}>Vừa (3–5 buổi/tuần)</option><option value="1.725" ${p.activity == 1.725 ? 'selected' : ''}>Cao (tập mỗi ngày)</option></select>
  <div class="grid2">${f('Mục tiêu buổi tạ/tuần', 'weeklyGoal')}${f('Nghỉ giữa set (giây)', 'rest')}</div></div>
  <h2>Mục tiêu hằng ngày (tự tính)</h2><div class="grid2"><div class="stat"><b id="tg-k">${t.kcal}</b><span>kcal/ngày (TDEE <span id="tg-t">${t.tdee}</span>)</span></div><div class="stat"><b id="tg-p">${t.protein}g</b><span>đạm/ngày</span></div></div>
  <div class="sub mt">Công thức Mifflin-St Jeor, chỉ mang tính tham khảo. Điều chỉnh theo cân nặng thực tế sau 2–3 tuần.</div>
  <h2>Dụng cụ tạ đơn</h2><div class="card"><div class="grid2"><div><label>Các mức tạ mỗi quả (kg đĩa)</label><input data-in="eq" data-f="dbOpts" value="${esc((S.equip.dbOpts || []).join(', '))}" placeholder="5, 10, 15"></div><div><label>Trọng lượng đòn mỗi quả (kg)</label><input data-in="eq" data-f="dbBar" inputmode="decimal" value="${S.equip.dbBar || 0}"></div></div>
  <div class="sub mt">Ví dụ bộ của bạn: 15 kg và 5 kg đĩa (chưa tính đòn). Gộp 20 kg đĩa rồi chia đều thành 2 quả 10 kg để tập hai tay cân bằng. Nhập khối lượng đòn nếu muốn app tính đúng tổng tạ nâng. Mức tạ kế tiếp trong danh sách là mức app gợi ý khi bạn đạt đủ reps.</div></div>
  <h2>Giao diện</h2><div class="card"><label>Màu chủ đạo</label><div class="sw">${ACCENTS.map(a => `<button class="${p.accent === a[0] ? 'on' : ''}" style="background:${a[0]}" data-a="accent" data-c="${a[0]}" aria-label="${a[2]}"></button>`).join('')}</div>
  <label>Chế độ</label><div class="days">${[['auto', 'Tự động'], ['light', 'Sáng'], ['dark', 'Tối']].map(m => `<button class="btn ${p.mode === m[0] ? 'on' : ''}" data-a="mode" data-m="${m[0]}">${m[1]}</button>`).join('')}</div></div>
  <h2>Nhắc lịch tập</h2><div class="card"><div class="row"><span class="sp">Bật nhắc tập</span><button class="btn sm ${S.remind.on ? 'pri' : ''}" data-a="rmToggle">${S.remind.on ? 'Đang bật' : 'Đang tắt'}</button></div>
  <label>Ngày tập dự kiến</label><div class="days">${['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((n, i) => `<button class="btn ${S.remind.days.includes(i) ? 'on' : ''}" data-a="rmDay" data-d="${i}">${n}</button>`).join('')}</div>
  <label>Giờ nhắc</label><input type="time" data-in="rmTime" value="${esc(S.remind.time)}">
  <button class="btn block mt" data-a="ics">📅 Thêm vào lịch điện thoại (nhắc đáng tin cậy)</button>
  <div class="sub mt">Web app không thể tự nhắc khi đã đóng hẳn. Cách chắc chắn nhất là thêm vào lịch (nút trên, lịch sẽ báo trước 10 phút). Khi app đang mở, app cũng gửi thông báo nếu bạn cho phép.</div></div>
  <h2>Tuần nhẹ (deload)</h2><div class="card">${deloadActive() ? `<b>🌿 Đang trong tuần nhẹ</b><div class="sub">Tạ giảm ~10%, bớt 1 set. Tự kết thúc sau 7 ngày.</div><button class="btn block mt" data-a="dlStop">Kết thúc sớm</button>` : `<div>Đã tập <b>${trainingWeeks()}</b> tuần từ lần nghỉ nhẹ gần nhất.${deloadDue() ? ' <span class="chip">Nên nghỉ nhẹ</span>' : ''}</div><div class="sub">Cứ vài tuần tập nặng nên có một tuần giảm tải để cơ, khớp và thần kinh phục hồi.</div><button class="btn pri block mt" data-a="dlStart">Bắt đầu tuần nhẹ</button>`}
  <label>Gợi ý sau mỗi (tuần)</label><input inputmode="numeric" data-in="dlEvery" value="${S.deload.every}"></div>
  <h2>Đồng bộ giữa các máy</h2>${syncCard()}
  <h2>Dữ liệu</h2><div class="card"><button class="btn block" data-a="export">Xuất sao lưu (JSON)</button><label class="btn block mt" style="margin:12px 0 0">Nhập sao lưu<input type="file" accept="application/json" data-in="import" hidden></label>
  <button class="btn block mt" data-a="demo">${hasDemo ? 'Xoá dữ liệu demo' : 'Nạp dữ liệu demo để xem thử'}</button><button class="btn block danger mt" data-a="wipe">Xoá toàn bộ dữ liệu</button></div>
  <div class="sub mt">Mọi dữ liệu nằm trên điện thoại của bạn, không gửi đi đâu. Hãy xuất sao lưu thỉnh thoảng.</div>`;
}
function demoData() {
  const now = Date.now(), r = ['push', 'pull', 'legs'];
  for (let i = 0; i < 9; i++) {
    const rt = S.routines.find(x => x.id === r[i % 3]); if (!rt) continue; const date = now - (27 - i * 3) * DAY;
    const exs = rt.ex.map(e => { const ex = exOf(e.id); const w = ex.type === 'machine' ? 20 + i * 1.25 : 0; return { id: e.id, sets: Array.from({ length: e.sets }, () => ({ w, r: ex.type === 'time' ? 40 + i * 2 : ex.min + (i % 4) })) }; });
    S.sessions.push({ id: uid(), demo: 1, date, routineId: rt.id, name: rt.name, dur: 3000, exs, vol: exs.reduce((t, e) => t + e.sets.reduce((u, s) => u + s.w * s.r, 0), 0) });
  }
  for (let i = 0; i < 6; i++) S.cardio.push({ id: uid(), demo: 1, date: now - (26 - i * 4) * DAY, type: 'run', km: 2 + i * .5, min: 14 + i * 4 });
  for (let i = 0; i < 8; i++) S.body.push({ id: uid(), demo: 1, date: now - (28 - i * 4) * DAY, weight: round(72 - i * .4, 1), waist: round(84 - i * .5, 1) });
  S.sessions.sort((a, b) => a.date - b.date);
}

/* ---------- Router ---------- */
function render() {
  const route = location.hash.slice(1) || '/', [, a, b] = route.split('/');
  let html;
  switch (a || '') {
    case '': html = vHome(); break; case 'train': html = vTrain(); break; case 'workout': html = vWorkout(); break;
    case 'routine': html = vRoutine(b); break; case 'cardio': html = vCardio(); break; case 'body': html = vBody(); break;
    case 'food': html = vFood(); break; case 'progress': html = vProgress(); break; case 'exercises': html = vExercises(); break;
    case 'profile': html = vProfile(); break; case 'health': html = vHealth(); break; case 'report': html = vReport(b); break; default: html = vHome();
  }
  if (html !== '') { $('#app').innerHTML = html; window.scrollTo(0, 0); if (a === 'body') loadPhotos(); if (a === 'health') loadDocs(); }
  drawNav(route); trkTick();
}
window.addEventListener('hashchange', render);

/* ---------- Sự kiện ---------- */
const rerender = () => { const y = window.scrollY; render(); window.scrollTo(0, y); };
const curRoutine = () => S.routines.find(x => x.id === (location.hash.split('/')[2]));
const A = {
  start: el => startRoutine(el.dataset.id),
  chk(el) { const s = S.active.exs[+el.dataset.i].sets[+el.dataset.j]; s.done = !s.done; save();
    if (s.done) { const ex = exOf(S.active.exs[+el.dataset.i].id); startRest(S.profile.rest + (ex.big ? 30 : 0)); } rerender(); },
  dbw(el) { S.active.exs[+el.dataset.i].sets.forEach(s => { if (!s.done) s.w = +el.dataset.v; }); save(); rerender(); },
  addSet(el) { const e = S.active.exs[+el.dataset.i], l = e.sets[e.sets.length - 1] || { w: 0, r: 10 }; e.sets.push({ w: l.w, r: l.r, done: false }); save(); rerender(); },
  rmSet(el) { const e = S.active.exs[+el.dataset.i]; e.sets.splice(+el.dataset.j, 1); save(); rerender(); },
  rmEx(el) { if (confirm('Bỏ bài này khỏi buổi tập?')) { S.active.exs.splice(+el.dataset.i, 1); save(); rerender(); } },
  addEx: () => openPicker(id => { S.active.exs.push(buildEx(id)); save(); closeModal(); rerender(); }),
  finish: finishWorkout,
  feel(el) { const v = +el.dataset.v; S.active.feel = S.active.feel === v ? 0 : v; save(); rerender(); },
  cancel() { if (confirm('Huỷ buổi tập? Dữ liệu buổi này sẽ mất.')) { S.active = null; save(); stopRest(); location.hash = '#/'; } },
  closeDone() { closeModal(); location.hash = '#/'; },
  closeModal,
  restAdd() { if (rest) { rest.end += 15000; tickRest(); } }, restStop: stopRest,
  pick(el) { pickCb && pickCb(el.dataset.id); },
  delSession(el) { if (confirm('Xoá buổi tập này?')) { S.sessions = S.sessions.filter(s => s.id !== el.dataset.id); save(); rerender(); } },
  setsInc(el) { curRoutine().ex[+el.dataset.i].sets++; save(); rerender(); },
  setsDec(el) { const e = curRoutine().ex[+el.dataset.i]; e.sets = Math.max(1, e.sets - 1); save(); rerender(); },
  rtUp(el) { const r = curRoutine().ex, i = +el.dataset.i; if (i > 0) { [r[i - 1], r[i]] = [r[i], r[i - 1]]; save(); rerender(); } },
  rtRm(el) { curRoutine().ex.splice(+el.dataset.i, 1); save(); rerender(); },
  rtAdd: () => openPicker(id => { curRoutine().ex.push({ id, sets: 3 }); save(); closeModal(); rerender(); }),
  rtDel() { if (confirm('Xoá buổi tập này?')) { S.routines = S.routines.filter(r => r.id !== curRoutine().id); save(); location.hash = '#/train'; } },
  addCardio() {
    const km = num($('#c-km').value), min = num($('#c-min').value); if (!min) return toast('Nhập thời gian (phút)');
    S.cardio.push({ id: uid(), date: Date.now(), type: $('#c-type').value, km, min }); save(); toast('Đã lưu'); rerender();
  },
  delCardio(el) { S.cardio = S.cardio.filter(c => c.id !== el.dataset.id); try { idbDo('readwrite', s => s.delete('route-' + el.dataset.id)); } catch (e) {} save(); rerender(); },
  async trkStart() {
    if (!navigator.geolocation) return toast('Trình duyệt này không hỗ trợ GPS');
    TR = { type: $('#trk-type').value, start: Date.now(), points: [], dist: 0, pausedMs: 0, status: 'tracking', gap: false }; trkSave(true); trkWatch(); wlOn(); lastTouch = Date.now(); rerender();
  },
  trkPause() { TR.status = 'paused'; TR.pauseStart = Date.now(); stopWatch(); wlOff(); trkSave(true); rerender(); },
  trkResume() { const n = Date.now(); TR.pausedMs = (TR.pausedMs || 0) + (TR.status === 'paused' ? n - TR.pauseStart : n - (TR.seen || n)); TR.status = 'tracking'; TR.gap = true; delete TR.pauseStart; trkWatch(); wlOn(); lastTouch = n; trkSave(true); rerender(); },
  trkDiscard() { if (!confirm('Bỏ buổi này? Dữ liệu sẽ mất.')) return; stopWatch(); wlOff(); hideDim(); trkClear(); rerender(); },
  async trkFinish() {
    if (!confirm('Kết thúc và lưu buổi này?')) return; const st = trkStats(), type = TR.type, start = TR.start, pts = TR.points, gaps = TR.interrupted; stopWatch(); wlOff(); hideDim();
    const km = round(st.km, 2), min = Math.max(1, Math.round(st.el / 60)); trkClear();
    if (km < 0.05) { toast('Quãng đường quá ngắn (dưới 50 m), đã bỏ buổi này'); return rerender(); }
    const id = uid(), route = routeOf(pts); S.cardio.push({ id, date: start, type, km, min, steps: st.steps, src: 'gps', ...(route.length > 1 ? { route: 1 } : {}), ...(gaps ? { gaps: 1 } : {}) }); save();
    if (route.length > 1) { try { await idbDo('readwrite', s => s.put({ id: 'route-' + id, kind: 'route', date: start, pts: route })); } catch (e) {} }
    toast(`Đã lưu ${km} km · ${fmtPace(min / km)}/km`); rerender();
  },
  dimNow: showDim,
  async routeView(el) { try { const r = await idbDo('readonly', s => s.get('route-' + el.dataset.id)); const c = S.cardio.find(x => x.id === el.dataset.id); modal(`<div class="row"><b class="sp">Lộ trình ${c ? fmtD(c.date) : ''}</b><button class="btn sm" data-a="closeModal">Đóng</button></div><div class="mt">${r && r.pts ? routeSvg(r.pts) : '<div class="empty">Không có lộ trình trên máy này (lộ trình không đồng bộ giữa các máy).</div>'}</div><div class="sub mt">🟢 điểm xuất phát · 🔴 điểm kết thúc. Lộ trình chỉ lưu trên máy ghi.</div>`); } catch (e) { toast('Không đọc được lộ trình'); } },
  async impDo() {
    const sel = IMP.filter(a => a.on && !a.bad); let n = 0;
    for (const a of sel) { const id = uid(), min = Math.max(1, Math.round(a.min)), km = round(a.km, 2); S.cardio.push({ id, date: a.start, type: a.type, km, min, steps: strideOf(a.type) ? Math.round(km * 1000 / strideOf(a.type)) : 0, src: 'file', ...(a.hr ? { hr: Math.round(a.hr) } : {}), ...(a.route.length > 1 ? { route: 1 } : {}) }); n++;
      if (a.route.length > 1) { try { await idbDo('readwrite', s => s.put({ id: 'route-' + id, kind: 'route', date: a.start, pts: a.route })); } catch (e) {} } }
    S.cardio.sort((a, b) => a.date - b.date); save(); closeModal(); toast(n ? `Đã nhập ${n} buổi` : 'Chưa chọn buổi nào'); rerender();
  },
  addBody() {
    const weight = num($('#b-w').value), waist = num($('#b-waist').value), fat = num($('#b-fat').value); if (!weight && !waist && !fat) return toast('Nhập ít nhất một số đo');
    S.body.push({ id: uid(), date: Date.now(), weight, waist, fat }); if (weight) S.profile.weight = weight; save(); toast('Đã lưu'); rerender();
  },
  delBody(el) { S.body = S.body.filter(b => b.id !== el.dataset.id); save(); rerender(); },
  addFood(el) {
    openFood(el.dataset.n);
  },
  cat(el) { foodCat = el.dataset.c; rerender(); },
  foodAdd() {
    const f = foodSel, gi = $('#fm-g'); let q = gi ? num(gi.value) / f.g : num($('#fm-q').value); if (!f || q <= 0) return toast('Nhập số lượng');
    if (f.w) { waterAdd(Math.round(q * f.g), $('#fm-t').value || nowT()); save(); closeModal(); toast('Đã cộng ' + Math.round(q * f.g) + ' ml nước'); rerender(); return; }
    const l = (S.food[foodDay] = S.food[foodDay] || []), t = $('#fm-t').value || nowT(), ex = l.find(x => x.n === f.n && !!x.sg === !!f.g && x.t === t);
    if (ex) { ex.q = round(ex.q + q, 3); if (ex.sg) ex.gr = round(ex.q * ex.sg); } else l.push({ n: f.n, k: f.k, p: f.p, t, ...(f.pur ? { pur: 1 } : {}), ...(f.alc ? { alc: 1 } : {}), q: round(q, 4), ...(f.g ? { sg: f.g, gr: round(q * f.g), ...(f.ml ? { ml: 1 } : {}) } : {}) });
    save(); closeModal(); toast('Đã thêm'); rerender();
  },
  addCustomFood() {
    const n = $('#f-n').value.trim(), k = num($('#f-k').value), p = num($('#f-p').value); if (!n || !k) return toast('Nhập tên và kcal');
    if (foodPool().some(x => x.n.toLowerCase() === n.toLowerCase())) return toast('Món này đã có'); const g = num($('#f-g').value); S.customFoods.push({ n, k, p, ...(g ? { g } : {}) }); (S.food[foodDay] = S.food[foodDay] || []).push({ n, k, p, t: foodDay === dk() ? nowT() : '12:00', q: 1, ...(g ? { sg: g, gr: g } : {}) }); save(); rerender();
  },
  delCustomFood(el) { S.customFoods.splice(+el.dataset.i, 1); save(); rerender(); },
  qty(el) { const f = foodOf(foodDay)[+el.dataset.i], dir = +el.dataset.v > 0 ? 1 : -1; if (f.sg) { f.gr = Math.max(10, (f.gr || round(f.q * f.sg)) + dir * 10); f.q = f.gr / f.sg; } else f.q = Math.max(.5, f.q + dir * .5); save(); rerender(); },
  delFood(el) { foodOf(foodDay).splice(+el.dataset.i, 1); save(); rerender(); },
  water(el) {
    const v = +el.dataset.v;
    if (v > 0) waterAdd(v, foodDay === dk() ? nowT() : '12:00');
    else { const l = S.waterLog[foodDay] || []; if (l.length) { const w = l.pop(); S.water[foodDay] = Math.max(0, (S.water[foodDay] || 0) - w.ml); } else S.water[foodDay] = Math.max(0, (S.water[foodDay] || 0) + v); }
    save(); rerender();
  },
  waterDel(el) { const l = S.waterLog[foodDay] || [], i = l.findIndex(w => w.id === el.dataset.id); if (i < 0) return; S.water[foodDay] = Math.max(0, (S.water[foodDay] || 0) - l[i].ml); l.splice(i, 1); save(); rerender(); },
  dayPrev() { foodDay = dk(new Date(foodDay + 'T12:00').getTime() - DAY); rerender(); },
  dayNext() { if (foodDay < dk()) { foodDay = dk(new Date(foodDay + 'T12:00').getTime() + DAY); rerender(); } },
  addEx2() {
    const n = $('#x-n').value.trim(); if (!n) return toast('Nhập tên bài');
    const type = $('#x-t').value; S.customEx.push({ id: 'c-' + uid(), name: n, g: $('#x-g').value.trim() || 'Khác', type, min: type === 'time' ? 30 : 8, max: type === 'time' ? 90 : 12, cue: 'Bài tự thêm.' }); save(); rerender();
  },
  export() {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' })); a.download = 'fittrack-' + dk() + '.json'; a.click();
  },
  demo() {
    if (S.sessions.some(s => s.demo)) { ['sessions', 'cardio', 'body'].forEach(k => S[k] = S[k].filter(x => !x.demo)); } else demoData();
    save(); rerender();
  },
  accent(el) { S.profile.accent = el.dataset.c; save(); applyTheme(); rerender(); },
  mode(el) { S.profile.mode = el.dataset.m; save(); applyTheme(); rerender(); },
  rmDay(el) { const d = +el.dataset.d, l = S.remind.days; S.remind.days = l.includes(d) ? l.filter(x => x !== d) : [...l, d].sort(); save(); rerender(); },
  async rmToggle() {
    S.remind.on = !S.remind.on;
    if (S.remind.on && 'Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (e) {} }
    save(); schedNotif(); rerender();
  },
  ics() {
    const R = S.remind; if (!R.days.length) return toast('Chọn ít nhất một ngày');
    const [hh, mm] = R.time.split(':'), N = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'], now = new Date();
    const ev = R.days.map(d => { const t = new Date(now); t.setDate(t.getDate() + (d - t.getDay() + 7) % 7);
      const ds = t.getFullYear() + String(t.getMonth() + 1).padStart(2, '0') + String(t.getDate()).padStart(2, '0') + 'T' + hh.padStart(2, '0') + mm.padStart(2, '0') + '00';
      return ['BEGIN:VEVENT', 'UID:fittrack-' + d + '@local', 'DTSTAMP:' + ds, 'DTSTART:' + ds, 'DURATION:PT1H', 'RRULE:FREQ=WEEKLY;BYDAY=' + N[d], 'SUMMARY:Đến giờ tập FitTrack 💪', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Đến giờ tập', 'TRIGGER:-PT10M', 'END:VALARM', 'END:VEVENT'].join('\r\n'); });
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//FitTrack VN//VI\r\n' + ev.join('\r\n') + '\r\nEND:VCALENDAR'], { type: 'text/calendar' })); a.download = 'fittrack-lich-tap.ics'; a.click();
  },
  dlStart() { S.deload.on = true; S.deload.start = Date.now(); save(); toast('Bắt đầu tuần nhẹ'); rerender(); },
  dlStop() { S.deload.on = false; S.deload.last = Date.now(); save(); rerender(); },
  photoView(el) {
    const p = photos.find(x => x.id === el.dataset.id); if (!p) return;
    modal(`<div class="row"><b class="sp">${fmtD(p.date)} · ${esc(p.label)}</b><button class="btn sm" data-a="closeModal">Đóng</button></div><img src="${p.url}" alt="" style="width:100%;border-radius:14px;margin-top:10px"><button class="btn danger block mt" data-a="photoDel" data-id="${p.id}">Xoá ảnh này</button>`);
  },
  async photoDel(el) { if (!confirm('Xoá ảnh này?')) return; await idbDo('readwrite', s => s.delete(el.dataset.id)); closeModal(); loadPhotos(); },
  photoCmp() {
    const last = photos[photos.length - 1], l = photos.filter(p => p.label === last.label); if (l.length < 2) return toast('Cần ít nhất 2 ảnh cùng góc "' + last.label + '"');
    const a = l[0], b = l[l.length - 1];
    modal(`<div class="row"><b class="sp">Góc: ${esc(last.label)}</b><button class="btn sm" data-a="closeModal">Đóng</button></div><div class="grid2 mt">${[a, b].map((p, i) => `<div><img src="${p.url}" alt="" style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:12px"><div class="sub" style="text-align:center">${i ? 'Mới nhất' : 'Đầu tiên'} · ${fmtD(p.date)}</div></div>`).join('')}</div><div class="sub mt">Cách nhau ${Math.round((b.date - a.date) / DAY)} ngày.</div>`);
  },
  async syConnect() {
    const t = $('#sy-token').value.trim(); if (!t) return toast('Dán mã truy cập vào ô trên');
    SY = { token: t }; saveSY(); SY.msg = 'Đang kết nối...'; rerender(); await syncNow(true); rerender();
  },
  async syNow() { await syncNow(true); rerender(); },
  syOff() { if (confirm('Ngắt đồng bộ trên máy này? Dữ liệu trên máy vẫn giữ nguyên.')) { SY = {}; saveSY(); rerender(); } },
  hAdd() {
    const k = $('#h-m').value, v = num($('#h-v').value), dstr = $('#h-date').value; if (!v) return toast('Nhập giá trị');
    const t = new Date((dstr || dk()) + 'T12:00:00').getTime(), H = S.health; let r = H.records.find(x => dk(x.date) === dk(t));
    if (!r) { r = { id: uid(), date: t, v: {} }; H.records.push(r); } r.v[k] = v; save(); toast('Đã lưu'); rerender();
  },
  hDel(el) { const r = S.health.records.find(x => x.id === el.dataset.r); if (!r || !confirm('Xoá chỉ số này?')) return; delete r.v[el.dataset.k]; if (!Object.keys(r.v).length) S.health.records = S.health.records.filter(x => x !== r); save(); rerender(); },
  iAdd() {
    const title = $('#i-title').value.trim(), text = $('#i-text').value.trim(); if (!title || !text) return toast('Nhập tên và kết luận');
    S.health.imaging.push({ id: uid(), date: new Date(($('#i-date').value || dk()) + 'T12:00:00').getTime(), title, conclusion: text }); save(); rerender();
  },
  iDel(el) { S.health.imaging = S.health.imaging.filter(i => i.id !== el.dataset.id); save(); rerender(); },
  nAdd() { const t = $('#n-text').value.trim(); if (!t) return toast('Nhập lời dặn'); S.health.notes.push({ id: uid(), date: Date.now(), text: t }); save(); rerender(); },
  nDel(el) { S.health.notes = S.health.notes.filter(n => n.id !== el.dataset.id); save(); rerender(); },
  docView(el) {
    const p = docs.find(x => x.id === el.dataset.id); if (!p) return;
    modal(`<div class="row"><b class="sp">${esc(p.label)}</b><button class="btn sm" data-a="closeModal">Đóng</button></div>${p.blob.type === 'application/pdf' ? `<a class="btn pri block mt" href="${p.url}" target="_blank" rel="noopener">Mở PDF</a>` : `<img src="${p.url}" alt="" style="width:100%;border-radius:12px;margin-top:10px">`}`);
  },
  async docDel(el) { if (!confirm('Xoá tài liệu này?')) return; await idbDo('readwrite', s => s.delete(el.dataset.id)); loadDocs(); },
  async repCopy() { const t = reportText(window.__rep); try { await navigator.clipboard.writeText(t); toast('Đã sao chép tóm tắt'); } catch (e) { prompt('Sao chép nội dung dưới đây:', t); } },
  async repShare() { const t = reportText(window.__rep); if (navigator.share) { try { await navigator.share({ title: 'Báo cáo tuần FitTrack', text: t }); } catch (e) {} } else A.repCopy(); },
  repPrint() { window.print(); },
  repIcs() {
    const n = new Date(); n.setDate(n.getDate() + (8 - n.getDay()) % 7 || 7); const ds = n.getFullYear() + String(n.getMonth() + 1).padStart(2, '0') + String(n.getDate()).padStart(2, '0') + 'T080000';
    const ev = ['BEGIN:VEVENT', 'UID:fittrack-report@local', 'DTSTAMP:' + ds, 'DTSTART:' + ds, 'DURATION:PT15M', 'RRULE:FREQ=WEEKLY;BYDAY=MO', 'SUMMARY:Xem báo cáo tuần FitTrack 📊', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Báo cáo tuần đã sẵn sàng', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT'].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//FitTrack VN//VI\r\n' + ev + '\r\nEND:VCALENDAR'], { type: 'text/calendar' })); a.download = 'fittrack-bao-cao-tuan.ics'; a.click();
  },
  wipe() { if (confirm('Xoá TOÀN BỘ dữ liệu? Không thể hoàn tác.' + (SY.token ? ' Dữ liệu đồng bộ trên GitHub cũng sẽ bị xoá.' : '')) && confirm('Chắc chắn chứ?')) { S = defaults(); save(); applyTheme(); stopRest(); try { idbDo('readwrite', s => s.clear()); } catch (e) {} rerender(); } },
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el || !A[el.dataset.a]) return;
  if (el.tagName === 'BUTTON' && el.disabled) return; A[el.dataset.a](el, e);
});
function onInput(e, committed) {
  const el = e.target, k = el.dataset.in; if (!k) return;
  if (committed && (k === 'fq' || k === 'pq')) return; // tránh vẽ lại danh sách giữa lúc đang chạm
  if (k === 'note') { S.active.note = el.value; save(); }
  else if (k === 'ws') { const s = S.active.exs[+el.dataset.i].sets[+el.dataset.j]; s[el.dataset.f] = el.value; save(); }
  else if (k === 'fm') fmUpdate(el.dataset.f);
  else if (k === 'rt') { curRoutine()[el.dataset.f] = el.value; save(); }
  else if (k === 'pq') { pickQ = el.value; $('#plist').innerHTML = pickList(allEx().filter(x => !pickQ || fold(x.name + x.g).includes(fold(pickQ)))); }
  else if (k === 'fq') { foodQ = el.value; $('#flist').innerHTML = foodButtons(); }
  else if (committed && k === 'pf') { const f = el.dataset.f; S.profile[f] = el.dataset.s ? el.value : num(el.value); S.profile.weight = S.profile.weight || 70; save(); const t = targets(); if ($('#tg-k')) { $('#tg-k').textContent = t.kcal; $('#tg-t').textContent = t.tdee; $('#tg-p').textContent = t.protein + 'g'; } }
  else if (committed && k === 'photo') {
    const fl = el.files[0]; if (!fl) return; const label = $('#ph-label').value;
    shrink(fl).then(blob => idbDo('readwrite', s => s.put({ id: uid(), date: Date.now(), label, blob }))).then(() => { toast('Đã lưu ảnh'); loadPhotos(); }).catch(() => toast('Không lưu được ảnh'));
  }
  else if (committed && k === 'eq') { if (el.dataset.f === 'dbOpts') { const l = String(el.value).split(/[,;\s]+/).map(Number).filter(x => x > 0); if (l.length) S.equip.dbOpts = [...new Set(l)].sort((a, b) => a - b); } else S.equip.dbBar = Math.max(0, num(el.value)); save(); }
  else if (committed && k === 'stime') { const x = S.sessions.find(y => y.id === el.dataset.id), v = new Date(el.value).getTime(); if (x && v && v <= Date.now() + 60000) { x.date = v; S.sessions.sort((a, b) => a.date - b.date); save(); rerender(); } }
  else if (committed && k === 'wtime') { const w = (S.waterLog[foodDay] || []).find(x => x.id === el.dataset.id); if (w && el.value) { w.t = el.value; save(); } }
  else if (committed && k === 'wstart') { const v = new Date(el.value).getTime(); if (v && v <= Date.now() + 60000 && S.active) { S.active.start = v; save(); } }
  else if (committed && k === 'ftime') { const f = foodOf(foodDay)[+el.dataset.i]; if (f && el.value) { f.t = el.value; save(); } }
  else if (committed && k === 'dimAuto') { try { localStorage.setItem('fittrack-dim', el.checked ? '1' : '0'); } catch (e) {} }
  else if (committed && k === 'impck') { IMP[+el.dataset.i].on = el.checked; }
  else if (committed && k === 'imptype') { IMP[+el.dataset.i].type = el.value; }
  else if (committed && k === 'gpx') {
    const fls = [...el.files]; if (!fls.length) return; IMP = [];
    Promise.all(fls.map(async f => { try { return parseActivities(await f.text(), f.name); } catch (e) { toast('Không đọc được ' + f.name + ' (cần GPX hoặc TCX)'); return []; } })).then(r => {
      IMP = r.flat().map(a => ({ ...a, bad: !a.start || a.km < 0.05 || a.min <= 0, dup: !!a.start && S.cardio.some(c => Math.abs(c.date - a.start) < 120000) })); IMP.forEach(a => a.on = !a.bad && !a.dup); impModal();
    });
  }
  else if (committed && k === 'hMarker') { window.__hm = el.value; rerender(); }
  else if (committed && k === 'hRecheck') { S.health.recheck = el.value; save(); }
  else if (committed && k === 'hdoc') {
    const fl = el.files[0]; if (!fl) return; const label = ($('#d-title').value || '').trim() || fl.name;
    (fl.type === 'application/pdf' ? Promise.resolve(fl) : shrink(fl, 1800)).then(blob => idbDo('readwrite', s => s.put({ id: uid(), date: Date.now(), label, kind: 'doc', blob }))).then(() => { toast('Đã lưu tài liệu'); loadDocs(); }).catch(() => toast('Không lưu được tài liệu'));
  }
  else if (committed && k === 'himport') {
    const fl = el.files[0]; if (!fl) return; const r = new FileReader();
    r.onload = () => { try {
      const d = JSON.parse(r.result), h = d.health || d, H = S.health; let n = 0;
      (h.records || []).forEach(x => { const t = typeof x.date === 'number' ? x.date : new Date(x.date + 'T12:00:00').getTime(); let rec = H.records.find(y => dk(y.date) === dk(t)); if (!rec) { rec = { id: uid(), date: t, v: {} }; H.records.push(rec); } Object.assign(rec.v, x.v); n++; });
      (h.imaging || []).forEach(x => { const t = typeof x.date === 'number' ? x.date : new Date(x.date + 'T12:00:00').getTime(); if (!H.imaging.some(y => dk(y.date) === dk(t) && y.title === x.title)) H.imaging.push({ id: uid(), date: t, title: x.title, conclusion: x.conclusion }); });
      (h.notes || []).forEach(x => { if (!H.notes.some(y => y.text === x.text)) H.notes.push({ id: uid(), date: Date.now(), text: x.text }); });
      if (h.recheck) H.recheck = h.recheck; save(); toast('Đã nhập hồ sơ sức khoẻ'); rerender();
    } catch (e) { toast('File không hợp lệ'); } }; r.readAsText(fl);
  }
  else if (committed && k === 'rmTime') { if (el.value) { S.remind.time = el.value; save(); schedNotif(); } }
  else if (committed && k === 'dlEvery') { S.deload.every = Math.max(2, Math.round(num(el.value)) || 6); save(); rerender(); }
  else if (committed && k === 'progEx') { progEx = el.value; rerender(); }
  else if (committed && k === 'import') {
    const fl = el.files[0]; if (!fl) return; const r = new FileReader();
    r.onload = () => { try { const d = JSON.parse(r.result); if (!d.profile || !d.sessions) throw 0; S = { ...defaults(), ...d, health: { ...defaults().health, ...d.health }, seeded: d.seeded || [] }; migrate(); save(); applyTheme(); toast('Đã nhập dữ liệu'); rerender(); } catch (x) { toast('File không hợp lệ'); } }; r.readAsText(fl);
  }
}
document.addEventListener('input', e => onInput(e, false));
document.addEventListener('change', e => onInput(e, true));

/* ---------- Đồng bộ qua GitHub Gist riêng tư ---------- */
const SK = 'fittrack-sync-v1', GFILE = 'fittrack-data.json', GDESC = 'FitTrack VN sync';
let SY = (() => { try { return JSON.parse(localStorage.getItem(SK)) || {}; } catch (e) { return {}; } })();
const saveSY = () => { try { localStorage.setItem(SK, JSON.stringify({ token: SY.token, gistId: SY.gistId, last: SY.last })); } catch (e) {} };
let syncing = false, pushT = null;
function schedPush() { if (!SY.token) return; clearTimeout(pushT); pushT = setTimeout(() => syncNow(false), 4000); }
const GH = async (path, opt = {}) => {
  const r = await fetch('https://api.github.com' + path, { ...opt, headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + SY.token, 'Content-Type': 'application/json' } });
  if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
  return r.json();
};
const payload = () => JSON.stringify({ ...S, active: null });
async function syncNow(manual) {
  if (!SY.token || syncing) return; syncing = true;
  try {
    if (!SY.gistId) {
      const list = await GH('/gists?per_page=100'); const g = list.find(x => x.description === GDESC && x.files && x.files[GFILE]);
      if (g) SY.gistId = g.id; else { const c = await GH('/gists', { method: 'POST', body: JSON.stringify({ description: GDESC, public: false, files: { [GFILE]: { content: payload() } } }) }); SY.gistId = c.id; SY.last = Date.now(); SY.msg = 'Đã tạo kho đồng bộ và tải dữ liệu lên'; saveSY(); return; }
      saveSY();
    }
    const g = await GH('/gists/' + SY.gistId), f = g.files && g.files[GFILE]; let remote = null;
    if (f) remote = JSON.parse(f.truncated ? await (await fetch(f.raw_url)).text() : f.content);
    const ru = remote ? remote.updated || 0 : 0, lu = S.updated || 0; let pull = false, push = false;
    if (remote && !SY.last) { // lần đầu kết nối máy này mà đã có dữ liệu trên GitHub
      if (confirm('Đã có dữ liệu trên GitHub (cập nhật ' + new Date(ru).toLocaleString('vi-VN') + ').\n\nOK = tải về máy này (ghi đè dữ liệu trên máy)\nHuỷ = ghi đè GitHub bằng dữ liệu trên máy này')) pull = true; else push = true;
    } else if (remote && ru > lu) {
      if (lu > (SY.last || 0) && !confirm('Cả hai máy đều có thay đổi mới.\n\nOK = dùng dữ liệu từ GitHub (bỏ thay đổi trên máy này)\nHuỷ = giữ dữ liệu máy này và ghi đè GitHub')) push = true; else pull = true;
    } else if (!remote || lu > ru) push = true;
    if (pull) {
      const act = S.active; S = { ...defaults(), ...remote, profile: { ...defaults().profile, ...remote.profile }, remind: { ...defaults().remind, ...remote.remind }, deload: { ...defaults().deload, ...remote.deload }, health: { ...defaults().health, ...remote.health }, seeded: remote.seeded || [], active: act }; migrate();
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} applyTheme(); SY.msg = 'Đã tải dữ liệu mới từ GitHub';
      if (!/^#\/(workout|routine)/.test(location.hash) && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) render();
    } else if (push) {
      await GH('/gists/' + SY.gistId, { method: 'PATCH', body: JSON.stringify({ files: { [GFILE]: { content: payload() } } }) }); SY.msg = 'Đã đẩy dữ liệu lên GitHub';
    } else SY.msg = 'Đã đồng bộ, không có thay đổi';
    SY.last = Date.now(); saveSY();
  } catch (e) {
    SY.msg = e.status === 401 ? 'Mã truy cập sai hoặc hết hạn, hãy tạo mã mới.' : e.status === 403 || e.status === 404 ? 'Mã không có quyền gist hoặc kho đồng bộ đã bị xoá.' : 'Chưa đồng bộ được (có thể đang offline). Sẽ thử lại.';
    if (e.status === 404) { SY.gistId = undefined; saveSY(); }
  } finally { syncing = false; const el = $('#sy-status'); if (el) el.textContent = syMsg(); }
}
const syMsg = () => (SY.msg || '') + (SY.last ? ' · lần cuối ' + new Date(SY.last).toLocaleString('vi-VN') : '');
function syncCard() {
  if (SY.token) return `<div class="card"><div class="row"><b class="sp">🟢 Đã bật đồng bộ</b></div><div class="sub" id="sy-status">${esc(syMsg())}</div>
  <div class="grid2 mt"><button class="btn pri" data-a="syNow">Đồng bộ ngay</button><button class="btn danger" data-a="syOff">Ngắt kết nối</button></div>
  <div class="sub mt">Dữ liệu được lưu trong một Gist riêng tư của tài khoản GitHub của bạn. Ảnh tiến độ không được đồng bộ. Trên máy khác, dán cùng mã này để kết nối.</div></div>`;
  return `<div class="card"><div class="sub">Dùng chung dữ liệu giữa máy tính và điện thoại, miễn phí, lưu trong tài khoản GitHub của bạn.</div>
  <ol class="sub" style="padding-left:18px"><li>Mở <a href="https://github.com/settings/tokens/new?scopes=gist&description=FitTrack%20VN%20sync" target="_blank" rel="noopener" style="text-decoration:underline">trang tạo mã truy cập</a>, đăng nhập GitHub.</li><li>Giữ nguyên quyền <b>gist</b>, chọn hạn dùng (nên "No expiration"), kéo xuống bấm <b>Generate token</b>.</li><li>Sao chép mã (bắt đầu bằng <code>ghp_</code>) và dán vào ô dưới.</li></ol>
  <input id="sy-token" type="password" placeholder="Dán mã ghp_..." autocomplete="off"><button class="btn pri block mt" data-a="syConnect">Kết nối và đồng bộ</button>
  <div class="sub mt" id="sy-status">${esc(SY.msg || '')}</div><div class="sub">Mã chỉ lưu trên máy này, không bao giờ nằm trong dữ liệu đồng bộ. Đừng chia sẻ mã cho người khác.</div></div>`;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(false); });
window.addEventListener('online', () => syncNow(false));
setTimeout(() => syncNow(false), 800);

let notifT = null;
function schedNotif() {
  clearTimeout(notifT); const R = S.remind; if (!R.on || !('Notification' in window) || Notification.permission !== 'granted') return;
  const n = new Date(); if (!R.days.includes(n.getDay())) return; const [h, m] = R.time.split(':'), at = new Date(n); at.setHours(+h, +m, 0, 0);
  const ms = at - n; if (ms <= 0 || ms > 2147e3) return;
  notifT = setTimeout(async () => { if (S.sessions.some(s => dk(s.date) === dk())) return;
    try { const reg = await navigator.serviceWorker.getRegistration(); const o = { body: 'Đến giờ tập rồi! Mở FitTrack để bắt đầu.', icon: 'icons/icon-192.png' }; reg ? reg.showNotification('FitTrack', o) : new Notification('FitTrack', o); } catch (e) {} }, ms);
}
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
applyTheme(); schedNotif(); render();
