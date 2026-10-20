// 화면 렌더링과 이벤트 처리

const EMOJIS = ['📌', '🛏️', '🧺', '🧹', '🚽', '🧊', '♻️', '💧', '🪒', '💇', '💅', '🦷', '🏥', '💊', '🌱', '🚗', '📞', '🐶', '🧴', '🧼'];

const SUGGESTIONS = [
  { name: '이불 빨래', icon: '🛏️', cycleDays: 14 },
  { name: '화장실 청소', icon: '🚽', cycleDays: 7 },
  { name: '냉장고 청소', icon: '🧊', cycleDays: 30 },
  { name: '칫솔 교체', icon: '🦷', cycleDays: 90 },
  { name: '정수기 필터 교체', icon: '💧', cycleDays: 90 },
  { name: '머리 자르기', icon: '💇', cycleDays: 30 },
  { name: '손톱 깎기', icon: '💅', cycleDays: 7 },
  { name: '치과 검진', icon: '🏥', cycleDays: 180 },
  { name: '화분 물 주기', icon: '🌱', cycleDays: 7 },
  { name: '부모님께 전화', icon: '📞', cycleDays: 7 },
];

const LEVEL_LABEL = { ok: '여유', soon: '곧 할 때', over: '지남', none: '' };
const TOAST_MS = 5000;

const $ = (id) => document.getElementById(id);

const els = {
  list: $('item-list'),
  empty: $('empty-state'),
  suggestions: $('suggestion-list'),
  template: $('item-template'),
  sort: $('sort-select'),
  warning: $('storage-warning'),
  addButton: $('add-button'),
  dialog: $('item-dialog'),
  dialogTitle: $('dialog-title'),
  form: $('item-form'),
  icon: $('field-icon'),
  emojiPicker: $('emoji-picker'),
  name: $('field-name'),
  cycle: $('field-cycle'),
  last: $('field-last'),
  formError: $('form-error'),
  deleteButton: $('delete-button'),
  cancelButton: $('cancel-button'),
  toast: $('toast'),
  toastMessage: $('toast-message'),
  toastUndo: $('toast-undo'),
  sortWrap: $('sort-wrap'),
  syncStatus: $('sync-status'),
  viewTabs: document.querySelectorAll('.view-tabs [role="tab"]'),
  listView: $('list-view'),
  calendarView: $('calendar-view'),
  calTitle: $('cal-title'),
  calSummary: $('cal-summary'),
  calPrev: $('cal-prev'),
  calNext: $('cal-next'),
  calToday: $('cal-today'),
  calFilter: $('cal-filter'),
  calGrid: $('cal-grid'),
  calDetailTitle: $('cal-detail-title'),
  calDetailDesc: $('cal-detail-desc'),
  calDetailList: $('cal-detail-list'),
};

const CAL_MAX_ICONS = 3;
const DELETE_ARM_MS = 3000;
let deleteArmTimer = null;

let items = loadItems();
let sortMode = loadSort();
let editingId = null;
let toastTimer = null;
let undoAction = null;

let currentView = 'list';
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0~11
let calSelected = todayStr();
let calFilter = 'all';

/* ===== 상태 계산 ===== */

function getStatus(item, today) {
  const last = item.history[0];
  if (!last) return { days: null, ratio: null, level: 'none' };

  const days = daysBetween(last, today);
  if (!item.cycleDays) return { days, ratio: null, level: 'none' };

  const ratio = days / item.cycleDays;
  const level = ratio >= 1 ? 'over' : ratio >= 0.7 ? 'soon' : 'ok';
  return { days, ratio, level };
}

function describe(item, status) {
  const elapsed = formatElapsed(status.days);
  if (!item.cycleDays) return elapsed;
  if (status.days === null) return `${elapsed} · 주기 ${item.cycleDays}일`;

  const diff = status.days - item.cycleDays;
  if (diff > 0) return `${elapsed} · ${diff}일 지남`;
  if (diff === 0) return `${elapsed} · 오늘 할 차례`;
  return `${elapsed} · ${-diff}일 남음`;
}

/* ===== 정렬 ===== */

function byName(a, b) {
  return a.item.name.localeCompare(b.item.name, 'ko');
}

