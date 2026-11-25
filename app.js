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
const fmtDur = s => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return m >= 60 ? Math.floor(m / 60) + 'g' + String(m % 60).padStart(2, '0') + 'p' : m + ':' + String(s % 60).padStart(2, '0'); };

/* ---------- Trạng thái ---------- */
const KEY = 'fittrack-vn-v1';
const defaults = () => ({
  profile: { name: '', sex: 'm', age: 30, height: 170, weight: 70, goalWeight: 0, goal: 'recomp', activity: 1.375, weeklyGoal: 3, rest: 90, accent: '#B7E21E', mode: 'auto' },
  remind: { on: false, days: [1, 3, 5], time: '18:00' }, deload: { on: false, start: 0, last: 0, every: 6 }, customFoods: [],
  routines: JSON.parse(JSON.stringify(DEFAULT_ROUTINES)), customEx: [],
  sessions: [], cardio: [], body: [], food: {}, water: {}, active: null,
});
let S = load();
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d) { const b = defaults(); return { ...b, ...d, profile: { ...b.profile, ...d.profile }, remind: { ...b.remind, ...d.remind }, deload: { ...b.deload, ...d.deload } }; } } catch (e) {}
  return defaults();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

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
  const map = { workout: 'train', routine: 'train', cardio: 'train', exercises: 'train', body: 'progress' };
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
  <h2>Tuần này</h2><div class="card"><div class="row"><div class="dots">${dots}</div><span class="sp"></span><b>${w.sessions}/${p.weeklyGoal} buổi tạ</b></div>
  <div class="sub mt">Chạy/cardio: ${round(w.km, 1)} km · ${Math.round(w.cardioMin)} phút · Chuỗi tuần đạt mục tiêu: ${weekStreak()} 🔥</div></div>
  <h2>Dinh dưỡng hôm nay</h2><a class="card" href="#/food" style="display:block"><div class="row"><b>${Math.round(ft.k)}</b><span class="sub">/ ${t.kcal} kcal</span><span class="sp"></span><b>${Math.round(ft.p)}</b><span class="sub">/ ${t.protein}g đạm</span></div>
  <div class="bar"><i class="${ft.k > t.kcal * 1.1 ? 'over' : ''}" style="width:${Math.min(100, ft.k / t.kcal * 100)}%"></i></div><div class="bar"><i style="width:${Math.min(100, ft.p / t.protein * 100)}%"></i></div></a>
  <div class="grid2"><a class="stat" href="#/body"><b>${cur ? cur + ' kg' : '—'}</b><span>Cân nặng${diff !== null ? ' · ' + (diff > 0 ? '+' : '') + diff + ' kg/4 tuần' : ''}</span></a>
  <a class="stat" href="#/cardio"><b>+ Cardio</b><span>Ghi buổi chạy</span></a></div>
  <div class="card mt"><div class="sub">💡 Gợi ý</div>${esc(tip)}</div>`;
}

/* ---------- Tập luyện ---------- */
function vTrain() {
  const rs = S.routines.map(r => {
    const ds = daysSince(lastDoneOf(r.id));
    return `<div class="card"><div class="row"><div class="sp"><h3>${esc(r.name)}</h3><div class="sub">${esc(r.sub || '')} · ${r.ex.length} bài${ds === null ? '' : ' · ' + (ds === 0 ? 'hôm nay' : ds + ' ngày trước')}</div></div>
    <a class="btn sm" href="#/routine/${r.id}">Sửa</a><button class="btn pri sm" data-a="start" data-id="${r.id}">Tập</button></div></div>`;
  }).join('');
  const hist = [...S.sessions].reverse().slice(0, 8).map(s => `<div class="item"><div class="sp"><b>${esc(s.name)}</b><div class="sub">${fmtD(s.date)} · ${Math.round(s.dur / 60)} phút · ${Math.round(s.vol)} kg tổng tạ${s.feel ? ' · ' + ['😫', '😐', '🙂', '💪'][s.feel - 1] : ''}</div>${s.note ? `<div class="sub">📝 ${esc(s.note)}</div>` : ''}</div><button class="x" data-a="delSession" data-id="${s.id}" aria-label="Xoá">✕</button></div>`).join('');
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
function buildEx(id, n = 3) {
  const ex = exOf(id), last = lastSessionOf(id); let sets;
  if (last) sets = last.sets.map(s => ({ w: s.w, r: s.r, done: false }));
  else sets = Array.from({ length: n }, () => ({ w: 0, r: ex.type === 'time' ? ex.min : ex.min, done: false }));
  while (sets.length < n) sets.push({ ...sets[sets.length - 1], done: false });
  sets = sets.slice(0, Math.max(n, 1));
  // Gợi ý tăng tạ nếu lần trước đạt hết mức reps cao nhất
  let hint = '';
  if (deloadActive()) {
    if (ex.type === 'machine') sets.forEach(s => s.w = Math.round(s.w * 0.9 * 2) / 2);
    sets = sets.slice(0, Math.max(2, n - 1)); sets.forEach(s => s.r = Math.min(s.r, ex.max));
    hint = 'Tuần nhẹ: tạ giảm ~10%, bớt 1 set, dừng cách giới hạn 3–4 reps.';
  } else if (last && ex.type !== 'time' && last.sets.every(s => s.r >= ex.max)) {
    if (ex.type === 'machine') { const inc = 2.5; sets.forEach(s => { s.w = round(s.w + inc, 1); s.r = ex.min; }); hint = `Lần trước đạt ${ex.max} reps ở mọi set: thử tăng lên ${sets[0].w} kg.`; }
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
    <details><summary class="sub" style="cursor:pointer">Cách tập</summary><div class="sub">${esc(ex.cue || '')}</div></details>
    <div class="setrow ${tm ? 'time' : ''} sub"><span></span>${tm ? '' : '<span>kg</span>'}<span>${tm ? 'giây' : 'reps'}</span><span></span><span></span></div>
    ${e.sets.map((s, j) => `<div class="setrow ${tm ? 'time' : ''}"><span class="n">${j + 1}</span>
      ${tm ? '' : `<input inputmode="decimal" data-in="ws" data-i="${i}" data-j="${j}" data-f="w" value="${s.w || ''}" placeholder="0">`}
      <input inputmode="numeric" data-in="ws" data-i="${i}" data-j="${j}" data-f="r" value="${s.r || ''}" placeholder="0">
      <button class="chk ${s.done ? 'on' : ''}" data-a="chk" data-i="${i}" data-j="${j}" aria-label="Xong set">✓</button><button class="x" data-a="rmSet" data-i="${i}" data-j="${j}" aria-label="Xoá set">−</button></div>`).join('')}
    <button class="btn sm ghost" data-a="addSet" data-i="${i}">+ Thêm set</button></div>`;
  }).join('');
  return `<div class="row">${head(esc(a.name))}<span class="sp"></span><b id="elapsed" class="sub">${fmtDur((Date.now() - a.start) / 1000)}</b></div>
  ${prevNote}<div class="sub">Khởi động 5 phút (xoay khớp, set nhẹ đầu tiên) trước khi vào tạ nặng.</div>${cards}
  <button class="btn block" data-a="addEx">+ Thêm bài</button>
  <div class="card"><label>Cảm giác buổi tập</label><div class="days">${[['😫', 'Mệt'], ['😐', 'Bình thường'], ['🙂', 'Tốt'], ['💪', 'Rất tốt']].map((m, i) => `<button class="btn ${a.feel === i + 1 ? 'on' : ''}" data-a="feel" data-v="${i + 1}" aria-label="${m[1]}">${m[0]}</button>`).join('')}</div>
  <label>Ghi chú (đau mỏi, tạ cảm thấy nặng/nhẹ, bài cần đổi...)</label><textarea data-in="note" rows="3" placeholder="Ghi chú cho buổi này">${esc(a.note || '')}</textarea></div>
  <button class="btn pri block mt" data-a="finish">Hoàn thành buổi tập</button>
  <button class="btn ghost block danger" data-a="cancel">Huỷ buổi tập</button>`;
}
function finishWorkout() {
  const a = S.active, exs = a.exs.map(e => ({ id: e.id, sets: e.sets.filter(s => s.done).map(s => ({ w: num(s.w), r: num(s.r) })) })).filter(e => e.sets.length);
  if (!exs.length) { if (confirm('Chưa có set nào được đánh dấu xong. Huỷ buổi tập này?')) { S.active = null; save(); stopRest(); location.hash = '#/'; } return; }
  const date = Date.now(), prs = [];
  exs.forEach(e => {
    const ex = exOf(e.id); const prev = S.sessions.flatMap(s => s.exs.filter(x => x.id === e.id).flatMap(x => x.sets));
    if (!prev.length) return;
    const best = Math.max(...prev.map(s => ex.type === 'time' ? s.r : e1rm(s.w, s.r))), now = Math.max(...e.sets.map(s => ex.type === 'time' ? s.r : e1rm(s.w, s.r)));
    if (now > best + 0.01) prs.push(ex.name);
  });
  const vol = exs.reduce((t, e) => t + e.sets.reduce((u, s) => u + s.w * s.r, 0), 0);
  const s = { id: uid(), date, routineId: a.routineId, name: a.name, dur: (date - a.start) / 1000, exs, vol, note: (a.note || '').trim(), feel: a.feel || 0 };
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

/* ---------- Cardio ---------- */
function vCardio() {
  const ts = CARDIO_TYPES.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  const list = [...S.cardio].sort((a, b) => b.date - a.date).slice(0, 20).map(c => {
    const t = CARDIO_TYPES.find(x => x.id === c.type) || CARDIO_TYPES[5], pace = c.km && c.min ? round(c.min / c.km, 2) : 0;
    return `<div class="item"><div class="sp"><b>${t.name}</b> <span class="sub">${fmtD(c.date)}</span><div class="sub">${c.km ? round(c.km, 2) + ' km · ' : ''}${c.min} phút${pace ? ' · ' + Math.floor(pace) + ':' + String(Math.round((pace % 1) * 60)).padStart(2, '0') + '/km' : ''} · ~${cardioKcal(c)} kcal</div></div><button class="x" data-a="delCardio" data-id="${c.id}">✕</button></div>`;
  }).join('');
  const wk = weeksBack(8).map((t, i, a) => ({ label: fmtD(t), v: S.cardio.filter(c => c.date >= t && c.date < t + 7 * DAY).reduce((s, c) => s + (c.km || 0), 0), cur: i === a.length - 1 }));
  return `${head('Cardio & chạy bộ', '#/train')}<div class="card"><label>Loại</label><select id="c-type">${ts}</select>
  <div class="grid2"><div><label>Quãng đường (km)</label><input id="c-km" inputmode="decimal" placeholder="vd 3.5"></div><div><label>Thời gian (phút)</label><input id="c-min" inputmode="decimal" placeholder="vd 25"></div></div>
  <button class="btn pri block mt" data-a="addCardio">Lưu buổi tập</button><div class="sub mt">Người mới nên chạy xen đi bộ, tăng không quá 10% quãng đường mỗi tuần.</div></div>
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
  try { photos = ((await idbDo('readonly', s => s.getAll())) || []).sort((a, b) => a.date - b.date); } catch (e) { box.innerHTML = '<div class="empty">Trình duyệt này không cho lưu ảnh.</div>'; return; }
  photos.forEach(p => p.url = URL.createObjectURL(p.blob));
  box.innerHTML = photos.length ? `<div class="grid3">${[...photos].reverse().map(p => `<div data-a="photoView" data-id="${p.id}" style="cursor:pointer"><img src="${p.url}" alt="" style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:12px"><div class="sub" style="text-align:center">${fmtD(p.date)} · ${esc(p.label)}</div></div>`).join('')}</div><button class="btn block mt" data-a="photoCmp">↔ So sánh trước và sau</button>` : '<div class="empty">Chưa có ảnh nào. Chụp cùng góc, cùng ánh sáng mỗi 2–4 tuần để so sánh rõ nhất.</div>';
}
function vBodyPhotos() {
  return `<h2>Ảnh tiến độ</h2><div class="card"><div class="row"><select id="ph-label" style="flex:1"><option>Trước</option><option>Bên</option><option>Sau</option></select><label class="btn pri" style="margin:0">📷 Thêm ảnh<input type="file" accept="image/*" data-in="photo" hidden></label></div>
  <div class="sub mt">Ảnh chỉ lưu trên điện thoại này, không tải lên đâu cả. Ảnh không nằm trong file sao lưu JSON.</div><div id="photos" class="mt"><div class="empty">Đang tải...</div></div></div>`;
}

/* ---------- Ăn uống ---------- */
const fold = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
const foodPool = () => [...S.customFoods.map(f => ({ ...f, mine: 1 })), ...FOODS];
let foodSel = null;
function openFood(name) {
  const f = foodPool().find(x => x.n === name); if (!f) return; foodSel = f;
  modal(`<h3>${esc(f.n)}</h3><div class="sub">${f.g ? `${round(f.k / f.g * 100)} kcal · ${round(f.p / f.g * 100, 1)}g đạm mỗi 100${f.ml ? 'ml' : 'g'} (1 khẩu phần ≈ ${f.g}${f.ml ? 'ml' : 'g'})` : `${f.k} kcal · ${f.p}g đạm mỗi khẩu phần`}</div>
  ${f.w ? '<div class="sub">Gần như không calo, được cộng vào mục nước uống.</div>' : ''}${f.alc ? '<div class="hint">Cồn cộng calo "rỗng" và làm chậm phục hồi cơ, nên hạn chế khi đang giảm mỡ hoặc tăng cơ.</div>' : ''}<div class="grid2"><div><label>${f.ml ? 'Số ly/lon/chai' : 'Số khẩu phần'}</label><input id="fm-q" inputmode="decimal" data-in="fm" data-f="q" value="1"></div>${f.g ? `<div><label>${f.ml ? 'Hoặc nhập ml' : 'Hoặc nhập gam'}</label><input id="fm-g" inputmode="decimal" data-in="fm" data-f="g" value="${f.g}"></div>` : ''}</div>
  <div class="stat mt" id="fm-pre"></div><button class="btn pri block mt" data-a="foodAdd">Thêm vào ${dayLabel(foodDay).toLowerCase()}</button><button class="btn ghost block" data-a="closeModal">Đóng</button>`);
  fmUpdate('q');
}
function fmUpdate(src) {
  const f = foodSel, q = $('#fm-q'), g = $('#fm-g'); if (!f) return;
  if (g && src === 'q') g.value = round(num(q.value) * f.g); else if (g && src === 'g') q.value = round(num(g.value) / f.g, 2);
  const m = num(q.value); $('#fm-pre').innerHTML = f.w ? `<b>${round(f.g * m)} ml nước</b>` : `<b>${Math.round(f.k * m)} kcal</b><span> · ${round(f.p * m, 1)}g đạm</span>`;
}
function foodButtons() {
  const q = fold(foodQ); let all = foodPool().filter(f => !q || fold(f.n).includes(q));
  if (foodCat === 'drink') all = all.filter(f => f.ml); else if (foodCat === 'alc') all = all.filter(f => f.alc);
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
  <div class="row"><b>${wt} ml</b><span class="sub">/ ${t.water * 1} ml nước</span><span class="sp"></span><button class="btn sm" data-a="water" data-v="250">+250</button><button class="btn sm" data-a="water" data-v="-250">−</button></div><div class="bar"><i style="width:${Math.min(100, wt / t.water * 100)}%"></i></div></div>
  <h2>Đã ăn</h2><div class="card">${items.map((f, i) => `<div class="item"><div class="sp"><b>${esc(f.n)}</b><div class="sub">${Math.round(f.k * f.q)} kcal · ${round(f.p * f.q, 1)}g đạm</div></div><button class="btn sm" data-a="qty" data-i="${i}" data-v="-0.5">−</button><b>${f.gr ? f.gr + (f.ml ? ' ml' : ' g') : round(f.q, 2)}</b><button class="btn sm" data-a="qty" data-i="${i}" data-v="0.5">+</button><button class="x" data-a="delFood" data-i="${i}">✕</button></div>`).join('') || '<div class="empty">Chưa ghi món nào.</div>'}</div>
  <h2>Thêm món</h2><div class="card"><div class="tabs">${[['', 'Gợi ý'], ['drink', '🥤 Đồ uống'], ['alc', '🍺 Rượu bia'], ['all', 'Tất cả']].map(c => `<button class="btn sm ${foodCat === c[0] ? 'on' : ''}" data-a="cat" data-c="${c[0]}">${c[1]}</button>`).join('')}</div><input id="fq" data-in="fq" placeholder="Tìm: cơm, phở, ức gà..." value="${esc(foodQ)}"><div id="flist" class="mt">${shown}</div>
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
  <div class="grid2 mt"><a class="btn" href="#/body">⚖️ Cân nặng & số đo</a><a class="btn" href="#/cardio">🏃 Cardio</a></div>
  <h2>Số buổi tạ mỗi tuần</h2><div class="card">${barChart(cnt)}</div><h2>Khối lượng tạ mỗi tuần (tấn)</h2><div class="card">${barChart(vol)}</div><h2>Tiến bộ theo bài</h2><div class="card">${lift}</div>`;
}

/* ---------- Thư viện bài ---------- */
function vExercises() {
  const groups = {}; allEx().forEach(e => (groups[e.g] = groups[e.g] || []).push(e));
  return `${head('Thư viện bài tập', '#/train')}${Object.entries(groups).map(([g, l]) => `<h2>${esc(g)}</h2><div class="card">${l.map(e => `<div class="item"><div class="sp"><b>${esc(e.name)}</b><div class="sub">${esc(e.cue || '')}</div></div><span class="chip">${e.min}–${e.max}</span></div>`).join('')}</div>`).join('')}
  <h2>Thêm bài riêng</h2><div class="card"><label>Tên bài</label><input id="x-n"><label>Nhóm cơ</label><input id="x-g" placeholder="vd Ngực"><label>Loại</label><select id="x-t"><option value="machine">Có tạ (kg)</option><option value="bw">Tạ cơ thể</option><option value="time">Tính giây</option></select><button class="btn pri block mt" data-a="addEx2">Thêm</button></div>`;
}

/* ---------- Hồ sơ ---------- */
function vProfile() {
  const p = S.profile, t = targets(), hasDemo = S.sessions.some(s => s.demo);
  const f = (lb, path, extra = '') => `<div><label>${lb}</label><input data-in="pf" data-f="${path}" inputmode="decimal" value="${esc(p[path] || '')}" ${extra}></div>`;
  return `${head('Hồ sơ & mục tiêu')}<div class="card"><label>Tên</label><input data-in="pf" data-f="name" data-s="1" value="${esc(p.name)}">
  <div class="grid2"><div><label>Giới tính</label><select data-in="pf" data-f="sex" data-s="1"><option value="m" ${p.sex === 'm' ? 'selected' : ''}>Nam</option><option value="f" ${p.sex === 'f' ? 'selected' : ''}>Nữ</option></select></div>${f('Tuổi', 'age')}</div>
  <div class="grid3">${f('Cao (cm)', 'height')}${f('Nặng (kg)', 'weight')}${f('Mục tiêu (kg)', 'goalWeight')}</div>
  <label>Mục tiêu chính</label><select data-in="pf" data-f="goal" data-s="1"><option value="recomp" ${p.goal === 'recomp' ? 'selected' : ''}>Giảm mỡ và tăng cơ (recomp)</option><option value="giam-mo" ${p.goal === 'giam-mo' ? 'selected' : ''}>Giảm mỡ</option><option value="tang-co" ${p.goal === 'tang-co' ? 'selected' : ''}>Tăng cơ</option></select>
  <label>Mức vận động hằng ngày</label><select data-in="pf" data-f="activity"><option value="1.2" ${p.activity == 1.2 ? 'selected' : ''}>Ít (ngồi nhiều)</option><option value="1.375" ${p.activity == 1.375 ? 'selected' : ''}>Nhẹ (tập 1–3 buổi/tuần)</option><option value="1.55" ${p.activity == 1.55 ? 'selected' : ''}>Vừa (3–5 buổi/tuần)</option><option value="1.725" ${p.activity == 1.725 ? 'selected' : ''}>Cao (tập mỗi ngày)</option></select>
  <div class="grid2">${f('Mục tiêu buổi tạ/tuần', 'weeklyGoal')}${f('Nghỉ giữa set (giây)', 'rest')}</div></div>
  <h2>Mục tiêu hằng ngày (tự tính)</h2><div class="grid2"><div class="stat"><b>${t.kcal}</b><span>kcal/ngày (TDEE ${t.tdee})</span></div><div class="stat"><b>${t.protein}g</b><span>đạm/ngày</span></div></div>
  <div class="sub mt">Công thức Mifflin-St Jeor, chỉ mang tính tham khảo. Điều chỉnh theo cân nặng thực tế sau 2–3 tuần.</div>
  <h2>Giao diện</h2><div class="card"><label>Màu chủ đạo</label><div class="sw">${ACCENTS.map(a => `<button class="${p.accent === a[0] ? 'on' : ''}" style="background:${a[0]}" data-a="accent" data-c="${a[0]}" aria-label="${a[2]}"></button>`).join('')}</div>
  <label>Chế độ</label><div class="days">${[['auto', 'Tự động'], ['light', 'Sáng'], ['dark', 'Tối']].map(m => `<button class="btn ${p.mode === m[0] ? 'on' : ''}" data-a="mode" data-m="${m[0]}">${m[1]}</button>`).join('')}</div></div>
  <h2>Nhắc lịch tập</h2><div class="card"><div class="row"><span class="sp">Bật nhắc tập</span><button class="btn sm ${S.remind.on ? 'pri' : ''}" data-a="rmToggle">${S.remind.on ? 'Đang bật' : 'Đang tắt'}</button></div>
  <label>Ngày tập dự kiến</label><div class="days">${['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((n, i) => `<button class="btn ${S.remind.days.includes(i) ? 'on' : ''}" data-a="rmDay" data-d="${i}">${n}</button>`).join('')}</div>
  <label>Giờ nhắc</label><input type="time" data-in="rmTime" value="${esc(S.remind.time)}">
  <button class="btn block mt" data-a="ics">📅 Thêm vào lịch điện thoại (nhắc đáng tin cậy)</button>
  <div class="sub mt">Web app không thể tự nhắc khi đã đóng hẳn. Cách chắc chắn nhất là thêm vào lịch (nút trên, lịch sẽ báo trước 10 phút). Khi app đang mở, app cũng gửi thông báo nếu bạn cho phép.</div></div>
  <h2>Tuần nhẹ (deload)</h2><div class="card">${deloadActive() ? `<b>🌿 Đang trong tuần nhẹ</b><div class="sub">Tạ giảm ~10%, bớt 1 set. Tự kết thúc sau 7 ngày.</div><button class="btn block mt" data-a="dlStop">Kết thúc sớm</button>` : `<div>Đã tập <b>${trainingWeeks()}</b> tuần từ lần nghỉ nhẹ gần nhất.${deloadDue() ? ' <span class="chip">Nên nghỉ nhẹ</span>' : ''}</div><div class="sub">Cứ vài tuần tập nặng nên có một tuần giảm tải để cơ, khớp và thần kinh phục hồi.</div><button class="btn pri block mt" data-a="dlStart">Bắt đầu tuần nhẹ</button>`}
  <label>Gợi ý sau mỗi (tuần)</label><input inputmode="numeric" data-in="dlEvery" value="${S.deload.every}"></div>
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
    case 'profile': html = vProfile(); break; default: html = vHome();
  }
  if (html !== '') { $('#app').innerHTML = html; window.scrollTo(0, 0); if (a === 'body') loadPhotos(); }
  drawNav(route);
}
window.addEventListener('hashchange', render);

/* ---------- Sự kiện ---------- */
const rerender = () => { const y = window.scrollY; render(); window.scrollTo(0, y); };
const curRoutine = () => S.routines.find(x => x.id === (location.hash.split('/')[2]));
const A = {
  start: el => startRoutine(el.dataset.id),
  chk(el) { const s = S.active.exs[+el.dataset.i].sets[+el.dataset.j]; s.done = !s.done; save();
    if (s.done) { const ex = exOf(S.active.exs[+el.dataset.i].id); startRest(S.profile.rest + (ex.big ? 30 : 0)); } rerender(); },
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
  delCardio(el) { S.cardio = S.cardio.filter(c => c.id !== el.dataset.id); save(); rerender(); },
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
    if (f.w) { S.water[foodDay] = (S.water[foodDay] || 0) + Math.round(q * f.g); save(); closeModal(); toast('Đã cộng ' + Math.round(q * f.g) + ' ml nước'); rerender(); return; }
    const l = (S.food[foodDay] = S.food[foodDay] || []), ex = l.find(x => x.n === f.n && !!x.sg === !!f.g);
    if (ex) { ex.q = round(ex.q + q, 3); if (ex.sg) ex.gr = round(ex.q * ex.sg); } else l.push({ n: f.n, k: f.k, p: f.p, q: round(q, 4), ...(f.g ? { sg: f.g, gr: round(q * f.g), ...(f.ml ? { ml: 1 } : {}) } : {}) });
    save(); closeModal(); toast('Đã thêm'); rerender();
  },
  addCustomFood() {
    const n = $('#f-n').value.trim(), k = num($('#f-k').value), p = num($('#f-p').value); if (!n || !k) return toast('Nhập tên và kcal');
    if (foodPool().some(x => x.n.toLowerCase() === n.toLowerCase())) return toast('Món này đã có'); const g = num($('#f-g').value); S.customFoods.push({ n, k, p, ...(g ? { g } : {}) }); (S.food[foodDay] = S.food[foodDay] || []).push({ n, k, p, q: 1, ...(g ? { sg: g, gr: g } : {}) }); save(); rerender();
  },
  delCustomFood(el) { S.customFoods.splice(+el.dataset.i, 1); save(); rerender(); },
  qty(el) { const f = foodOf(foodDay)[+el.dataset.i], dir = +el.dataset.v > 0 ? 1 : -1; if (f.sg) { f.gr = Math.max(10, (f.gr || round(f.q * f.sg)) + dir * 10); f.q = f.gr / f.sg; } else f.q = Math.max(.5, f.q + dir * .5); save(); rerender(); },
  delFood(el) { foodOf(foodDay).splice(+el.dataset.i, 1); save(); rerender(); },
  water(el) { S.water[foodDay] = Math.max(0, (S.water[foodDay] || 0) + +el.dataset.v); save(); rerender(); },
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
  wipe() { if (confirm('Xoá TOÀN BỘ dữ liệu? Không thể hoàn tác.') && confirm('Chắc chắn chứ?')) { S = defaults(); save(); applyTheme(); stopRest(); try { idbDo('readwrite', s => s.clear()); } catch (e) {} rerender(); } },
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
  else if (committed && k === 'pf') { const f = el.dataset.f; S.profile[f] = el.dataset.s ? el.value : num(el.value); S.profile.weight = S.profile.weight || 70; save(); rerender(); }
  else if (committed && k === 'photo') {
    const fl = el.files[0]; if (!fl) return; const label = $('#ph-label').value;
    shrink(fl).then(blob => idbDo('readwrite', s => s.put({ id: uid(), date: Date.now(), label, blob }))).then(() => { toast('Đã lưu ảnh'); loadPhotos(); }).catch(() => toast('Không lưu được ảnh'));
  }
  else if (committed && k === 'rmTime') { if (el.value) { S.remind.time = el.value; save(); schedNotif(); } }
  else if (committed && k === 'dlEvery') { S.deload.every = Math.max(2, Math.round(num(el.value)) || 6); save(); rerender(); }
  else if (committed && k === 'progEx') { progEx = el.value; rerender(); }
  else if (committed && k === 'import') {
    const fl = el.files[0]; if (!fl) return; const r = new FileReader();
    r.onload = () => { try { const d = JSON.parse(r.result); if (!d.profile || !d.sessions) throw 0; S = { ...defaults(), ...d }; save(); applyTheme(); toast('Đã nhập dữ liệu'); rerender(); } catch (x) { toast('File không hợp lệ'); } }; r.readAsText(fl);
  }
}
document.addEventListener('input', e => onInput(e, false));
document.addEventListener('change', e => onInput(e, true));

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
