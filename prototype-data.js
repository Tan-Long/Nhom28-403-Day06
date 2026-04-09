/**
 * Nạp rag_data.json và render các màn: lịch, điểm danh, thực đơn, bài tập, nhận xét, thông báo, gợi ý AI.
 * (faiss_index.bin dùng cho RAG phía Python; trình duyệt chỉ đọc rag_data.json.)
 * Cần mở qua HTTP (vd: python -m http.server) để fetch được.
 */
const DATA_PENDING_MSG =
  'Nhà trường chưa cập nhật dữ liệu. Phụ huynh vui lòng thử lại sau.';

function getTodayStr() {
  const p = new URLSearchParams(window.location.search);
  const d = p.get('date');
  if (d && /^\d{2}\/\d{2}\/\d{4}$/.test(d)) return d;
  return '09/04/2026';
}

function parseDateDMY(s) {
  const [dd, mm, yy] = s.split('/').map(Number);
  return new Date(yy, mm - 1, dd);
}

function toDMY(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = date.getFullYear();
  return dd + '/' + mm + '/' + yy;
}

function addDays(date, n) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + n);
  return d;
}

/** Thứ Hai đầu tuần (T2…CN trong strip) */
function mondayOfWeek(date) {
  const d = new Date(date.getTime());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(12, 0, 0, 0);
  return d;
}

function setAttStats(onTime, late, absOk, absNo) {
  const a = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(v);
  };
  a('att-stat-ontime', onTime);
  a('att-stat-late', late);
  a('att-stat-absok', absOk);
  a('att-stat-absno', absNo);
}

function countAttendanceStats(day) {
  let onTime = 0;
  let late = 0;
  for (const ch of day.chunks) {
    const c = ch.content;
    const st = extractField(c, 'Trạng thái tiết học');
    if (!st) continue;
    if (/Đúng giờ|Tiết kép/i.test(st)) onTime += 1;
    else if (/Đi muộn/i.test(st)) late += 1;
  }
  return { onTime, late };
}

/** Thứ 2 … Thứ 7, Chủ nhật */
function thuLabelFromDate(d) {
  const map = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  return map[d.getDay()];
}

function filterSheet(data, name) {
  return data.filter((x) => x.metadata && x.metadata.sheet === name);
}

function sortByRow(items) {
  return items.slice().sort((a, b) => (a.metadata.row || 0) - (b.metadata.row || 0));
}

function extractField(block, label) {
  const re = new RegExp('- ' + label + ':\\s*([^\\n]+)');
  const m = block.match(re);
  return m ? m[1].trim() : '';
}

function extractDayColumn(content, dayLabel) {
  const esc = dayLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    '- ' + esc + ':\\s*([^\\n]+)(?:\\n\\s*\\n\\s*\\(([^)]+)\\))?',
    'm'
  );
  const m = content.match(re);
  if (!m) return null;
  return { subject: m[1].trim(), teacher: (m[2] || '').trim() };
}

function groupAttendanceByDay(rows) {
  const sorted = sortByRow(rows);
  const days = [];
  let cur = null;
  for (const row of sorted) {
    const c = row.content;
    const dm = c.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (c.includes('Ngày:') && dm) {
      if (cur) days.push(cur);
      cur = { date: dm[1], chunks: [] };
    }
    if (cur) cur.chunks.push(row);
  }
  if (cur) days.push(cur);
  return days;
}

function parseHomework(content) {
  const subj = extractField(content, 'Mã lớp / Môn học') || extractField(content, 'Môn học');
  const name = extractField(content, 'Tên bài tập / Kiểm tra');
  let status = extractField(content, 'Trạng thái');
  const score = extractField(content, 'Điểm số');
  let deadline = '';
  const hm = content.match(/Hạn nộp dự kiến:\s*(\d{4}-\d{2}-\d{2})/);
  if (hm) {
    const [Y, M, D] = hm[1].split('-');
    deadline = `${D}/${M}`;
  }
  return { subj: subj || '—', name: name || '—', status, score: score || '', deadline };
}

function parseComment(content) {
  const dm = content.match(/Ngày:\s*(\d{4}-\d{2}-\d{2})/);
  const gv = extractField(content, 'Giáo viên');
  const mon = extractField(content, 'Bộ môn');
  const txt = extractField(content, 'Nội dung nhận xét');
  let shortDate = '';
  if (dm) {
    const [Y, M, D] = dm[1].split('-');
    shortDate = `${D}/${M}`;
  }
  return { iso: dm ? dm[1] : '', gv, mon, txt, shortDate };
}

/** Bảng Thông báo trong rag_data.json (đồng bộ nội dung với RAG / faiss_index.bin ở backend). */
function parseNotification(content) {
  return {
    type: extractField(content, 'Loại thông báo'),
    title: extractField(content, 'Tiêu đề'),
    summary: extractField(content, 'Nội dung tóm tắt'),
    audience: extractField(content, 'Đối tượng nhận'),
    eventDate: extractField(content, 'Ngày sự kiện'),
    deadline: extractField(content, 'Hạn chót (Deadline)'),
    status: extractField(content, 'Trạng thái'),
  };
}

