// Supabase 동기화 (Google 로그인)
// - 로그인 전: 기기(localStorage)에만 저장합니다.
// - Google 로그인 후: public.items 테이블과 맞춰 여러 기기에서 같은 기록을 봅니다.
// 화면은 항상 localStorage 기준으로 바로 그리고, 서버 저장은 뒤에서 처리합니다.
// 서버에 연결할 수 없으면 기기에만 저장하고, 다음 저장이나 온라인 복귀 때 다시 보냅니다.

// 공개용 키입니다. 데이터는 RLS 정책(자기 행만 접근)으로 보호됩니다.
const SUPABASE_URL = 'https://jyrcxrpbrdvxppbdzgvd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_5ZooqVpOwASLntgdG3FHSQ_BhtSLT6D';

// 마지막으로 서버와 맞춘 상태 { userId, items: { [id]: 항목 JSON } }
const SYNCED_KEY = 'when-did-i:synced';
const PUSH_DELAY_MS = 500;

const cloud = {
  client: null,
  user: null,
  ready: false,
  synced: {},
  pushTimer: null,
  pushing: false,
  pushAgain: false,
  pulling: false,
  getItems: () => [],
  setItems: () => {},
  onStatus: () => {},
  onUser: () => {},
};

function cloudSetStatus(state) {
  cloud.onStatus(state);
}

/* ===== 변환 ===== */

function itemKey(item) {
  return JSON.stringify([item.name, item.icon, item.cycleDays, item.history, item.createdAt]);
}

function toRow(item) {
  return {
    user_id: cloud.user.id,
    id: item.id,
    name: item.name,
    icon: item.icon,
    cycle_days: item.cycleDays,
    history: item.history,
    created_at: item.createdAt,
    updated_at: new Date().toISOString(),
  };
}

function fromRow(row) {
  return sanitizeItem({
    id: row.id,
    name: row.name,
    icon: row.icon,
    cycleDays: row.cycle_days,
    history: row.history,
    createdAt: row.created_at,
  });
}

/* ===== 마지막 동기화 상태 ===== */

function loadSynced(userId) {
  try {
    const data = JSON.parse(localStorage.getItem(SYNCED_KEY));
    return data && data.userId === userId && data.items ? data.items : {};
  } catch {
    return {};
  }
}

function saveSynced() {
  try {
    localStorage.setItem(SYNCED_KEY, JSON.stringify({ userId: cloud.user.id, items: cloud.synced }));
  } catch {
    // 저장 못 해도 다음 동기화 때 전체를 다시 비교합니다.
  }
}

function clearSynced() {
  try {
    localStorage.removeItem(SYNCED_KEY);
  } catch {
    // 무시
  }
}

/* ===== 병합 ===== */

// 마지막 동기화 상태(base)를 기준으로 로컬·서버 변경을 합칩니다.
// - 로컬에서 바뀌었거나 새로 만든 항목 → 로컬 값
// - 로컬에서 지운 항목 → 제외 (push 때 서버에서도 삭제)
// - 서버에서 지워졌고 로컬은 그대로인 항목 → 제외
// - 그 밖에는 서버 값
// 처음 로그인한 기기(base가 비어 있음)에서는 로컬과 서버 기록을 합칩니다.
function mergeItems(localItems, remoteItems, base) {
  // 기기 기록이 통째로 사라졌으면(저장소 초기화 등) 서버를 지우지 않고 서버 기록으로 복원합니다.
  if (!localItems.length) return remoteItems;

  const local = new Map(localItems.map((item) => [item.id, item]));
  const remote = new Map(remoteItems.map((item) => [item.id, item]));
  const result = [];

  for (const item of localItems) {
    const changedLocally = base[item.id] !== itemKey(item);
    if (changedLocally) result.push(item);
    else if (remote.has(item.id)) result.push(remote.get(item.id));
  }

  for (const item of remoteItems) {
    if (local.has(item.id) || item.id in base) continue;
    result.push(item);
  }

  return result;
}

/* ===== 서버에서 받기 ===== */

async function cloudPull() {
  if (!cloud.user || cloud.pulling) return;
  cloud.pulling = true;
  cloudSetStatus('syncing');

  try {
    const { data: rows, error } = await cloud.client.from('items').select('*');
    if (error) throw error;

    const remoteItems = rows.map(fromRow).filter(Boolean);
    const merged = mergeItems(cloud.getItems(), remoteItems, cloud.synced);

    // 서버에 있는 그대로인 항목은 이미 맞춰진 것으로 기록합니다.
    cloud.synced = {};
    for (const item of remoteItems) cloud.synced[item.id] = itemKey(item);
    saveSynced();

    cloud.ready = true;
    cloud.setItems(merged);
    await cloudPush();
  } catch (error) {
    console.warn('[sync] 불러오기 실패:', error);
    cloudSetStatus(navigator.onLine ? 'error' : 'offline');
  } finally {
    cloud.pulling = false;
  }
}

