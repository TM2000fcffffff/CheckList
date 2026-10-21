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

// 이름에 이 단어가 들어 있으면 아이콘을 자동으로 골라 줍니다. (앞에 있는 것이 먼저)
const ICON_KEYWORDS = [
  ['화분', '🌱'], ['식물', '🌱'], ['물 주기', '🌱'], ['물주기', '🌱'],
  ['이불', '🛏️'], ['침대', '🛏️'], ['빨래', '🧺'], ['세탁', '🧺'],
  ['화장실', '🚽'], ['변기', '🚽'], ['청소', '🧹'], ['냉장고', '🧊'],
  ['분리수거', '♻️'], ['재활용', '♻️'], ['정수기', '💧'], ['필터', '💧'],
  ['면도', '🪒'], ['머리', '💇'], ['미용', '💇'], ['손톱', '💅'],
  ['칫솔', '🦷'], ['치과', '🏥'], ['병원', '🏥'], ['검진', '🏥'],
  ['영양제', '💊'], ['약 먹', '💊'], ['자동차', '🚗'], ['차량', '🚗'], ['엔진', '🚗'], ['세차', '🚗'],
  ['부모님', '📞'], ['전화', '📞'], ['강아지', '🐶'], ['산책', '🐶'], ['반려', '🐶'],
  ['샴푸', '🧴'], ['로션', '🧴'], ['비누', '🧼'], ['수건', '🧼'],
];

const CYCLE_CHIPS = [[7, '1주'], [14, '2주'], [30, '1달'], [90, '3달'], [180, '6달'], [365, '1년']];
const LAST_CHIPS = [[0, '오늘'], [1, '어제'], [7, '1주 전'], [14, '2주 전'], [30, '1달 전'], [null, '모름']];
const HISTORY_PREVIEW = 5;
const SUGGEST_UNTIL = 3; // 항목이 이보다 적으면 추천 목록을 계속 보여 줍니다.
const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

const LEVEL_LABEL = { ok: '여유', soon: '곧 할 때', over: '지남', none: '' };
const TOAST_MS = 2500; // 알림만 있을 때
const TOAST_UNDO_MS = 5000; // [취소]가 있을 때는 누를 시간을 넉넉히

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
  iconPreview: $('field-icon-preview'),
  iconUpload: $('field-icon-upload'),
  iconFile: $('field-icon-file'),
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
  loginButton: $('login-button'),
  logoutButton: $('logout-button'),
  userInfo: $('user-info'),
  userName: $('user-name'),
  userAvatar: $('user-avatar'),
  viewTabs: document.querySelectorAll('.view-tabs [role="tab"]'),
  listView: $('list-view'),
  calendarView: $('calendar-view'),
  groupView: $('group-view'),
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
  calDueList: $('cal-due-list'),
  header: document.querySelector('.app-header'),
  emptyTitle: $('empty-title'),
  emptyDesc: $('empty-desc'),
  dataTools: $('data-tools'),
  localNotice: $('local-notice'),
  exportButton: $('export-button'),
  importButton: $('import-button'),
  importFile: $('import-file'),
  installButton: $('install-button'),
  dialogClose: $('dialog-close'),
  iconPanel: $('icon-panel'),
  cycleChips: $('cycle-chips'),
  lastField: $('last-field'),
  lastChips: $('last-chips'),
  historyField: $('history-field'),
  historySummary: $('history-summary'),
  historyDate: $('history-date'),
  historyAdd: $('history-add-button'),
  historyList: $('history-list'),
  historyMore: $('history-more'),
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
  renderSuggestions();
  renderDataTools();
  if (currentView === 'calendar') renderCalendar();
}

// 기기에만 저장 중이면 안내하고, 백업 버튼을 보여 줍니다.
function renderDataTools() {
  const loggedIn = typeof cloud !== 'undefined' && !!cloud.user;
  els.localNotice.hidden = loggedIn || !items.length;
  els.exportButton.hidden = !items.length;
  els.dataTools.hidden = false;
}