function notifIconForType(type) {
  const t = (type || '').toLowerCase();
  if (/tài chính|học phí|phí/i.test(t)) return '💳';
  if (/y tế|khám/i.test(t)) return '🏥';
  if (/học vụ|thi|họp phụ huynh/i.test(t)) return '📚';
  if (/sự kiện|thể thao|book fair|đọc sách/i.test(t)) return '🎉';
  if (/ngoại khóa|clb/i.test(t)) return '🏃';
  if (/khảo sát/i.test(t)) return '📋';
  if (/đời sống|thực đơn/i.test(t)) return '🍽';
  if (/hội thảo/i.test(t)) return '🎤';
  if (/trải nghiệm|xem phim/i.test(t)) return '🎬';
  return '🏫';
}

function ctaLabelFromNotifStatus(status) {
  const s = status || '';
  if (/Thanh toán/i.test(s)) return 'Thanh toán ngay';
  if (/Đăng ký ngay/i.test(s)) return 'Đăng ký ngay';
  if (/Đăng ký/i.test(s)) return 'Đăng ký';
  if (/Xác nhận/i.test(s)) return 'Xác nhận';
  if (/Thực hiện khảo sát|Cập nhật khảo sát/i.test(s)) return 'Làm khảo sát';
  if (/Xem thực đơn/i.test(s)) return 'Xem thực đơn';
  if (/Xem chi tiết|Xem lịch/i.test(s)) return 'Xem chi tiết';
  return 'Mở trong app';
}

function pickFeaturedNotification(rows) {
  const sorted = sortByRow(rows);
  const order = [/Hoạt động ngoại khóa/i, /Trải nghiệm học tập/i, /Khảo sát/i];
  for (const re of order) {
    const hit = sorted.find((r) => re.test(parseNotification(r.content).type || ''));
    if (hit) return hit;
  }
  return sorted[0] || null;
}

/** Mọi ngày dd/mm/yyyy trong các trường (để sắp xếp / nhận diện tháng 4). */
function allTimestampsFromNotifParsed(p) {
  const s = [p.eventDate, p.deadline, p.title, p.summary].filter(Boolean).join(' ');
  const re = /\b(\d{2})\/(\d{2})\/(\d{4})\b/g;
  const out = [];
  let m;
  while ((m = re.exec(s)) !== null) {
    const t = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
    if (!Number.isNaN(t)) out.push(t);
  }
  return out;
}

function notifRecencySortKey(row) {
  const p = parseNotification(row.content);
  const ts = allTimestampsFromNotifParsed(p);
  if (ts.length) return Math.max(...ts);
  return (row.metadata && row.metadata.row) || 0;
}

/** Một dòng: ngày SK + hạn (để thấy cả tháng 3 lẫn hạn tháng 4, vd Book Fair). */
function formatNotifWhenLine(p) {
  const ev = p.eventDate && p.eventDate !== 'N/A' ? p.eventDate.trim() : '';
  const dl =
    p.deadline && !/^Không ghi rõ$/i.test((p.deadline || '').trim())
      ? p.deadline.trim()
      : '';
  if (ev && dl) return ev + ' · ' + dl;
  if (ev) return ev;
  if (dl) return dl;
  return '—';
}

/** Nội dung đầy đủ cho màn chi tiết thông báo. */
function formatNotifFullHtml(content) {
  const p = parseNotification(content);
  const blocks = [
    ['Loại thông báo', p.type],
    ['Nội dung tóm tắt', p.summary],
    ['Đối tượng nhận', p.audience],
    ['Ngày sự kiện', p.eventDate],
    ['Hạn chót (Deadline)', p.deadline],
    ['Trạng thái', p.status],
  ];
  let h =
    '<div style="font-weight:700;margin-bottom:14px;font-size:16px;line-height:1.35;">' +
    escapeHtml(p.title || 'Thông báo') +
    '</div>';
  h += '<dl style="margin:0;font-size:14px;">';
  for (const [label, val] of blocks) {
    if (!val || val === 'N/A') continue;
    h +=
      '<dt style="margin:14px 0 4px;color:#6b7280;font-size:11px;font-weight:600;letter-spacing:.02em;">' +
      escapeHtml(label) +
      '</dt>';
    h += '<dd style="margin:0;color:#111827;">' + escapeHtml(val) + '</dd>';
  }
  h += '</dl>';
  h +=
    '<div style="margin-top:20px;padding-top:14px;border-top:1px solid #e5e7eb;"><div style="font-size:11px;color:#9ca3af;margin-bottom:8px;">Bản gốc đầy đủ (dữ liệu nhà trường)</div>';
  h +=
    '<pre style="white-space:pre-wrap;word-break:break-word;font-size:12px;color:#374151;margin:0;font-family:inherit;line-height:1.5;">' +
    escapeHtml(content) +
    '</pre></div>';
  return h;
}

window.openNotifDetail = function openNotifDetail(notifId) {
  const bundle = window.__protoRagBundle;
  if (!bundle || !bundle.notif) return;
  const row = bundle.notif.find((r) => r.id === notifId);
  if (!row) return;
  const p = parseNotification(row.content);
  const sub = document.getElementById('notif-detail-subtitle');
  const ttl = p.title || 'Thông báo';
  if (sub) sub.textContent = ttl.length > 36 ? ttl.slice(0, 35) + '…' : ttl;
  const meta = document.getElementById('notif-detail-meta');
  if (meta) {
    meta.innerHTML =
      '<div style="color:#111827;font-weight:500;">' +
      escapeHtml(formatNotifWhenLine(p)) +
      '</div>' +
      (p.type
        ? '<div style="margin-top:6px;">' +
          escapeHtml(p.type) +
          (p.audience ? ' · ' + escapeHtml(p.audience) : '') +
          '</div>'
        : '');
  }
  const body = document.getElementById('notif-detail-body');
  if (body) body.innerHTML = formatNotifFullHtml(row.content);
  if (typeof goTo === 'function') goTo('page-notif-detail');
};

