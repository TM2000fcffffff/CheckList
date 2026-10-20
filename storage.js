// localStorage 읽기·쓰기

const STORAGE_KEY = 'when-did-i:items';
const SORT_KEY = 'when-did-i:sort';
const SORT_MODES = ['urgent', 'oldest', 'name'];

function isStorageAvailable() {
  try {
    const key = '__when-did-i-test__';
    localStorage.setItem(key, key);
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

// Windows 10 등 구형 기기에서 네모(□)로 깨지는 이모지를 비슷한 이모지로 바꿉니다.
const ICON_FALLBACK = { '🪥': '🦷', '🪴': '🌱' };

// 저장된 데이터가 깨져 있어도 앱이 멈추지 않도록 형태를 정리합니다.
function sanitizeItem(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string' || !raw.name.trim()) return null;
  const cycle = Number(raw.cycleDays);
  const history = Array.isArray(raw.history) ? raw.history.filter(isDateStr) : [];
  return {
    id: String(raw.id || createId()),
    name: raw.name.trim(),
    icon: isValidIcon(raw.icon) ? ICON_FALLBACK[raw.icon] || raw.icon : DEFAULT_ICON,
    cycleDays: Number.isFinite(cycle) && cycle > 0 ? Math.round(cycle) : null,
    history: normalizeHistory(history),
    createdAt: isDateStr(raw.createdAt) ? raw.createdAt : todayStr(),
  };
}

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.map(sanitizeItem).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveItems(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

function loadSort() {
  try {
    const value = localStorage.getItem(SORT_KEY);
    return SORT_MODES.includes(value) ? value : 'urgent';
  } catch {
    return 'urgent';
  }
}

function saveSort(value) {
  try {
    localStorage.setItem(SORT_KEY, value);
  } catch {
    // 정렬 설정은 저장 못 해도 괜찮습니다.
  }
}

function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// 중복 제거 후 최신 날짜가 앞에 오도록 정렬
function normalizeHistory(dates) {
  return [...new Set(dates)].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}