/* ===== 서버로 보내기 ===== */

function cloudSchedulePush() {
  if (!cloud.ready) return;
  clearTimeout(cloud.pushTimer);
  cloud.pushTimer = setTimeout(cloudPush, PUSH_DELAY_MS);
}

async function cloudPush() {
  if (!cloud.ready) return;
  if (cloud.pushing) {
    cloud.pushAgain = true;
    return;
  }
  clearTimeout(cloud.pushTimer);

  const items = cloud.getItems();
  const ids = new Set(items.map((item) => item.id));
  const changed = items.filter((item) => cloud.synced[item.id] !== itemKey(item));
  const removed = Object.keys(cloud.synced).filter((id) => !ids.has(id));

  if (!changed.length && !removed.length) {
    cloudSetStatus('synced');
    return;
  }

  cloud.pushing = true;
  cloudSetStatus('syncing');

  try {
    if (changed.length) {
      const { error } = await cloud.client.from('items').upsert(changed.map(toRow), { onConflict: 'user_id,id' });
      if (error) throw error;
      for (const item of changed) cloud.synced[item.id] = itemKey(item);
    }

    if (removed.length) {
      const { error } = await cloud.client.from('items').delete().in('id', removed);
      if (error) throw error;
      for (const id of removed) delete cloud.synced[id];
    }

    saveSynced();
    cloudSetStatus('synced');
  } catch (error) {
    console.warn('[sync] 저장 실패:', error);
    cloudSetStatus(navigator.onLine ? 'error' : 'offline');
  } finally {
    cloud.pushing = false;
    if (cloud.pushAgain) {
      cloud.pushAgain = false;
      cloudSchedulePush();
    }
  }
}

/* ===== 로그인 상태 ===== */

// 로그인 후 주소에 남는 토큰·오류 파라미터(#..., ?error=...)를 지웁니다.
function cleanAuthUrl() {
  // '#'만 남은 경우 location.hash는 빈 문자열이라 href로 확인합니다.
  if (location.href.includes('#') || /[?&](code|error)=/.test(location.search)) {
    history.replaceState(null, '', location.pathname);
  }
}

async function handleSession(session) {
  const user = session ? session.user : null;
  cleanAuthUrl();

  // 예전 버전에서 만든 익명 세션은 정리합니다. (기기 기록은 그대로 둠)
  if (user && user.is_anonymous) {
    await cloud.client.auth.signOut({ scope: 'local' });
    return;
  }

  if (user && cloud.user && user.id === cloud.user.id) return; // 토큰 갱신 등

  if (user) {
    cloud.user = user;
    cloud.ready = false;
    cloud.synced = loadSynced(user.id);
    cloud.onUser(user);
    await cloudPull();
  } else {
    cloud.user = null;
    cloud.ready = false;
    cloud.onUser(null);
    cloudSetStatus('local');
  }
}

async function cloudInit({ getItems, setItems, onStatus, onUser }) {
  cloud.getItems = getItems;
  cloud.setItems = setItems;
  cloud.onStatus = onStatus;
  cloud.onUser = onUser;

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    cloud.onUser(null);
    cloudSetStatus('unavailable');
    return;
  }

  cloudSetStatus('connecting');
  cloud.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  // 콜백 안에서 Supabase를 바로 호출하면 교착될 수 있어 다음 틱으로 미룹니다.
  cloud.client.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => handleSession(session), 0);
  });
}

async function cloudSignIn() {
  if (!cloud.client) return;
  const redirectTo = location.origin + location.pathname;
  const { error } = await cloud.client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) {
    console.warn('[sync] 로그인 실패:', error);
    cloudSetStatus('error');
  }
}

// 로그아웃하면 이 기기에서 기록을 지웁니다. (클라우드에는 남아 있음)
// 같은 기기에서 다른 사람이 로그인했을 때 기록이 섞이지 않게 하기 위함입니다.
async function cloudSignOut() {
  if (!cloud.client) return;
  await cloudPush();
  await cloud.client.auth.signOut({ scope: 'local' });
  clearSynced();
  cloud.setItems([]);
}

// 다른 기기에서 바뀐 내용을 받아 옵니다.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && cloud.ready) cloudPull();
});

// 인터넷이 다시 연결되면 밀린 변경을 주고받습니다.
window.addEventListener('online', () => {
  if (cloud.user) cloudPull();
});