/* ===== 보기 전환 ===== */

function setView(view) {
  currentView = view;
  for (const tab of els.viewTabs) {
    tab.setAttribute('aria-selected', String(tab.dataset.view === view));
  }
  els.listView.hidden = view !== 'list';
  els.calendarView.hidden = view !== 'calendar';
  els.groupView.hidden = view !== 'group';
  els.sortWrap.hidden = view !== 'list';
  els.addButton.hidden = view === 'group'; // [+]는 개인 항목 추가용
  if (view === 'group') renderGroupView();
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

// 다음 예정일 = 마지막으로 한 날 + 주기 (주기나 기록이 없으면 계산하지 않음)
function getNextDue(item) {
  if (!item.cycleDays || !item.history[0]) return null;
  return addDays(item.history[0], item.cycleDays);
}

// 날짜 → 그날이 다음 예정일인 항목 목록
function buildDueMap() {
  const map = new Map();
  for (const item of items) {
    if (calFilter !== 'all' && item.id !== calFilter) continue;
    const due = getNextDue(item);
    if (!due) continue;
    if (!map.has(due)) map.set(due, []);
    map.get(due).push(item);
  }
  return map;
}

function describeDue(due, today) {
  const diff = daysBetween(today, due);
  if (diff > 0) return `${diff}일 남음`;
  if (diff === 0) return '오늘 할 차례';
  return `${-diff}일 지남`;
}

function renderCalFilter() {
  if (calFilter !== 'all' && !findItem(calFilter)) calFilter = 'all';

  const options = [new Option('전체 항목', 'all')];
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  for (const item of sorted) options.push(new Option(`${iconLabel(item.icon)} ${item.name}`, item.id));

  els.calFilter.replaceChildren(...options);
  els.calFilter.value = calFilter;
}

function renderCalendar() {
  const today = todayStr();
  const records = buildRecordMap();
  const dues = buildDueMap();
  const monthPrefix = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-`;

  renderCalFilter();
  els.calTitle.textContent = `${calYear}년 ${calMonth + 1}월`;

  const countInMonth = (map) => {
    let count = 0;
    for (const [date, list] of map) {
      if (date.startsWith(monthPrefix)) count += list.length;
    }
    return count;
  };
  const monthCount = countInMonth(records);
  const dueCount = countInMonth(dues);
  els.calSummary.textContent =
    (monthCount ? `이번 달 기록 ${monthCount}회` : '이번 달 기록 없음') + (dueCount ? ` · 예정 ${dueCount}개` : '');

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
    const dayDues = dues.get(date) || [];
    const overdue = dayDues.length > 0 && date < today;

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-day';
    cell.dataset.date = date;
    if (date === today) cell.classList.add('is-today');
    if (date === calSelected) cell.classList.add('is-selected');
    if (date > today) cell.classList.add('is-future');
    if (dayRecords.length) cell.classList.add('has-record');
    if (dayDues.length) cell.classList.add(overdue ? 'has-overdue' : 'has-due');

    const num = document.createElement('span');
    num.className = 'cal-num';
    num.textContent = day;

    // 한 날은 아이콘 그대로, 예정일은 점선 테두리, 지난 예정은 빨간 테두리로 표시
    const dueKind = overdue ? 'overdue' : 'due';
    const marks = [
      ...dayRecords.map((item) => ({ item, kind: 'done' })),
      ...dayDues.map((item) => ({ item, kind: dueKind })),
    ];
    const icons = document.createElement('span');
    icons.className = 'cal-icons';
    const overflow = marks.length > CAL_MAX_ICONS;
    const shown = overflow ? marks.slice(0, CAL_MAX_ICONS - 1) : marks;
    for (const mark of shown) {
      const span = document.createElement('span');
      span.className = `cal-mark ${mark.kind}`;
      renderIcon(span, mark.item.icon);
      icons.append(span);
    }
    if (overflow) {
      const more = document.createElement('span');
      more.className = 'cal-more';
      more.textContent = `+${marks.length - shown.length}`;
      icons.append(more);
    }

    const labelParts = [formatKoreanDate(date)];
    if (dayRecords.length) labelParts.push(`한 일: ${dayRecords.map((item) => item.name).join(', ')}`);
    if (dayDues.length) {
      labelParts.push(`${overdue ? '지난 예정' : '예정'}: ${dayDues.map((item) => item.name).join(', ')}`);
    }
    cell.setAttribute('aria-label', labelParts.join(', '));
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

  // 이날이 다음 예정일인 항목
  const dueItems = items
    .filter((item) => (calFilter === 'all' || item.id === calFilter) && getNextDue(item) === calSelected)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const overdue = calSelected < today;
  els.calDueList.hidden = !dueItems.length;
  els.calDueList.replaceChildren(
    ...dueItems.map((item) => {
      const li = document.createElement('li');
      li.className = overdue ? 'overdue' : 'due';
      li.append(
        `${overdue ? '⚠️ 예정 지남' : '📅 예정'} · `,
        iconWithText(item.icon, item.name),
        ` · ${describeDue(calSelected, today)}`
      );
      return li;
    })
  );

  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  els.calDetailList.replaceChildren(
    ...sorted.map((item) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.append(iconWithText(item.icon, item.name));
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

  renderIcon(node.querySelector('.item-icon'), item.icon);
  node.querySelector('.item-name').textContent = item.name;
  node.querySelector('.item-meta').textContent = describe(item, status);
  node.querySelector('.item-badge').textContent = LEVEL_LABEL[status.level];
  node.querySelector('.item-main').setAttribute('aria-label', `${item.name} 열기`);
  node.querySelector('.done-button').setAttribute('aria-label', `${item.name} 했어요`);
  node.querySelector('.item-progress').replaceWith(createProgress(status));
  return node;
}

// 카드 아래 막대: 주기 대비 얼마나 지났는지 (색약이어도 길이로 읽을 수 있게)
function createProgress(status) {
  const bar = document.createElement('span');
  bar.className = 'item-progress';
  bar.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('span');
  bar.append(fill);
  if (status.ratio === null) bar.hidden = true;
  else fill.style.width = `${Math.min(status.ratio, 1) * 100}%`;
  return bar;
}

// 항목이 적을 때는 아직 추가하지 않은 추천 항목을 계속 보여 줍니다.
function renderSuggestions() {
  const names = new Set(items.map((item) => item.name));
  const rest = SUGGESTIONS.filter((s) => !names.has(s.name));
  els.empty.hidden = items.length >= SUGGEST_UNTIL || !rest.length;
  if (els.empty.hidden) return;

  els.empty.classList.toggle('is-more', items.length > 0);
  els.emptyTitle.textContent = items.length ? '이런 것도 추가해 보세요' : '아직 항목이 없어요';
  els.emptyDesc.textContent = items.length
    ? '자주 잊는 일을 더 골라 보세요.'
    : '자주 잊는 일을 골라 바로 추가해 보세요.';
  els.suggestions.replaceChildren(
    ...rest.map((s) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${s.icon} ${s.name}`;
      button.addEventListener('click', () => openDialog(null, s));
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
      button.addEventListener('click', () => pickDialogIcon(emoji));
      return button;
    })
  );
}