function groupMenuByDay(rows) {
  const sorted = sortByRow(rows);
  const days = [];
  let cur = null;
  for (const row of sorted) {
    const c = row.content;
    const dm = c.match(/Ngày:[^\n]*(\d{2}\/\d{2}\/\d{4})/);
    if (dm) {
      if (cur) days.push(cur);
      cur = { date: dm[1], items: [] };
    }
    if (cur && c.includes('Tên món ăn')) {
      const meal = extractField(c, 'Bữa ăn') || '';
      const name = extractField(c, 'Tên món ăn');
      const km = c.match(/Năng lượng[^:]*:\s*([^\n]+)/);
      const kcal = km ? km[1].trim() : '';
      if (name) cur.items.push({ meal, name, kcal });
    }
  }
  if (cur) days.push(cur);
  return days;
}

function renderSchedule(root, tkbRows, todayStr) {
  const d = parseDateDMY(todayStr);
  const dayLabel = thuLabelFromDate(d);
  root.innerHTML = '';
  if (dayLabel === 'Chủ nhật') {
    root.innerHTML =
      '<div style="padding:20px;text-align:center;color:#6b7280;font-size:13px;">' +
      DATA_PENDING_MSG +
      '</div>';
    return;
  }
  const sorted = sortByRow(tkbRows);
  let periodNum = 0;
  for (const row of sorted) {
    const content = row.content;
    const tiet = extractField(content, 'Tiết');
    const time = extractField(content, 'Thời gian');
    const cell = extractDayColumn(content, dayLabel);
    if (!time) continue;

    if (tiet === '-' || /Nghỉ/i.test(content)) {
      const isLunch = /Nghỉ trưa/i.test(content);
      const div = document.createElement('div');
      div.className = 'break-row';
      div.textContent = (isLunch ? '🍱 ' : '☕ ') + 'Nghỉ · ' + time.replace(/\s+/g, ' ');
      root.appendChild(div);
      continue;
    }

    if (!cell || !cell.subject) {
      const div = document.createElement('div');
      div.className = 'period-card';
      div.innerHTML =
        '<div class="top"><span class="per-num">' +
        tiet +
        '</span><span class="per-subj">' +
        DATA_PENDING_MSG +
        '</span></div>';
      root.appendChild(div);
      continue;
    }

    periodNum++;
    const subj = cell.subject.replace(/\s+/g, ' ');
    const teacher = cell.teacher || '—';
    const card = document.createElement('div');
    card.className = 'period-card';
    card.innerHTML =
      '<div class="top"><span class="per-num">' +
      tiet +
      '</span><span class="per-subj">' +
      escapeHtml(subj) +
      '</span><span class="per-time">' +
      escapeHtml(time) +
      '</span></div>' +
      '<div class="per-details"><div class="per-room">Phòng học: Phòng học lớp CN</div><div class="per-teacher">GV: ' +
      escapeHtml(teacher) +
      '</div></div>';
    root.appendChild(card);
  }
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/**
 * Chỉ hiển thị điểm danh cho đúng một ngày (ngày "hôm nay" / anchor từ ?date=),
 * không liệt kê toàn bộ lịch sử trong JSON.
 */
function renderAttendance(root, attRows, anchorDateStr) {
  const days = groupAttendanceByDay(attRows);
  const bar = document.getElementById('att-date-bar');
  if (bar) bar.textContent = '📅 ' + anchorDateStr;

  const day = days.find((x) => x.date === anchorDateStr);

  if (!day) {
    root.innerHTML =
      '<div style="padding:16px;color:#6b7280;font-size:13px;text-align:center;">' +
      DATA_PENDING_MSG +
      '</div>';
    setAttStats(0, 0, 0, 0);
    return;
  }

  const { onTime, late } = countAttendanceStats(day);
  setAttStats(onTime, late, 0, 0);

  const first = day.chunks[0] && day.chunks[0].content;
  let badge = '';
  if (first && first.includes('Điểm danh đầu giờ')) {
    const bm = first.match(/Điểm danh đầu giờ:\s*([^\n]+)/);
    const isLate = /Đi muộn/i.test(bm ? bm[1] : '');
    if (bm) {
      badge =
        '<span class="att-badge ' +
        (isLate ? 'lt' : 'ok') +
        '">GV chủ nhiệm điểm danh | ' +
        escapeHtml(bm[1].trim()) +
        '</span>';
    }
  }

  let html = '<div class="att-day">';
  html +=
    '<div class="att-day-hdr" style="cursor:default;"><span>' +
    escapeHtml(anchorDateStr) +
    '</span><span style="display:flex;align-items:center;gap:8px;">' +
    badge +
    '</span></div>';
  html += '<div>';
  for (const ch of day.chunks) {
    const c = ch.content;
    const time = extractField(c, 'Thời gian');
    const subj = extractField(c, 'Môn học');
    const st = extractField(c, 'Trạng thái tiết học');
    if (!time && !subj) continue;
    if (!time) continue;
    const ok = /Đúng giờ|Tiết kép/.test(st || '') ? 'att-ok' : 'att-lt';
    html +=
      '<div class="att-row"><span>' +
      escapeHtml(time) +
      ' · ' +
      escapeHtml(subj || '—') +
      '</span><span class="' +
      ok +
      '">' +
      escapeHtml(st || '—') +
      '</span></div>';
  }
  html += '</div></div>';
  root.innerHTML = html;
}

function renderMenu(root, menuDays, todayStr) {
  const day = menuDays.find((x) => x.date === todayStr);
  root.innerHTML = '';
  if (!day || !day.items.length) {
    root.innerHTML =
      '<div style="padding:20px;text-align:center;color:#92400e;font-size:13px;">' +
      DATA_PENDING_MSG +
      '</div>';
    return;
  }
  const lunch = day.items.filter((i) => /trưa|Ăn trưa/i.test(i.meal));
  const snack = day.items.filter((i) => /phụ|Ăn phụ/i.test(i.meal));
  let h = '';
  if (lunch.length) {
    h += '<div class="meal-section"><div class="meal-lbl lunch">🍽 Ăn trưa</div>';
    for (const i of lunch) {
      h +=
        '<div class="meal-item"><span class="meal-name">' +
        escapeHtml(i.name) +
        '</span><span class="meal-cal">' +
        escapeHtml(i.kcal || '') +
        '</span></div>';
    }
    h += '</div>';
  }
  if (snack.length) {
    h +=
      '<div class="meal-section" style="padding-top:12px;padding-bottom:16px;"><div class="meal-lbl snack">🥤 Ăn phụ</div>';
    for (const i of snack) {
      h +=
        '<div class="meal-item"><span class="meal-name">' +
        escapeHtml(i.name) +
        '</span><span class="meal-cal">' +
        escapeHtml(i.kcal || '') +
        '</span></div>';
    }
    h += '</div>';
  }
  root.innerHTML = h || '<div style="padding:16px;">' + DATA_PENDING_MSG + '</div>';
}

function renderHomework(todoEl, allEl, hwRows) {
  const parsed = hwRows.map((r) => ({ raw: r, ...parseHomework(r.content) }));
  const undone = (s) => /Chưa làm|Chưa hoàn thành/i.test(s || '');
  const todo = parsed.filter((p) => undone(p.status));
  const buildItem = (p) => {
    const tagClass = /CIE|5B06-/.test(p.subj) ? 'subj-tag blue' : 'subj-tag';
    const dot = /Chưa làm/.test(p.status || '')
      ? 'undone'
      : /Chưa hoàn thành/.test(p.status || '')
        ? 'pending'
        : 'done';
    return (
      '<div class="hw-item"><div class="' +
      tagClass +
      '">' +
      escapeHtml(p.subj) +
      '</div><div class="hw-name">' +
      escapeHtml(p.name) +
      '</div><div class="hw-meta"><div class="hw-status"><span class="sdot ' +
      dot +
      '"></span>' +
      escapeHtml(p.status || '') +
      (p.deadline ? ' · Hạn ' + escapeHtml(p.deadline) : '') +
      '</div><div class="hw-score">' +
      escapeHtml(p.score || '-') +
      '</div></div></div>'
    );
  };
  if (todoEl) {
    todoEl.innerHTML = todo.length
      ? todo.map(buildItem).join('')
      : '<div style="padding:14px;color:#6b7280;font-size:13px;">' + DATA_PENDING_MSG + '</div>';
  }
  if (allEl) {
    allEl.innerHTML = parsed.length
      ? parsed.map(buildItem).join('')
      : '<div style="padding:14px;color:#6b7280;font-size:13px;">' + DATA_PENDING_MSG + '</div>';
  }
}

function renderComments(root, nxRows, todayStr) {
  const parsed = nxRows
    .map((r) => ({ ...parseComment(r.content), id: r.id }))
    .filter((p) => p.iso);
  parsed.sort((a, b) => b.iso.localeCompare(a.iso));
  const bar = document.getElementById('cmt-date-bar');
  if (bar) bar.textContent = '📅 ' + todayStr;
  if (!parsed.length) {
    root.innerHTML =
      '<div style="padding:16px;color:#6b7280;font-size:13px;">' + DATA_PENDING_MSG + '</div>';
    return;
  }
  let h = '';
  for (const p of parsed.slice(0, 12)) {
    h +=
      '<div class="cmt-card"><div class="cmt-hdr"><div class="cmt-avatar">👨‍🏫</div><div><div class="cmt-tname">' +
      escapeHtml(p.gv) +
      '</div><div class="cmt-sub">' +
      escapeHtml(p.mon) +
      '</div></div><div class="cmt-date">' +
      escapeHtml(p.shortDate) +
      '</div></div>';
    h += '<div class="cmt-text">' + escapeHtml(p.txt) + '</div>';
    h +=
      '<div class="cmt-action"><span>👍 1</span><span>💬 Bình luận</span></div></div>';
  }
  root.innerHTML = h;
}

function renderAiSearch(aiRoot, hwRows, menuDays, todayStr) {
  const todo = hwRows
    .map((r) => parseHomework(r.content))
    .filter((p) => /Chưa làm|Chưa hoàn thành/i.test(p.status || ''));
  const day = menuDays.find((x) => x.date === todayStr);
  let h = '';

  h += '<div style="padding:8px 14px 4px;font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.3px;">KẾT QUẢ GẦN ĐÂY</div>';
  h += '<div class="ai-result-card"><div class="ai-result-header"><span style="font-size:18px;">📋</span>';
  h +=
    '<span class="ai-result-title">Bài tập chưa làm — theo dữ liệu nhà trường</span><span class="ai-badge">AI ✨</span></div><div class="ai-result-body">';
  if (!todo.length) {
    h +=
      '<div style="padding:8px;color:#6b7280;font-size:13px;">' + DATA_PENDING_MSG + '</div>';
  } else {
    for (const p of todo.slice(0, 5)) {
      const urg = p.deadline ? p.deadline : '';
      h +=
        '<div class="ai-result-row"><span class="ri">📝</span><span class="rt">' +
        escapeHtml(p.name) +
        ' · ' +
        escapeHtml(p.subj) +
        '</span><span class="rb" style="color:#ef4444;font-weight:700;">' +
        escapeHtml(urg) +
        '</span></div>';
    }
  }
  h +=
    '<button class="ai-deeplink-btn" onclick="goTo(\'page-homework\')">Mở Bài tập - Kiểm tra →</button><div class="ai-source-badge">📊 Dữ liệu từ Bài tập</div></div></div>';

  h += '<div class="ai-result-card"><div class="ai-result-header"><span style="font-size:18px;">🍱</span>';
  const d = parseDateDMY(todayStr);
  const wd = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()];
  h +=
    '<span class="ai-result-title">Thực đơn — ' +
    wd +
    ', ' +
    todayStr.slice(0, 5) +
    '</span><span class="ai-badge">AI ✨</span></div><div class="ai-result-body">';
  if (!day || !day.items.length) {
    h +=
      '<div style="padding:8px;color:#6b7280;font-size:13px;">' + DATA_PENDING_MSG + '</div>';
  } else {
    for (const it of day.items.slice(0, 6)) {
      h +=
        '<div class="ai-result-row"><span class="ri">🍽</span><span class="rt">' +
        escapeHtml(it.name) +
        '</span><span class="rb">' +
        escapeHtml((it.kcal || '').replace(/kcal.*/i, '').trim()) +
        '</span></div>';
    }
  }
  h +=
    '<button class="ai-deeplink-btn" onclick="goTo(\'page-menu\')">Xem thực đơn đầy đủ →</button><div class="ai-source-badge">📊 Dữ liệu từ Thực đơn</div></div></div>';

  aiRoot.innerHTML = h;
}

