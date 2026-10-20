// 그룹: 로그인한 사람끼리 집안일 목록을 함께 쓰고, 룰렛으로 누가 할지 뽑습니다.
// - 그룹 생성·가입·룰렛 뽑기·당첨 완료는 서버 함수(RPC)로만 처리합니다. (조작 방지)
// - 같은 그룹 사람이 바꾼 내용은 Supabase Realtime으로 바로 반영합니다.
// sync.js의 cloud.client / cloud.user를 사용합니다.

const GROUP_KEY = 'when-did-i:group';
const JOIN_KEY = 'when-did-i:join';
const SPIN_MS = 2600;
const DEFAULT_CHORE_ICON = '🧹';
const RECENT_SPINS = 8;

const group = {
  list: [],
  currentId: null,
  members: [],
  chores: [],
  logs: [],
  spins: [],
  channel: null,
  reloadTimer: null,
  spinning: false,
  loading: false,
  deleteArmed: null,
  leaveArmed: false,
  iconTarget: null, // 'new'(추가 폼) 또는 집안일 id(카드에서 변경)
};

const g$ = (id) => document.getElementById(id);

// 초대 링크(?join=코드)는 로그인 리디렉션 전에 기억해 둡니다.
(function rememberJoinCode() {
  const code = new URLSearchParams(location.search).get('join');
  if (!code) return;
  try {
    sessionStorage.setItem(JOIN_KEY, code);
  } catch {
    // 무시
  }
  history.replaceState(null, '', location.pathname);
})();

function takeJoinCode() {
  try {
    const code = sessionStorage.getItem(JOIN_KEY);
    sessionStorage.removeItem(JOIN_KEY);
    return code;
  } catch {
    return null;
  }
}

function hasPendingJoin() {
  try {
    return !!sessionStorage.getItem(JOIN_KEY);
  } catch {
    return false;
  }
}

function currentGroup() {
  return group.list.find((g) => g.id === group.currentId) || null;
}

function memberName(userId) {
  const m = group.members.find((member) => member.user_id === userId);
  return m ? m.display_name : '나간 사람';
}

function friendlyError(error) {
  const msg = (error && error.message) || '';
  if (/초대 코드|로그인|당첨|그룹 집안일/.test(msg)) return msg;
  return '문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
}

/* ===== 불러오기 ===== */

async function groupOnUser(user) {
  if (!user) {
    unsubscribeGroup();
    group.list = [];
    group.currentId = null;
    renderGroupView();
    return;
  }

  const code = takeJoinCode();
  if (code) {
    try {
      const { data, error } = await cloud.client.rpc('join_group', { p_code: code });
      if (error) throw error;
      group.currentId = data.id;
      saveCurrentGroup();
      showToast(`🎉 '${data.name}' 그룹에 들어왔어요`);
      setView('group');
    } catch (error) {
      showToast(friendlyError(error));
    }
  }

  await loadGroups();
}

async function loadGroups() {
  if (!cloud.user) return;
  group.loading = true;
  renderGroupView();

  const { data, error } = await cloud.client.from('groups').select('*').order('created_at');
  group.loading = false;
  if (error) {
    console.warn('[group] 그룹 불러오기 실패:', error);
    renderGroupView();
    return;
  }

  group.list = data;
  if (!group.list.some((g) => g.id === group.currentId)) {
    let saved = null;
    try {
      saved = localStorage.getItem(GROUP_KEY);
    } catch {
      // 무시
    }
    group.currentId = group.list.some((g) => g.id === saved) ? saved : group.list[0]?.id || null;
  }

  await loadGroupData();
}

async function loadGroupData() {
  const id = group.currentId;
  if (!id) {
    unsubscribeGroup();
    renderGroupView();
    return;
  }

  const [members, chores, logs, spins] = await Promise.all([
    cloud.client.from('group_members').select('*').eq('group_id', id).order('joined_at'),
    cloud.client.from('group_chores').select('*').eq('group_id', id).order('created_at'),
    cloud.client.from('chore_logs').select('*').eq('group_id', id).order('done_on', { ascending: false }).limit(300),
    cloud.client.from('roulette_spins').select('*').eq('group_id', id).order('created_at', { ascending: false }).limit(RECENT_SPINS),
  ]);

  if (id !== group.currentId) return; // 그 사이 다른 그룹으로 바뀜
  group.members = members.data || [];
  group.chores = chores.data || [];
  group.logs = logs.data || [];
  group.spins = spins.data || [];

  subscribeGroup(id);
  renderGroupView();
}