// 항목 창에서 고른 아이콘 (이모지 또는 이미지 data URL). 글자로 직접 입력할 수는 없습니다.
let dialogIcon = DEFAULT_ICON;
let iconTouched = false; // 직접 고른 뒤에는 이름으로 자동 추천하지 않습니다.
let dialogHistory = []; // 수정 창에서 고치는 중인 기록 (저장할 때 반영)
let historyExpanded = false;

function setDialogIcon(icon) {
  dialogIcon = isValidIcon(icon) ? icon : DEFAULT_ICON;
  renderIcon(els.iconPreview, dialogIcon);
  syncEmojiPicker();
}

function pickDialogIcon(icon) {
  iconTouched = true;
  setDialogIcon(icon);
  toggleIconPanel(false);
}

function toggleIconPanel(open = els.iconPanel.hidden) {
  els.iconPanel.hidden = !open;
  els.iconPreview.setAttribute('aria-expanded', String(open));
}

function suggestIcon(name) {
  const found = ICON_KEYWORDS.find(([word]) => name.includes(word));
  return found ? found[1] : DEFAULT_ICON;
}

/* ===== 빠른 선택 칩 ===== */

function makeChip(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function renderQuickChips() {
  els.cycleChips.replaceChildren(
    ...CYCLE_CHIPS.map(([days, label]) =>
      makeChip(label, () => {
        els.cycle.value = days;
        syncQuickChips();
      })
    )
  );
  els.lastChips.replaceChildren(
    ...LAST_CHIPS.map(([daysAgo, label]) =>
      makeChip(label, () => {
        els.last.value = daysAgo === null ? '' : addDays(todayStr(), -daysAgo);
        syncQuickChips();
      })
    )
  );
}

function syncQuickChips() {
  [...els.cycleChips.children].forEach((chip, i) => {
    chip.setAttribute('aria-pressed', String(Number(els.cycle.value) === CYCLE_CHIPS[i][0]));
  });
  const today = todayStr();
  [...els.lastChips.children].forEach((chip, i) => {
    const daysAgo = LAST_CHIPS[i][0];
    const value = daysAgo === null ? '' : addDays(today, -daysAgo);
    chip.setAttribute('aria-pressed', String(els.last.value === value));
  });
}

/* ===== 기록 목록 (수정 창) ===== */

function averageCycle(history) {
  if (history.length < 2) return null;
  return Math.round(daysBetween(history[history.length - 1], history[0]) / (history.length - 1));
}

function renderHistory() {
  const today = todayStr();
  const count = dialogHistory.length;
  const avg = averageCycle(dialogHistory);
  els.historySummary.textContent = count
    ? `${count}번 기록 · 마지막 ${formatElapsed(daysBetween(dialogHistory[0], today))}` +
      (avg ? ` · 평균 ${avg}일마다 했어요` : '')
    : '아직 기록이 없어요. 한 날을 추가해 보세요.';

  const shown = historyExpanded ? dialogHistory : dialogHistory.slice(0, HISTORY_PREVIEW);
  els.historyList.replaceChildren(
    ...shown.map((date) => {
      const li = document.createElement('li');
      const text = document.createElement('span');
      text.textContent = `${formatKoreanDate(date)} · ${formatElapsed(daysBetween(date, today))}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'history-remove';
      remove.textContent = '✕';
      remove.setAttribute('aria-label', `${formatKoreanDate(date)} 기록 지우기`);
      remove.addEventListener('click', () => {
        dialogHistory = dialogHistory.filter((d) => d !== date);
        renderHistory();
      });
      li.append(text, remove);
      return li;
    })
  );

  const hiddenCount = count - shown.length;
  els.historyMore.hidden = hiddenCount <= 0;
  els.historyMore.textContent = `${hiddenCount}개 더 보기`;
}

function addHistoryDate() {
  const date = els.historyDate.value;
  if (!isDateStr(date) || date > todayStr()) {
    return showFormError('오늘이나 지난 날짜를 골라 주세요.', els.historyDate);
  }
  if (dialogHistory.includes(date)) {
    return showFormError('이미 기록한 날짜예요.', els.historyDate);
  }
  els.formError.hidden = true;
  dialogHistory = normalizeHistory([date, ...dialogHistory]);
  els.historyDate.value = '';
  renderHistory();
}

function syncEmojiPicker() {
  for (const button of els.emojiPicker.children) {
    button.setAttribute('aria-pressed', String(button.textContent === dialogIcon));
  }
}

async function handleIconFile(input, onDone) {
  const file = input.files[0];
  input.value = ''; // 같은 파일을 다시 골라도 동작하도록
  if (!file) return;
  try {
    onDone(await makeIconImage(file));
  } catch (error) {
    showToast(error.message || '이미지를 올리지 못했어요');
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
  syncing: '☁️ 동기화 중…',
  synced: '☁️ 동기화됨',
  local: '📱 이 기기에만 저장 중',
  offline: '📴 오프라인 · 기기에 저장됨',
  error: '⚠️ 동기화 실패 · 기기에 저장됨',
  unavailable: '📱 이 기기에만 저장 중',
};

function renderSyncStatus(state) {
  els.syncStatus.dataset.state = state;
  els.syncStatus.textContent = SYNC_LABEL[state] || '';
  els.syncStatus.title = SYNC_LABEL[state] || ''; // 모바일에서는 아이콘만 보이므로 길게 누르면 설명이 보이게
}

/* ===== 계정 ===== */

function renderUser(user) {
  els.loginButton.hidden = !!user;
  els.loginButton.disabled = false;
  els.userInfo.hidden = !user;
  if (!user) return;

  const meta = user.user_metadata || {};
  els.userName.textContent = meta.full_name || meta.name || user.email || 'Google 계정';
  els.userInfo.title = els.userName.textContent; // 모바일에서는 이름을 숨기고 사진만 보여 줌
  const avatar = isSafeAvatar(meta.avatar_url) ? meta.avatar_url : '';
  els.userAvatar.hidden = !avatar;
  if (avatar) els.userAvatar.src = avatar;
}

async function handleLogin() {
  els.loginButton.disabled = true;
  await cloudSignIn();
  els.loginButton.disabled = false;
}

async function handleLogout() {
  els.logoutButton.disabled = true;
  await cloudSignOut();
  forgetGroup();
  els.logoutButton.disabled = false;
  showToast('로그아웃했어요. 기록은 클라우드에 남아 있어요');
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

/* ===== 백업 ===== */

function exportBackup() {
  const data = { app: 'when-did-i', version: 1, exportedAt: new Date().toISOString(), items };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `그거언제했더라_백업_${todayStr()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`항목 ${items.length}개를 파일로 내보냈어요`);
}

// 같은 항목(id)은 기록 날짜를 합치고, 없는 항목은 새로 추가합니다.
async function importBackup(file) {
  if (!file) return;
  if (file.size > IMPORT_MAX_BYTES) return showToast('5MB 이하 백업 파일만 가져올 수 있어요');

  let incoming;
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data && data.items;
    if (!Array.isArray(list)) throw new Error();
    incoming = list.map(sanitizeItem).filter(Boolean);
  } catch {
    return showToast('백업 파일을 읽을 수 없어요');
  }
  if (!incoming.length) return showToast('가져올 항목이 없어요');

  const previous = items.map((item) => ({ ...item, history: [...item.history] }));
  let added = 0;
  let merged = 0;
  for (const item of incoming) {
    const existing = findItem(item.id);
    if (existing) {
      existing.history = normalizeHistory([...existing.history, ...item.history]);
      merged++;
    } else {
      items.push(item);
      added++;
    }
  }
  persist();
  render();
  showToast(`새 항목 ${added}개, 합친 항목 ${merged}개를 가져왔어요`, () => {
    items = previous;
    persist();
    render();
  });
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

// id가 있으면 수정, preset(추천 항목)이 있으면 그 값으로 채운 추가 창을 엽니다.
function openDialog(id = null, preset = null) {
  // 이미 열려 있을 때 showModal()을 다시 부르면 오류가 납니다.
  if (els.dialog.open) return;
  const item = id ? findItem(id) : null;
  const source = item || preset;
  editingId = item ? item.id : null;

  els.dialogTitle.textContent = item ? item.name : '항목 추가';
  iconTouched = !!source;
  setDialogIcon(source ? source.icon : DEFAULT_ICON);
  toggleIconPanel(false);
  els.name.value = source ? source.name : '';
  els.cycle.value = source && source.cycleDays ? source.cycleDays : '';
  els.last.value = '';
  els.last.max = todayStr();
  els.historyDate.max = todayStr();
  els.historyDate.value = '';

  // 수정할 때는 '마지막으로 한 날' 대신 지난 기록 전체를 보여 줍니다. (기록을 덮어쓰지 않도록)
  els.lastField.hidden = !!item;
  els.historyField.hidden = !item;
  dialogHistory = item ? [...item.history] : [];
  historyExpanded = false;
  if (item) renderHistory();

  els.deleteButton.hidden = !item;
  els.formError.hidden = true;
  syncEmojiPicker();
  syncQuickChips();

  els.dialog.showModal();
  if (!source) els.name.focus();
}

function showFormError(message, field) {
  els.formError.textContent = message;
  els.formError.hidden = false;
  field.focus();
}

function handleSubmit(event) {
  event.preventDefault();

  const name = els.name.value.trim();
  const icon = dialogIcon;
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
    item.history = normalizeHistory(dialogHistory);
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
  toastTimer = setTimeout(hideToast, onUndo ? TOAST_UNDO_MS : TOAST_MS);
}

function hideToast() {
  clearTimeout(toastTimer);
  els.toast.hidden = true;
  undoAction = null;
}

/* ===== 이벤트 연결 ===== */

// 토스트를 누르면 바로 닫습니다. ([취소] 버튼은 따로 처리)
els.toast.addEventListener('click', (event) => {
  if (!event.target.closest('#toast-undo')) hideToast();
});

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
els.iconUpload.addEventListener('click', () => els.iconFile.click());
els.iconFile.addEventListener('change', () => handleIconFile(els.iconFile, pickDialogIcon));
els.iconPreview.addEventListener('click', () => toggleIconPanel());
els.dialogClose.addEventListener('click', () => els.dialog.close());
els.name.addEventListener('input', () => {
  if (!iconTouched && !editingId) setDialogIcon(suggestIcon(els.name.value));
});
els.cycle.addEventListener('input', syncQuickChips);
els.last.addEventListener('input', syncQuickChips);
els.historyAdd.addEventListener('click', addHistoryDate);
els.historyMore.addEventListener('click', () => {
  historyExpanded = true;
  renderHistory();
});

els.exportButton.addEventListener('click', exportBackup);
els.importButton.addEventListener('click', () => els.importFile.click());
els.importFile.addEventListener('change', () => {
  const file = els.importFile.files[0];
  els.importFile.value = ''; // 같은 파일을 다시 골라도 동작하도록
  importBackup(file);
});

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

// 아래로 스크롤하면 [+] 버튼을 숨겨 카드·범례를 가리지 않게 하고, 헤더 아래에 경계선을 그립니다.
let lastScrollY = window.scrollY;
window.addEventListener(
  'scroll',
  () => {
    const y = window.scrollY;
    els.header.classList.toggle('is-scrolled', y > 4);
    if (y > lastScrollY + 4 && y > 80) els.addButton.classList.add('is-away');
    else if (y < lastScrollY - 4) els.addButton.classList.remove('is-away');
    lastScrollY = y;
  },
  { passive: true }
);

/* ===== 홈 화면 추가 (PWA) ===== */

let installPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  els.installButton.hidden = false;
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  els.installButton.hidden = true;
  showToast('홈 화면에 추가했어요');
});

els.installButton.addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  els.installButton.hidden = true;
});

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((error) => console.warn('[pwa] 서비스 워커 등록 실패:', error));
  });
}

/* ===== 시작 ===== */

els.sort.value = sortMode;
els.warning.hidden = isStorageAvailable();
renderEmojiPicker();
renderQuickChips();
render();

// group.js까지 모두 실행된 뒤에 시작합니다. (로그인 콜백이 groupOnUser를 부르므로)
document.addEventListener('DOMContentLoaded', () => cloudInit({
  getItems: () => items,
  setItems: (next) => {
    items = next;
    saveItems(items);
    render();
  },
  onStatus: renderSyncStatus,
  onUser: (user) => {
    renderUser(user);
    renderDataTools();
    groupOnUser(user);
  },
}));

els.loginButton.addEventListener('click', handleLogin);
els.logoutButton.addEventListener('click', handleLogout);