function renderNotifBrief(root, notifRows, hwRows, menuDays, nxRows, todayStr) {
  if (!root) return;
  const d = parseDateDMY(todayStr);
  const thu = thuLabelFromDate(d);
  const nEv = notifRows.length;
  const todo = hwRows
    .map((r) => parseHomework(r.content))
    .filter((p) => /Chưa làm|Chưa hoàn thành/i.test(p.status || ''));
  const day = menuDays.find((x) => x.date === todayStr);
  const lunchItem =
    day && day.items.find((i) => /trưa|Ăn trưa/i.test(i.meal || ''));
  const snackItem =
    day && day.items.find((i) => /phụ|xế|snack/i.test(i.meal || ''));
  const comments = nxRows
    .map((r) => parseComment(r.content))
    .filter((p) => p.iso);
  comments.sort((a, b) => b.iso.localeCompare(a.iso));
  const c0 = comments[0];

  let br1m =
    todo.length > 0
      ? todo.length + ' bài tập chưa nộp'
      : 'Không có bài tập chưa nộp';
  let br1s = todo.length ? '' : 'Theo dữ liệu bài tập trong app';
  if (todo.length) {
    const u = todo[0];
    br1s =
      'Hạn sớm nhất: ' +
      (u.name || '—') +
      (u.deadline ? ' — hạn ' + u.deadline : '');
  }

  let br2m = DATA_PENDING_MSG;
  let br2s = '';
  if (lunchItem) {
    br2m = 'Bữa trưa: ' + lunchItem.name.split(/[,+]/)[0].trim();
    br2s =
      (lunchItem.kcal || '').replace(/kcal.*/i, '').trim() +
      (snackItem ? ' · Ăn phụ: ' + snackItem.name.split(/[,+]/)[0].trim() : '');
  }

  let br3m = DATA_PENDING_MSG;
  let br3s = '';
  if (c0 && c0.txt) {
    br3m = (c0.gv || 'Giáo viên') + ' — ' + (c0.mon || '');
    br3s = c0.txt.length > 90 ? c0.txt.slice(0, 90) + '…' : c0.txt;
  }

  root.innerHTML =
    '<div class="brief-card" onclick="goTo(\'page-ai-brief\')">' +
    '<div class="brief-header"><div><div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">' +
    '<span class="ai-badge">AI ✨</span><span class="brief-title">Bản tin hôm nay</span></div>' +
    '<div class="brief-date">' +
    escapeHtml(thu + ', ' + todayStr + ' · Tổng hợp ' + nEv + ' thông báo') +
    '</div></div><span style="font-size:20px;">›</span></div>' +
    '<div class="brief-body">' +
    '<div class="brief-row"><div class="br-ico">📋</div><div class="br-text"><div class="br-main">' +
    escapeHtml(br1m) +
    '</div><div class="br-sub">' +
    escapeHtml(br1s) +
    '</div></div></div>' +
    '<div class="brief-row"><div class="br-ico">🍱</div><div class="br-text"><div class="br-main">' +
    escapeHtml(br2m) +
    '</div><div class="br-sub">' +
    escapeHtml(br2s || '—') +
    '</div></div></div>' +
    '<div class="brief-row"><div class="br-ico">💬</div><div class="br-text"><div class="br-main">' +
    escapeHtml(br3m) +
    '</div><div class="br-sub">' +
    escapeHtml(br3s || '—') +
    '</div></div></div></div></div>';
}

