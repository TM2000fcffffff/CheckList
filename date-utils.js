// 날짜는 모두 기기 현지 기준 'YYYY-MM-DD' 문자열로 다룹니다.

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayStr() {
  return formatDate(new Date());
}

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isDateStr(value) {
  return typeof value === 'string' && DATE_PATTERN.test(value) && !Number.isNaN(parseDate(value).getTime());
}

// from → to 까지 지난 일수 (서머타임 오차는 반올림으로 흡수)
function daysBetween(from, to) {
  return Math.round((parseDate(to) - parseDate(from)) / DAY_MS);
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// '2026-10-20' → '10월 20일 (화)'
function formatKoreanDate(str) {
  const date = parseDate(str);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAYS[date.getDay()]})`;
}

function formatElapsed(days) {
  if (days === null) return '아직 기록 없음';
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  return `${days}일 전`;
}