function scheduleGroupReload() {
  clearTimeout(group.reloadTimer);
  group.reloadTimer = setTimeout(loadGroupData, 300);
}

function saveCurrentGroup() {
  try {
    localStorage.setItem(GROUP_KEY, group.currentId || '');
  } catch {
    // 무시
  }
}

/* ===== 실시간 반영 ===== */

function subscribeGroup(id) {
  if (group.channel && group.channel.topic === `realtime:group-${id}`) return;
  unsubscribeGroup();

  const filter = `group_id=eq.${id}`;
  const channel = cloud.client.channel(`group-${id}`);
  for (const table of ['group_members', 'group_chores', 'chore_logs']) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, scheduleGroupReload);
  }
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'roulette_spins', filter }, (payload) => {
    // 다른 사람이 돌린 룰렛은 내 화면에서도 돌아가는 모습을 보여 줍니다.
    if (payload.eventType === 'INSERT' && payload.new.spun_by !== cloud.user.id && !group.spinning) {
      playRoulette(payload.new);
    } else {
      scheduleGroupReload();
    }
  });
  channel.subscribe();
  group.channel = channel;
}

function unsubscribeGroup() {
  if (group.channel && cloud.client) cloud.client.removeChannel(group.channel);
  group.channel = null;
}

/* ===== 동작 ===== */

async function createGroup(name) {
  const { data, error } = await cloud.client.rpc('create_group', { p_name: name });
  if (error) return showToast(friendlyError(error));
  group.currentId = data.id;
  saveCurrentGroup();
  showToast(`'${data.name}' 그룹을 만들었어요. 초대 링크를 보내 보세요!`);
  await loadGroups();
}

async function joinGroup(code) {
  const { data, error } = await cloud.client.rpc('join_group', { p_code: code });
  if (error) return showToast(friendlyError(error));
  group.currentId = data.id;
  saveCurrentGroup();
  showToast(`🎉 '${data.name}' 그룹에 들어왔어요`);
  await loadGroups();
}

async function addChore(name, icon, cycleDays) {
  const { error } = await cloud.client
    .from('group_chores')
    .insert({ group_id: group.currentId, name, icon: icon || '📌', cycle_days: cycleDays });
  if (error) return showToast(friendlyError(error));
  await loadGroupData();
}

async function updateChoreIcon(id, icon) {
  const { error } = await cloud.client.from('group_chores').update({ icon }).eq('id', id);
  if (error) return showToast(friendlyError(error));
  await loadGroupData();
}

/* ===== 아이콘 고르기 ===== */

function openIconDialog(target, current) {
  group.iconTarget = target;
  const chore = target === 'new' ? null : group.chores.find((c) => c.id === target);
  g$('icon-dialog-title').textContent = chore ? `${chore.name} 아이콘 바꾸기` : '아이콘 고르기';
  g$('icon-dialog-grid').replaceChildren(
    ...EMOJIS.map((emoji) => {
      const button = el('button', '', emoji);
      button.type = 'button';
      button.setAttribute('aria-label', `아이콘 ${emoji}`);
      button.setAttribute('aria-pressed', String(emoji === current));
      button.addEventListener('click', () => pickIcon(emoji));
      return button;
    })
  );
  g$('icon-dialog').showModal();
}

// 추가 폼의 아이콘 (글자로 입력할 수 없고, 고르거나 이미지를 올려서만 바꿉니다)
function setNewChoreIcon(icon) {
  const button = g$('group-chore-icon');
  button.dataset.icon = icon;
  renderIcon(button, icon);
}

function pickIcon(icon) {
  const target = group.iconTarget;
  g$('icon-dialog').close();
  if (target === 'new') {
    setNewChoreIcon(icon);
  } else if (target) {
    const chore = group.chores.find((c) => c.id === target);
    if (chore && chore.icon !== icon) updateChoreIcon(target, icon);
  }
}

async function deleteChore(id) {
  const chore = group.chores.find((c) => c.id === id);
  const { error } = await cloud.client.from('group_chores').delete().eq('id', id);
  if (error) return showToast(friendlyError(error));
  showToast(`${chore ? chore.name : '집안일'} 삭제했어요`);
  await loadGroupData();
}