function renderNotifActionable(root, featuredRow) {
  if (!root) return;
  if (!featuredRow) {
    root.innerHTML = '';
    return;
  }
  const p = parseNotification(featuredRow.content);
  const ico = notifIconForType(p.type);
  const titleShort =
    p.type && p.title
      ? p.type + ': ' + p.title
      : p.title || 'Thông báo';
  const dateLine =
    escapeHtml(formatNotifWhenLine(p)) +
    ' · <span class="ai-badge">AI tóm tắt ✨</span>';
  const b1 =
    '<strong>Sự kiện:</strong> ' +
    escapeHtml(p.summary || '—') +
    (p.audience ? ' · ' + escapeHtml(p.audience) : '');
  const b2 =
    '<strong>Hạn / lịch:</strong> ' +
    escapeHtml(
      (p.deadline && p.deadline !== 'Không ghi rõ' ? p.deadline : '—') +
        (p.eventDate && p.eventDate !== 'N/A' ? ' · Ngày SK: ' + p.eventDate : '')
    );
  const b3 = '<strong>Cần làm:</strong> ' + escapeHtml(p.status || '—');
  const cta = ctaLabelFromNotifStatus(p.status);

  root.innerHTML =
    '<div class="action-notif">' +
    '<div class="action-notif-header"><div class="action-notif-ico">' +
    ico +
    '</div><div><div class="action-notif-title">' +
    escapeHtml(titleShort) +
    '</div><div class="action-notif-date">' +
    dateLine +
    '</div></div></div>' +
    '<div class="action-bullets">' +
    '<div class="action-bullet"><span class="abico">📌</span><span>' +
    b1 +
    '</span></div>' +
    '<div class="action-bullet"><span class="abico">⏰</span><span>' +
    b2 +
    '</span></div>' +
    '<div class="action-bullet"><span class="abico">✅</span><span>' +
    b3 +
    '</span></div></div>' +
    '<div class="action-notif-footer">' +
    '<button type="button" class="action-btn-primary notif-open-detail">' +
    escapeHtml(cta) +
    '</button>' +
    '<button type="button" class="action-btn-secondary notif-open-detail">Đọc toàn văn bản</button>' +
    '</div></div>';

  const nid = featuredRow.id;
  const card = root.querySelector('.action-notif');
  const open = (e) => {
    if (e) e.stopPropagation();
    if (typeof window.openNotifDetail === 'function') window.openNotifDetail(nid);
  };
  root.querySelectorAll('.notif-open-detail').forEach((btn) => btn.addEventListener('click', open));
  if (card) {
    card.style.cursor = 'pointer';
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      open();
    });
  }
}

