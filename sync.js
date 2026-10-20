// Supabase 동기화
// 익명 로그인 후 public.items 테이블과 localStorage를 맞춥니다.
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
  userId: null,
  ready: false,
  synced: {},
  pushTimer: null,
  pushing: false,
  pushAgain: false,
  getItems: () => [],
  setItems: () => {},
  onStatus: () => {},
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
    user_id: cloud.userId,
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
    localStorage.setItem(SYNCED_KEY, JSON.stringify({ userId: cloud.userId, items: cloud.synced }));
  } catch {
    // 저장 못 해도 다음 동기화 때 전체를 다시 비교합니다.
  }
}

/* ===== 병합 ===== */

// 마지막 동기화 상태(base)를 기준으로 로컬·서버 변경을 합칩니다.
// - 로컬에서 바뀌었거나 새로 만든 항목 → 로컬 값
// - 로컬에서 지운 항목 → 제외 (push 때 서버에서도 삭제)
// - 그 밖에는 서버 값
function mergeItems(localItems, remoteItems, base) {
  // 기기 기록이 통째로 사라졌으면(저장소 초기화 등) 서버를 지우지 않고 서버 기록으로 복원합니다.
  if (!localItems.length) return remoteItems;

  const local = new Map(localItems.map((item) => [item.id, item]));
  const remote = new Map(remoteItems.map((item) => [item.id, item]));
  const result = [];

  for (const item of localItems) {
    const changedLocally = base[item.id] !== itemKey(item);
    if (changedLocally || !remote.has(item.id)) {
      // 서버에서 지워졌고 로컬은 그대로면 삭제를 따릅니다.
      if (!changedLocally && !remote.has(item.id)) continue;
      result.push(item);
    } else {
      result.push(remote.get(item.id));
    }
  }

  for (const item of remoteItems) {
    if (local.has(item.id)) continue;
    if (item.id in base) continue; // 로컬에서 지운 항목
    result.push(item);
  }

  return result;
}

/* ===== 시작 ===== */

async function cloudInit({ getItems, setItems, onStatus }) {
  cloud.getItems = getItems;
  cloud.setItems = setItems;
  cloud.onStatus = onStatus;

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    cloudSetStatus('offline');
    return;
  }

  cloudSetStatus('connecting');
  // 다시 연결할 때는 기존 클라이언트를 재사용합니다. (여러 개 만들면 로그인 상태가 꼬입니다)
  if (!cloud.client) {
    cloud.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }

  try {
    const { data: sessionData } = await cloud.client.auth.getSession();
    let user = sessionData.session ? sessionData.session.user : null;

    if (!user) {
      const { data, error } = await cloud.client.auth.signInAnonymously();
      if (error) throw error;
      user = data.user;
    }

    cloud.userId = user.id;
    cloud.synced = loadSynced(user.id);

    const { data: rows, error } = await cloud.client.from('items').select('*');
    if (error) throw error;

    const merged = mergeItems(getItems(), rows.map(fromRow).filter(Boolean), cloud.synced);

    // 서버에 있는 그대로인 항목은 이미 맞춰진 것으로 기록합니다.
    cloud.synced = {};
    for (const row of rows) {
      const item = fromRow(row);
      if (item) cloud.synced[item.id] = itemKey(item);
    }
    saveSynced();

    cloud.ready = true;
    setItems(merged);
    await cloudPush();
  } catch (error) {
    console.warn('[sync] 연결 실패:', error);
    cloudSetStatus('error');
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

// 인터넷이 다시 연결되면 밀린 변경을 보냅니다.
window.addEventListener('online', () => {
  if (cloud.ready) cloudPush();
  else if (cloud.client) cloudInit({ getItems: cloud.getItems, setItems: cloud.setItems, onStatus: cloud.onStatus });
});