// 급한 순: 주기 있는 항목(비율 높은 순) → 주기 없는 항목(오래된 순) → 기록 없는 항목
function urgentGroup(entry) {
  if (entry.status.days === null) return 2;
  return entry.status.ratio !== null ? 0 : 1;
}

function sortEntries(entries) {
  if (sortMode === 'name') return entries.sort(byName);

  const daysOf = (e) => (e.status.days === null ? -1 : e.status.days);
  if (sortMode === 'oldest') return entries.sort((a, b) => daysOf(b) - daysOf(a) || byName(a, b));

  return entries.sort((a, b) => {
    const group = urgentGroup(a) - urgentGroup(b);
    if (group) return group;
    if (urgentGroup(a) === 0) return b.status.ratio - a.status.ratio || byName(a, b);
    return daysOf(b) - daysOf(a) || byName(a, b);
  });
}

/* ===== 렌더링 ===== */

function render(highlightId) {
  const today = todayStr();
  const entries = sortEntries(items.map((item) => ({ item, status: getStatus(item, today) })));

  els.list.replaceChildren(...entries.map((entry) => createCard(entry, entry.item.id === highlightId)));
  els.empty.hidden = items.length > 0;
  if (!items.length) renderSuggestions();
  if (currentView === 'calendar') renderCalendar();
}

/* ===== 보기 전환 ===== */

function setView(view) {
  currentView = view;
  for (const tab of els.viewTabs) {
    tab.setAttribute('aria-selected', String(tab.dataset.view === view));
  }
  els.listView.hidden = view !== 'list';
  els.calendarView.hidden = view !== 'calendar';
  els.sortWrap.hidden = view !== 'list';
  render();
}

/* ===== 달력 ===== */

function moveMonth(offset) {
  const date = new Date(calYear, calMonth + offset, 1);
  calYear = date.getFullYear();
  calMonth = date.getMonth();
  renderCalendar();
}

function goToday() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
  calSelected = todayStr();
  renderCalendar();
}

// 날짜 → 그날 기록한 항목 목록
function buildRecordMap() {
  const map = new Map();
  for (const item of items) {
    if (calFilter !== 'all' && item.id !== calFilter) continue;
    for (const date of item.history) {
      if (!map.has(date)) map.set(date, []);
      map.get(date).push(item);
    }
  }
  return map;
}

function renderCalFilter() {
  if (calFilter !== 'all' && !findItem(calFilter)) calFilter = 'all';

  const options = [new Option('전체 항목', 'all')];
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  for (const item of sorted) options.push(new Option(`${item.icon} ${item.name}`, item.id));

  els.calFilter.replaceChildren(...options);
  els.calFilter.value = calFilter;
}