function renderNotifList(root, notifRows) {
  if (!root) return;
  const sorted = notifRows
    .slice()
    .sort((a, b) => notifRecencySortKey(b) - notifRecencySortKey(a));
  if (!sorted.length) {
    root.innerHTML =
      '<div style="padding:16px;color:#6b7280;font-size:13px;">' + DATA_PENDING_MSG + '</div>';
    return;
  }
  root.innerHTML = '';
  sorted.forEach((row, idx) => {
    const p = parseNotification(row.content);
    const ico = notifIconForType(p.type);
    const desc =
      p.summary.length > 120 ? p.summary.slice(0, 120) + '…' : p.summary;
    const dateShown = formatNotifWhenLine(p);
    const wrap = document.createElement('div');
    wrap.className = 'notif-row';
    wrap.setAttribute('role', 'button');
    wrap.tabIndex = 0;
    wrap.setAttribute('aria-label', 'Đọc thông báo: ' + (p.title || ''));
    const open = () => {
      if (typeof window.openNotifDetail === 'function') window.openNotifDetail(row.id);
    };
    wrap.addEventListener('click', open);
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
    wrap.innerHTML =
      '<div class="notif-ico">' +
      ico +
      '</div><div class="notif-body"><div class="notif-title">' +
      escapeHtml(p.title || 'Thông báo') +
      '</div><div class="notif-desc">' +
      escapeHtml(desc || '—') +
      '</div><div class="notif-date">' +
      escapeHtml(dateShown) +
      '</div></div>' +
      (idx === 0 ? '<div class="notif-dot"></div>' : '');
    root.appendChild(wrap);
  });
}

function renderNotificationsTab(notifRows, hwRows, menuDays, nxRows, todayStr) {
  renderNotifBrief(
    document.getElementById('notif-brief-root'),
    notifRows,
    hwRows,
    menuDays,
    nxRows,
    todayStr
  );
  renderNotifActionable(
    document.getElementById('notif-actionable-root'),
    pickFeaturedNotification(notifRows)
  );
  renderNotifList(document.getElementById('notif-regular-list'), notifRows);
}