async function doneChore(id) {
  const chore = group.chores.find((c) => c.id === id);
  const today = todayStr();
  const already = group.logs.some((l) => l.chore_id === id && l.user_id === cloud.user.id && l.done_on === today);
  if (already) return showToast(`${chore.name}: 오늘 이미 기록했어요`);

  const { error } = await cloud.client
    .from('chore_logs')
    .insert({ chore_id: id, group_id: group.currentId, user_id: cloud.user.id, done_on: today });
  if (error) return showToast(friendlyError(error));
  showToast(`✅ ${chore.name} 기록했어요`);
  await loadGroupData();
}

async function completeSpin(spinId) {
  const { error } = await cloud.client.rpc('complete_spin', { p_spin_id: spinId, p_done_on: todayStr() });
  if (error) return showToast(friendlyError(error));
  showToast('✅ 완료! 수고했어요');
  await loadGroupData();
}

async function leaveGroup() {
  const current = currentGroup();
  const { error } = await cloud.client
    .from('group_members')
    .delete()
    .eq('group_id', group.currentId)
    .eq('user_id', cloud.user.id);
  if (error) return showToast(friendlyError(error));
  group.currentId = null;
  saveCurrentGroup();
  showToast(`'${current ? current.name : '그룹'}'에서 나왔어요`);
  await loadGroups();
}