function renderCalendar() {
  const today = todayStr();
  const records = buildRecordMap();
  const monthPrefix = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-`;

  renderCalFilter();
  els.calTitle.textContent = `${calYear}년 ${calMonth + 1}월`;

  let monthCount = 0;
  for (const [date, list] of records) {
    if (date.startsWith(monthPrefix)) monthCount += list.length;
  }
  els.calSummary.textContent = monthCount ? `이번 달 기록 ${monthCount}회` : '이번 달 기록 없음';

  const firstWeekday = new Date(calYear, calMonth, 1).getDay();
  const lastDay = new Date(calYear, calMonth + 1, 0).getDate();
  const cells = [];

  for (let i = 0; i < firstWeekday; i++) {
    const blank = document.createElement('span');
    blank.className = 'cal-day is-empty';
    cells.push(blank);
  }

  for (let day = 1; day <= lastDay; day++) {
    const date = formatDate(new Date(calYear, calMonth, day));
    const dayRecords = records.get(date) || [];
    const weekday = (firstWeekday + day - 1) % 7;

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-day';
    cell.dataset.date = date;
    if (date === today) cell.classList.add('is-today');
    if (date === calSelected) cell.classList.add('is-selected');
    if (date > today) cell.classList.add('is-future');
    if (dayRecords.length) cell.classList.add('has-record');

    const num = document.createElement('span');
    num.className = 'cal-num';
    if (weekday === 0) num.classList.add('sun');
    if (weekday === 6) num.classList.add('sat');
    num.textContent = day;

    const icons = document.createElement('span');
    icons.className = 'cal-icons';
    const overflow = dayRecords.length > CAL_MAX_ICONS;
    const shown = overflow ? dayRecords.slice(0, CAL_MAX_ICONS - 1) : dayRecords;
    icons.textContent = shown.map((item) => item.icon).join('');
    if (overflow) {
      const more = document.createElement('span');
      more.className = 'cal-more';
      more.textContent = `+${dayRecords.length - shown.length}`;
      icons.append(more);
    }

    const label = dayRecords.length
      ? `${formatKoreanDate(date)}, ${dayRecords.map((item) => item.name).join(', ')}`
      : formatKoreanDate(date);
    cell.setAttribute('aria-label', label);
    cell.setAttribute('aria-pressed', String(date === calSelected));

    cell.append(num, icons);
    cells.push(cell);
  }

  els.calGrid.replaceChildren(...cells);
  renderCalDetail(today);
}

// 선택한 날짜의 기록: 항목 칩을 눌러 그날 기록을 추가·삭제
function renderCalDetail(today) {
  const isFuture = calSelected > today;
  const done = items.filter((item) => item.history.includes(calSelected));

  els.calDetailTitle.textContent = formatKoreanDate(calSelected) + (calSelected === today ? ' · 오늘' : '');

  if (!items.length) {
    els.calDetailDesc.textContent = '먼저 목록에서 항목을 추가해 주세요.';
  } else if (isFuture) {
    els.calDetailDesc.textContent = '미래 날짜에는 기록할 수 없어요.';
  } else {
    els.calDetailDesc.textContent = done.length
      ? `${done.length}개 기록 · 항목을 눌러 기록을 추가하거나 지울 수 있어요.`
      : '기록 없음 · 이날 한 일을 눌러 기록하세요.';
  }

  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  els.calDetailList.replaceChildren(
    ...sorted.map((item) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${item.icon} ${item.name}`;
      button.setAttribute('aria-pressed', String(item.history.includes(calSelected)));
      button.disabled = isFuture;
      button.addEventListener('click', () => toggleRecord(item.id, calSelected));
      li.append(button);
      return li;
    })
  );
}

function toggleRecord(id, date) {
  const item = findItem(id);
  if (!item || date > todayStr()) return;

  const had = item.history.includes(date);
  item.history = had
    ? item.history.filter((d) => d !== date)
    : normalizeHistory([date, ...item.history]);
  persist();
  render();
  showToast(had ? `${item.name}: ${formatKoreanDate(date)} 기록을 지웠어요` : `✅ ${item.name}: ${formatKoreanDate(date)} 기록했어요`);
}

function createCard({ item, status }, highlight) {
  const node = els.template.content.firstElementChild.cloneNode(true);
  node.dataset.id = item.id;
  node.classList.add(`level-${status.level}`);
  if (highlight) node.classList.add('just-done');

  node.querySelector('.item-icon').textContent = item.icon;
  node.querySelector('.item-name').textContent = item.name;
  node.querySelector('.item-meta').textContent = describe(item, status);
  node.querySelector('.item-badge').textContent = LEVEL_LABEL[status.level];
  node.querySelector('.item-main').setAttribute('aria-label', `${item.name} 수정`);
  node.querySelector('.done-button').setAttribute('aria-label', `${item.name} 했어요`);
  return node;
}