function renderWeekStrips() {
  const viewing = window.__protoViewingDate || getTodayStr();
  const anchor = window.__protoAnchorToday || getTodayStr();
  const mon = mondayOfWeek(parseDateDMY(viewing));
  const end = addDays(mon, 6);
  const rangeLabel = toDMY(mon) + ' – ' + toDMY(end);
  const labels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  let inner = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i);
    const dmy = toDMY(d);
    const cls = ['day-cell'];
    if (dmy === anchor) cls.push('today');
    if (dmy === viewing) cls.push('selected');
    inner +=
      '<div class="' +
      cls.join(' ') +
      '" onclick="protoSelectDay(\'' +
      dmy +
      "')\"><div class=\"dn\">" +
      labels[i] +
      '</div><div class="dd">' +
      d.getDate() +
      '</div></div>';
  }
  const schedEl = document.getElementById('schedule-week-days');
  const menuEl = document.getElementById('menu-week-days');
  if (schedEl) schedEl.innerHTML = inner;
  if (menuEl) menuEl.innerHTML = inner;
  const ml = document.getElementById('schedule-month-label');
  const ml2 = document.getElementById('menu-month-label');
  if (ml) ml.textContent = rangeLabel;
  if (ml2) ml2.textContent = rangeLabel;
}

function protoRefreshScheduleMenuOnly() {
  const b = window.__protoRagBundle;
  if (!b) return;
  renderWeekStrips();
  const v = window.__protoViewingDate || getTodayStr();
  const schedRoot = document.getElementById('schedule-periods-root');
  const menuRoot = document.getElementById('menu-root');
  if (schedRoot) renderSchedule(schedRoot, b.tkb, v);
  if (menuRoot) renderMenu(menuRoot, b.menuDays, v);
}

window.protoSelectDay = function (dmy) {
  window.__protoViewingDate = dmy;
  protoRefreshScheduleMenuOnly();
};

window.protoShiftWeek = function (delta) {
  const cur = window.__protoViewingDate || getTodayStr();
  const d = parseDateDMY(cur);
  d.setDate(d.getDate() + 7 * delta);
  window.__protoViewingDate = toDMY(d);
  protoRefreshScheduleMenuOnly();
};

function updateHomeBanner(todayStr, menuDays, hwRows) {
  const lbl = document.querySelector('#page-home .smart-banner .lbl');
  const ttl = document.querySelector('#page-home .smart-banner .ttl');
  const d = parseDateDMY(todayStr);
  const tnames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const thu = tnames[d.getDay()];
  if (lbl) {
    lbl.textContent = '✨ SMART DAILY BRIEF · ' + thu.toUpperCase() + ', ' + todayStr;
  }
  const todoN = hwRows.filter((r) =>
    /Chưa làm|Chưa hoàn thành/i.test(parseHomework(r.content).status || '')
  ).length;
  const lunch = menuDays.find((x) => x.date === todayStr);
  const lunchItem =
    lunch && lunch.items.find((i) => /trưa|Ăn trưa/i.test(i.meal || ''));
  if (ttl) {
    ttl.textContent = lunchItem
      ? 'Hưng có ' +
        todoN +
        ' bài tập chưa làm · Bữa trưa: ' +
        lunchItem.name.split(/[,+]/)[0].trim()
      : 'Hưng có ' + todoN + ' bài tập chưa làm · ' + DATA_PENDING_MSG;
  }
}

function parseHomeworkIsoDeadline(content) {
  const hm = content.match(/Hạn nộp dự kiến:\s*(\d{4}-\d{2}-\d{2})/);
  return hm ? hm[1] : '';
}

function homeworkRecencyKey(row) {
  const iso = parseHomeworkIsoDeadline(row.content);
  if (iso) return new Date(iso).getTime();
  return (row.metadata && row.metadata.row) || 0;
}

