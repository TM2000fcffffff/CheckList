// 도움말 챗봇: 사용법 문서(docs/사용법.md)를 근거로 Supabase Edge Function(chatbot)이 답합니다.
// 함수가 Upstage 임베딩 → pgvector 검색 → OpenAI 답변을 처리하고, 여기서는 대화 창만 그립니다.
// sync.js의 SUPABASE_URL을 사용하므로 sync.js 뒤에 불러옵니다.

const CHAT_URL = `${SUPABASE_URL}/functions/v1/chatbot`;
const CHAT_HISTORY_MAX = 6; // 서버로 보내는 앞 대화 수
const CHAT_SAMPLES = [
  '[했어요]를 잘못 눌렀어요',
  '지난 날짜로 기록하려면?',
  '휴대폰을 바꿨는데 기록을 옮기고 싶어요',
  '집안일 룰렛은 어떻게 써요?',
];
const CHAT_GREETING = '안녕하세요! "그거 언제 했더라?" 사용법을 알려 드려요. 궁금한 점을 물어보세요.';

const chat = { history: [], busy: false };

const c$ = (id) => document.getElementById(id);

function chatMessage(role, text, sources = []) {
  const li = document.createElement('li');
  li.className = `chat-msg from-${role}`;
  const bubble = document.createElement('p');
  bubble.className = 'chat-bubble';
  bubble.textContent = text;
  li.append(bubble);
  if (sources.length) {
    const note = document.createElement('p');
    note.className = 'chat-sources';
    note.textContent = `📖 참고: ${sources.join(' · ')}`;
    li.append(note);
  }
  c$('chat-log').append(li);
  li.scrollIntoView({ block: 'end' });
  return li;
}

function renderChatSamples() {
  const box = c$('chat-samples');
  box.hidden = chat.history.length > 0;
  box.replaceChildren(
    ...CHAT_SAMPLES.map((text) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.addEventListener('click', () => askChat(text));
      return button;
    })
  );
}

function setChatBusy(busy) {
  chat.busy = busy;
  c$('chat-send').disabled = busy;
  c$('chat-input').disabled = busy;
}

async function askChat(question) {
  const message = question.trim();
  if (!message || chat.busy) return;

  chatMessage('user', message);
  c$('chat-input').value = '';
  c$('chat-samples').hidden = true;
  setChatBusy(true);
  const pending = chatMessage('bot', '답을 찾는 중…');
  pending.classList.add('is-pending');

  try {
    const res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: chat.history.slice(-CHAT_HISTORY_MAX) }),
    });
    const data = await res.json().catch(() => ({}));
    pending.remove();
    if (!res.ok || !data.answer) {
      chatMessage('bot', data.error || '답변하지 못했어요. 잠시 후 다시 시도해 주세요.');
      return;
    }
    chatMessage('bot', data.answer, data.sources || []);
    chat.history.push({ role: 'user', content: message }, { role: 'assistant', content: data.answer });
  } catch {
    pending.remove();
    chatMessage('bot', navigator.onLine ? '연결에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' : '인터넷에 연결되면 다시 물어봐 주세요.');
  } finally {
    setChatBusy(false);
    c$('chat-input').focus();
  }
}

function openChat() {
  const dialog = c$('chat-dialog');
  // 이미 열려 있을 때 showModal()을 다시 부르면 오류가 납니다.
  if (dialog.open) return;
  if (!c$('chat-log').children.length) chatMessage('bot', CHAT_GREETING);
  renderChatSamples();
  dialog.showModal();
  c$('chat-input').focus();
}

c$('chat-button').addEventListener('click', openChat);
c$('chat-close').addEventListener('click', () => c$('chat-dialog').close());
c$('chat-form').addEventListener('submit', (event) => {
  event.preventDefault();
  askChat(c$('chat-input').value);
});

// 바깥(배경)을 누르면 닫기 (안쪽 여백을 눌러도 닫히지 않게 좌표로 판단)
c$('chat-dialog').addEventListener('click', (event) => {
  const dialog = c$('chat-dialog');
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  const inside =
    event.clientX >= rect.left && event.clientX <= rect.right &&
    event.clientY >= rect.top && event.clientY <= rect.bottom;
  if (!inside) dialog.close();
});