function renderSuggestions() {
  els.suggestions.replaceChildren(
    ...SUGGESTIONS.map((s) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${s.icon} ${s.name}`;
      button.addEventListener('click', () => addSuggestion(s));
      li.append(button);
      return li;
    })
  );
}

function renderEmojiPicker() {
  els.emojiPicker.replaceChildren(
    ...EMOJIS.map((emoji) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = emoji;
      button.setAttribute('aria-label', `아이콘 ${emoji}`);
      button.addEventListener('click', () => {
        els.icon.value = emoji;
        syncEmojiPicker();
      });
      return button;
    })
  );
}

function syncEmojiPicker() {
  for (const button of els.emojiPicker.children) {
    button.setAttribute('aria-pressed', String(button.textContent === els.icon.value));
  }
}

/* ===== 저장 ===== */

function persist() {
  const ok = saveItems(items);
  els.warning.hidden = ok;
  cloudSchedulePush();
}

const SYNC_LABEL = {
  connecting: '☁️ 연결 중…',
  syncing: '☁️ 저장 중…',
  synced: '☁️ 클라우드에 저장됨',
  offline: '📴 오프라인 · 기기에만 저장됨',
  error: '⚠️ 클라우드 연결 실패 · 기기에만 저장됨',
};

function renderSyncStatus(state) {
  els.syncStatus.dataset.state = state;
  els.syncStatus.textContent = SYNC_LABEL[state] || '';
}

function findItem(id) {
  return items.find((item) => item.id === id);
}

/* ===== 동작 ===== */

function markDone(id) {
  const item = findItem(id);
  if (!item) return;

  const today = todayStr();
  if (item.history[0] === today) {
    showToast(`${item.name}: 오늘 이미 기록했어요`);
    return;
  }

  const previous = [...item.history];
  item.history = normalizeHistory([today, ...item.history]);
  persist();
  render(id);

  showToast(`✅ ${item.name} 기록했어요`, () => {
    const target = findItem(id);
    if (!target) return;
    target.history = previous;
    persist();
    render();
  });
}

function addSuggestion(suggestion) {
  items.push({
    id: createId(),
    name: suggestion.name,
    icon: suggestion.icon,
    cycleDays: suggestion.cycleDays,
    history: [],
    createdAt: todayStr(),
  });
  persist();
  render();
  showToast(`${suggestion.name} 추가했어요`);
}

// confirm()은 인앱 브라우저 등에서 막혀 항상 false가 될 수 있어,
// 삭제 버튼을 두 번 누르게 하고 삭제 후 되돌리기를 제공합니다.
function resetDeleteButton() {
  clearTimeout(deleteArmTimer);
  deleteArmTimer = null;
  els.deleteButton.classList.remove('armed');
  els.deleteButton.textContent = '이 항목 삭제';
}

function handleDeleteClick() {
  if (!els.deleteButton.classList.contains('armed')) {
    els.deleteButton.classList.add('armed');
    els.deleteButton.textContent = '한 번 더 누르면 삭제돼요';
    deleteArmTimer = setTimeout(resetDeleteButton, DELETE_ARM_MS);
    return;
  }
  resetDeleteButton();
  deleteItem(editingId);
}

function deleteItem(id) {
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) return;
  const [removed] = items.splice(index, 1);

  persist();
  render();
  els.dialog.close();

  showToast(`${removed.name} 삭제했어요`, () => {
    if (findItem(removed.id)) return;
    items.splice(Math.min(index, items.length), 0, removed);
    persist();
    render();
  });
}

/* ===== 다이얼로그 ===== */

function openDialog(id = null) {
  // 이미 열려 있을 때 showModal()을 다시 부르면 오류가 납니다.
  if (els.dialog.open) return;
  const item = id ? findItem(id) : null;
  editingId = item ? item.id : null;

  els.dialogTitle.textContent = item ? '항목 수정' : '항목 추가';
  els.icon.value = item ? item.icon : '📌';
  els.name.value = item ? item.name : '';
  els.cycle.value = item && item.cycleDays ? item.cycleDays : '';
  els.last.value = item && item.history[0] ? item.history[0] : '';
  els.last.max = todayStr();
  els.deleteButton.hidden = !item;
  els.formError.hidden = true;
  syncEmojiPicker();

  els.dialog.showModal();
  if (!item) els.name.focus();
}

function showFormError(message, field) {
  els.formError.textContent = message;
  els.formError.hidden = false;
  field.focus();
}

function handleSubmit(event) {
  event.preventDefault();

  const name = els.name.value.trim();
  const icon = els.icon.value.trim() || '📌';
  const cycleRaw = els.cycle.value.trim();
  const last = els.last.value;
  const today = todayStr();

  if (!name) return showFormError('이름을 입력해 주세요.', els.name);

  // 숫자 칸에 'e' 같은 값이 들어가면 value가 ''로 비어 보이므로 따로 확인합니다.
  if (els.cycle.validity.badInput) {
    return showFormError('주기는 숫자로 입력해 주세요.', els.cycle);
  }

  let cycleDays = null;
  if (cycleRaw) {
    cycleDays = Math.round(Number(cycleRaw));
    if (!Number.isFinite(cycleDays) || cycleDays < 1 || cycleDays > 3650) {
      return showFormError('주기는 1~3650일 사이로 입력해 주세요.', els.cycle);
    }
  }

  if (last && (!isDateStr(last) || last > today)) {
    return showFormError('마지막으로 한 날은 오늘 이전 날짜로 입력해 주세요.', els.last);
  }

  const item = editingId ? findItem(editingId) : null;
  if (item) {
    item.name = name;
    item.icon = icon;
    item.cycleDays = cycleDays;
    // 마지막 수행일을 바꾸면 기존 마지막 기록을 대체합니다.
    if (last !== (item.history[0] || '')) {
      const rest = item.history.slice(1);
      item.history = normalizeHistory(last ? [last, ...rest] : rest);
    }
  } else {
    items.push({
      id: createId(),
      name,
      icon,
      cycleDays,
      history: last ? [last] : [],
      createdAt: today,
    });
  }

  persist();
  render();
  els.dialog.close();
  showToast(item ? `${name} 수정했어요` : `${name} 추가했어요`);
}

/* ===== 토스트 ===== */

function showToast(message, onUndo = null) {
  clearTimeout(toastTimer);
  els.toastMessage.textContent = message;
  undoAction = onUndo;
  els.toastUndo.hidden = !onUndo;
  els.toast.hidden = false;
  toastTimer = setTimeout(hideToast, TOAST_MS);
}

function hideToast() {
  clearTimeout(toastTimer);
  els.toast.hidden = true;
  undoAction = null;
}

/* ===== 이벤트 연결 ===== */

els.list.addEventListener('click', (event) => {
  const card = event.target.closest('.item');
  if (!card) return;
  if (event.target.closest('.done-button')) markDone(card.dataset.id);
  else if (event.target.closest('.item-main')) openDialog(card.dataset.id);
});

els.sort.addEventListener('change', () => {
  sortMode = els.sort.value;
  saveSort(sortMode);
  render();
});

els.addButton.addEventListener('click', () => openDialog());
els.form.addEventListener('submit', handleSubmit);
els.cancelButton.addEventListener('click', () => els.dialog.close());
els.deleteButton.addEventListener('click', handleDeleteClick);
els.icon.addEventListener('input', syncEmojiPicker);

// 바깥(배경)을 누르면 닫기
// target만 보면 다이얼로그 안쪽 여백을 눌러도 닫히므로 좌표로 판단합니다.
els.dialog.addEventListener('click', (event) => {
  if (event.target !== els.dialog) return;
  const rect = els.dialog.getBoundingClientRect();
  const inside =
    event.clientX >= rect.left && event.clientX <= rect.right &&
    event.clientY >= rect.top && event.clientY <= rect.bottom;
  if (!inside) els.dialog.close();
});

els.dialog.addEventListener('close', resetDeleteButton);

els.toastUndo.addEventListener('click', () => {
  if (undoAction) undoAction();
  hideToast();
});

for (const tab of els.viewTabs) {
  tab.addEventListener('click', () => setView(tab.dataset.view));
}

els.calPrev.addEventListener('click', () => moveMonth(-1));
els.calNext.addEventListener('click', () => moveMonth(1));
els.calToday.addEventListener('click', goToday);
els.calFilter.addEventListener('change', () => {
  calFilter = els.calFilter.value;
  renderCalendar();
});
els.calGrid.addEventListener('click', (event) => {
  const cell = event.target.closest('.cal-day[data-date]');
  if (!cell) return;
  calSelected = cell.dataset.date;
  renderCalendar();
});

// 다른 앱에 갔다 돌아오면 날짜가 바뀌었을 수 있으니 다시 그립니다.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') render();
});

/* ===== 시작 ===== */

els.sort.value = sortMode;
els.warning.hidden = isStorageAvailable();
renderEmojiPicker();
render();

cloudInit({
  getItems: () => items,
  setItems: (next) => {
    items = next;
    saveItems(items);
    render();
  },
  onStatus: renderSyncStatus,
});