function isMeaningfulScore(score) {
  const s = (score || '').trim();
  if (!s || s === '-' || s === '—') return false;
  if (/^-\//.test(s)) return false;
  return /\d/.test(s);
}

function pickLatestScoredHomework(hwRows) {
  const scored = hwRows
    .filter((r) => {
      const p = parseHomework(r.content);
      return isMeaningfulScore(p.score) && /Đã làm|Hoàn thành/i.test(p.status || '');
    })
    .slice()
    .sort((a, b) => homeworkRecencyKey(b) - homeworkRecencyKey(a));
  return scored[0] || null;
}

function renderHomeFeed(root, bundle, todayStr) {
  if (!root) return;
  if (!bundle) {
    root.innerHTML =
      '<div style="padding:14px;color:#6b7280;font-size:13px;">' + DATA_PENDING_MSG + '</div>';
    return;
  }

  const items = [];

  // 1) Điểm mới nhất (từ Bài tập có điểm)
  const latestHw = bundle.hw ? pickLatestScoredHomework(bundle.hw) : null;
  if (latestHw) {
    const p = parseHomework(latestHw.content);
    const iso = parseHomeworkIsoDeadline(latestHw.content);
    let dateShown = '';
    if (iso) {
      const [Y, M, D] = iso.split('-');
      dateShown = `${D}/${M}/${Y}`;
    }
    items.push({
      kind: 'score',
      key: homeworkRecencyKey(latestHw),
      icon: '🏆',
      title: `Cập nhật điểm mới: ${p.subj || '—'}`,
      desc: `${p.name || '—'}: ${p.score || '—'}`,
      date: dateShown || todayStr,
      onOpen: () => (typeof goTo === 'function' ? goTo('page-homework') : null),
    });
  }

  // 2) Nhận xét mới nhất
  const comments = (bundle.nx || [])
    .map((r) => ({ row: r, p: parseComment(r.content) }))
    .filter((x) => x.p && x.p.iso)
    .sort((a, b) => b.p.iso.localeCompare(a.p.iso))
    .slice(0, 3)
    .map((x) => ({
      kind: 'comment',
      key: new Date(x.p.iso).getTime(),
      icon: '📝',
      title: `${x.p.gv || 'Giáo viên'} có nhận xét`,
      desc: x.p.txt || '—',
      date: x.p.iso ? (() => { const [Y, M, D] = x.p.iso.split('-'); return `${D}/${M}/${Y}`; })() : todayStr,
      onOpen: () => (typeof goTo === 'function' ? goTo('page-comments') : null),
    }));

  // 3) Thông báo mới nhất
  const notifs = (bundle.notif || [])
    .slice()
    .sort((a, b) => notifRecencySortKey(b) - notifRecencySortKey(a))
    .slice(0, 3)
    .map((row) => {
      const p = parseNotification(row.content);
      return {
        kind: 'notif',
        key: notifRecencySortKey(row),
        icon: notifIconForType(p.type),
        title: p.title || 'Thông báo',
        desc: p.summary || '—',
        date: formatNotifWhenLine(p),
        onOpen: () =>
          typeof window.openNotifDetail === 'function' ? window.openNotifDetail(row.id) : null,
      };
    });

  // Trộn comment + notif, lấy 3 cái mới nhất theo key (điểm đã được pin lên đầu).
  const mixed = comments.concat(notifs).sort((a, b) => b.key - a.key).slice(0, 3);
  const finalItems = items.concat(mixed).slice(0, 4);

  if (!finalItems.length) {
    root.innerHTML =
      '<div style="padding:14px;color:#6b7280;font-size:13px;">' + DATA_PENDING_MSG + '</div>';
    return;
  }

  root.innerHTML = '';
  finalItems.forEach((it, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'notif-row';
    wrap.setAttribute('role', 'button');
    wrap.tabIndex = 0;
    wrap.addEventListener('click', () => it.onOpen && it.onOpen());
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        it.onOpen && it.onOpen();
      }
    });
    const desc = (it.desc || '').length > 110 ? it.desc.slice(0, 110) + '…' : it.desc || '—';
    wrap.innerHTML =
      '<div class="notif-ico">' +
      escapeHtml(it.icon) +
      '</div><div class="notif-body"><div class="notif-title">' +
      escapeHtml(it.title) +
      '</div><div class="notif-desc">' +
      escapeHtml(desc) +
      '</div><div class="notif-date">' +
      escapeHtml(it.date || todayStr) +
      '</div></div>' +
      (idx === 0 ? '<div class="notif-dot"></div>' : '');
    root.appendChild(wrap);
  });
}

window.initPrototypeFromRag = async function initPrototypeFromRag() {
  const anchorToday = getTodayStr();
  window.__protoAnchorToday = anchorToday;
  window.__protoViewingDate = anchorToday;

  let data;
  try {
    const res = await fetch('rag_data.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
  } catch (e) {
    const msg =
      DATA_PENDING_MSG +
      ' (Không tải được rag_data.json — hãy chạy máy chủ tĩnh trong thư mục này.)';
    [
      'schedule-periods-root',
      'attendance-root',
      'menu-root',
      'comments-root',
      'notif-brief-root',
      'notif-actionable-root',
      'notif-regular-list',
      'home-feed-root',
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el)
        el.innerHTML =
          '<div style="padding:16px;color:#6b7280;font-size:12px;">' + msg + '</div>';
    });
    const ai = document.getElementById('ai-search-results-root');
    if (ai) ai.innerHTML = '<div class="ai-result-card"><div class="ai-result-body">' + msg + '</div></div>';
    return;
  }

  const tkb = filterSheet(data, 'Thời khoá biểu');
  const att = filterSheet(data, 'Điểm danh');
  const menuDays = groupMenuByDay(filterSheet(data, 'Thực đơn'));
  const hw = filterSheet(data, 'Bài tập');
  const nx = filterSheet(data, 'Nhận xét');
  const notif = filterSheet(data, 'Thông báo');

  window.__protoRagBundle = { tkb, att, menuDays, hw, nx, notif };

  renderWeekStrips();

  const schedRoot = document.getElementById('schedule-periods-root');
  if (schedRoot) renderSchedule(schedRoot, tkb, window.__protoViewingDate);

  const attRoot = document.getElementById('attendance-root');
  if (attRoot) renderAttendance(attRoot, att, anchorToday);

  const menuRoot = document.getElementById('menu-root');
  if (menuRoot) renderMenu(menuRoot, menuDays, window.__protoViewingDate);

  renderHomework(
    document.getElementById('hw-todo'),
    document.getElementById('hw-all'),
    hw
  );

  const cmtRoot = document.getElementById('comments-root');
  if (cmtRoot) renderComments(cmtRoot, nx, anchorToday);

  const aiRoot = document.getElementById('ai-search-results-root');
  if (aiRoot) renderAiSearch(aiRoot, hw, menuDays, anchorToday);

  updateHomeBanner(anchorToday, menuDays, hw);

  renderNotificationsTab(notif, hw, menuDays, nx, anchorToday);

  const homeFeed = document.getElementById('home-feed-root');
  renderHomeFeed(homeFeed, window.__protoRagBundle, anchorToday);
};