async function shareInvite() {
  const current = currentGroup();
  const url = `${location.origin}${location.pathname}?join=${current.invite_code}`;
  const text = `'${current.name}' 그룹에 초대해요! 집안일 룰렛 같이 돌려요 🎰`;
  if (navigator.share) {
    try {
      await navigator.share({ title: '그거 언제 했더라?', text, url });
      return;
    } catch {
      // 공유 창을 닫으면 아래 복사로 넘어갑니다.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast('초대 링크를 복사했어요');
  } catch {
    showToast(`초대 코드: ${current.invite_code}`);
  }
}

/* ===== 룰렛 ===== */

async function spinRoulette() {
  const choreId = g$('roulette-chore').value;
  if (!choreId || group.spinning) return;
  group.spinning = true;
  g$('roulette-button').disabled = true;

  const { data, error } = await cloud.client.rpc('spin_roulette', { p_chore_id: choreId });
  if (error) {
    group.spinning = false;
    g$('roulette-button').disabled = false;
    return showToast(friendlyError(error));
  }
  await playRoulette(data);
}

// 이름이 빠르게 돌다가 점점 느려지며 당첨자에서 멈춥니다.
async function playRoulette(spin) {
  group.spinning = true;
  setView('group');
  const display = g$('roulette-display');
  const button = g$('roulette-button');
  if (button) button.disabled = true;

  const names = group.members.map((m) => m.display_name);
  if (!names.length) names.push(memberName(spin.picked_user_id));
  const chore = group.chores.find((c) => c.id === spin.chore_id);

  display.classList.remove('is-result');
  display.classList.add('is-spinning');
  g$('roulette-chore-label').replaceChildren(chore ? iconWithText(chore.icon, chore.name) : '');

  const start = performance.now();
  let index = Math.floor(Math.random() * names.length);
  await new Promise((resolve) => {
    const tick = () => {
      const elapsed = performance.now() - start;
      if (elapsed >= SPIN_MS) return resolve();
      index = (index + 1) % names.length;
      g$('roulette-name').textContent = names[index];
      const progress = elapsed / SPIN_MS;
      setTimeout(tick, 50 + progress * progress * 260); // 점점 느려짐
    };
    tick();
  });

  const winner = memberName(spin.picked_user_id);
  g$('roulette-name').textContent = `🏆 ${winner}`;
  display.classList.remove('is-spinning');
  display.classList.add('is-result');
  if (spin.picked_user_id === cloud.user.id) showToast('🎯 당첨! 오늘은 내가 할 차례예요');
  else showToast(`🎯 ${winner} 당첨!`);

  group.spinning = false;
  await loadGroupData();
}

/* ===== 렌더링 ===== */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderGroupView() {
  const root = g$('group-view');
  if (!root) return;

  const loggedIn = !!(cloud && cloud.user);
  g$('group-login').hidden = loggedIn;
  g$('group-login-desc').textContent = hasPendingJoin()
    ? '초대받은 그룹에 들어가려면 Google로 로그인해 주세요.'
    : 'Google로 로그인하면 가족·룸메이트와 그룹을 만들어 집안일 룰렛을 돌릴 수 있어요.';

  const current = currentGroup();
  g$('group-start').hidden = !loggedIn || group.loading || !!current;
  g$('group-main').hidden = !loggedIn || !current;
  if (!loggedIn || !current) return;

  // 그룹 선택 (여러 그룹에 속한 경우)
  const select = g$('group-select');
  select.replaceChildren(
    ...group.list.map((g) => new Option(g.name, g.id)),
    new Option('➕ 새 그룹 만들기 / 참여', '__new')
  );
  select.value = current.id;

  g$('group-code').textContent = current.invite_code;

  // 멤버
  g$('group-members').replaceChildren(
    ...group.members.map((m) => {
      const chip = el('li', 'member-chip');
      if (m.avatar_url) {
        const img = el('img', 'member-avatar');
        img.src = m.avatar_url;
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        chip.append(img);
      } else {
        chip.append(el('span', 'member-avatar', m.display_name.slice(0, 1)));
      }
      chip.append(el('span', '', m.user_id === cloud.user.id ? `${m.display_name} (나)` : m.display_name));
      return chip;
    })
  );

  // 룰렛 집안일 선택
  const rouletteChore = g$('roulette-chore');
  const prev = rouletteChore.value;
  rouletteChore.replaceChildren(...group.chores.map((c) => new Option(`${iconLabel(c.icon)} ${c.name}`, c.id)));
  if (group.chores.some((c) => c.id === prev)) rouletteChore.value = prev;
  g$('roulette-empty').hidden = group.chores.length > 0;
  g$('roulette-controls').hidden = group.chores.length === 0;
  if (!group.spinning) g$('roulette-button').disabled = group.chores.length === 0;

  renderSpins();
  renderGroupChores();
  g$('leave-button').textContent = group.leaveArmed ? '한 번 더 누르면 나가요' : '그룹 나가기';
  g$('leave-button').classList.toggle('armed', group.leaveArmed);
}

function renderSpins() {
  const list = g$('spin-list');
  g$('spin-section').hidden = group.spins.length === 0;
  list.replaceChildren(
    ...group.spins.map((spin) => {
      const chore = group.chores.find((c) => c.id === spin.chore_id);
      const li = el('li', `spin-item${spin.done_at ? ' is-done' : ''}`);
      const time = new Date(spin.created_at);
      const when = `${time.getMonth() + 1}/${time.getDate()} ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
      const text = el('span', 'spin-text');
      const what = el('span', 'spin-what');
      what.append(
        chore ? iconWithText(chore.icon, chore.name) : '삭제된 집안일',
        ` → 🏆 ${memberName(spin.picked_user_id)}`
      );
      text.append(el('span', 'spin-when', when), what);
      li.append(text);

      if (spin.done_at) {
        li.append(el('span', 'spin-state', '✅ 완료'));
      } else if (spin.picked_user_id === cloud.user.id) {
        const button = el('button', 'btn small primary', '완료했어요');
        button.type = 'button';
        button.addEventListener('click', () => completeSpin(spin.id));
        li.append(button);
      } else {
        li.append(el('span', 'spin-state', '⏳ 대기 중'));
      }
      return li;
    })
  );
}

function renderGroupChores() {
  const today = todayStr();
  const list = g$('group-chore-list');
  g$('group-chore-empty').hidden = group.chores.length > 0;

  list.replaceChildren(
    ...group.chores.map((chore) => {
      const last = group.logs.find((l) => l.chore_id === chore.id); // 최신순 정렬됨
      const item = { name: chore.name, icon: chore.icon, cycleDays: chore.cycle_days, history: last ? [last.done_on] : [] };
      const status = getStatus(item, today);

      const li = el('li', `item level-${status.level}`);
      const main = el('div', 'item-main');
      const text = el('span', 'item-text');
      const title = el('span', 'item-title');
      title.append(el('span', 'item-name', chore.name), el('span', 'item-badge', LEVEL_LABEL[status.level]));
      const meta = last ? `${describe(item, status)} · ${memberName(last.user_id)}` : describe(item, status);
      text.append(title, el('span', 'item-meta', meta));
      // 아이콘을 누르면 바꿀 수 있습니다.
      const icon = el('button', 'item-icon icon-edit');
      renderIcon(icon, chore.icon);
      icon.type = 'button';
      icon.setAttribute('aria-label', `${chore.name} 아이콘 바꾸기`);
      icon.addEventListener('click', () => openIconDialog(chore.id, chore.icon));
      main.append(icon, text);

      const del = el('button', `chore-delete${group.deleteArmed === chore.id ? ' armed' : ''}`, group.deleteArmed === chore.id ? '삭제?' : '🗑');
      del.type = 'button';
      del.setAttribute('aria-label', `${chore.name} 삭제`);
      del.addEventListener('click', () => {
        if (group.deleteArmed === chore.id) {
          group.deleteArmed = null;
          deleteChore(chore.id);
        } else {
          group.deleteArmed = chore.id;
          renderGroupChores();
          setTimeout(() => {
            if (group.deleteArmed === chore.id) {
              group.deleteArmed = null;
              renderGroupChores();
            }
          }, 3000);
        }
      });

      const done = el('button', 'done-button', '했어요');
      done.type = 'button';
      done.setAttribute('aria-label', `${chore.name} 했어요`);
      done.addEventListener('click', () => doneChore(chore.id));

      li.append(main, del, done);
      return li;
    })
  );
}

/* ===== 이벤트 ===== */

g$('group-create-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = g$('group-name-input').value.trim();
  if (!name) return g$('group-name-input').focus();
  g$('group-name-input').value = '';
  createGroup(name);
});

g$('group-join-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const code = g$('group-code-input').value.trim();
  if (!code) return g$('group-code-input').focus();
  g$('group-code-input').value = '';
  joinGroup(code);
});

g$('group-select').addEventListener('change', (event) => {
  if (event.target.value === '__new') {
    group.currentId = null;
    renderGroupView();
    g$('group-start').hidden = false;
    g$('group-main').hidden = true;
    return;
  }
  group.currentId = event.target.value;
  saveCurrentGroup();
  loadGroupData();
});

g$('group-start-cancel').addEventListener('click', () => {
  if (!group.list.length) return;
  group.currentId = group.currentId || group.list[0].id;
  loadGroupData();
});

g$('invite-button').addEventListener('click', shareInvite);
g$('roulette-button').addEventListener('click', spinRoulette);

g$('group-chore-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = g$('group-chore-name').value.trim();
  if (!name) return g$('group-chore-name').focus();
  const cycle = Number(g$('group-chore-cycle').value);
  const cycleDays = Number.isFinite(cycle) && cycle >= 1 && cycle <= 3650 ? Math.round(cycle) : null;
  addChore(name, g$('group-chore-icon').dataset.icon || DEFAULT_CHORE_ICON, cycleDays);
  setNewChoreIcon(DEFAULT_CHORE_ICON);
  g$('group-chore-name').value = '';
  g$('group-chore-cycle').value = '';
});

setNewChoreIcon(DEFAULT_CHORE_ICON);
g$('group-chore-icon').addEventListener('click', () => openIconDialog('new', g$('group-chore-icon').dataset.icon));
g$('icon-dialog-upload').addEventListener('click', () => g$('icon-dialog-file').click());
g$('icon-dialog-file').addEventListener('change', () => handleIconFile(g$('icon-dialog-file'), pickIcon));
g$('icon-dialog-close').addEventListener('click', () => g$('icon-dialog').close());
g$('icon-dialog').addEventListener('click', (event) => {
  // 바깥(배경)을 누르면 닫기
  if (event.target !== g$('icon-dialog')) return;
  const r = g$('icon-dialog').getBoundingClientRect();
  const inside = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
  if (!inside) g$('icon-dialog').close();
});

g$('leave-button').addEventListener('click', () => {
  if (group.leaveArmed) {
    group.leaveArmed = false;
    leaveGroup();
    return;
  }
  group.leaveArmed = true;
  renderGroupView();
  setTimeout(() => {
    group.leaveArmed = false;
    renderGroupView();
  }, 3000);
});

// 다른 앱에 갔다 돌아오면 최신 상태로 다시 불러옵니다.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && cloud.user && group.currentId) loadGroupData();
});

// 초대 링크로 들어왔으면 그룹 화면부터 보여 줍니다. (로그인 전이면 로그인 안내)
if (hasPendingJoin()) setView('group');
