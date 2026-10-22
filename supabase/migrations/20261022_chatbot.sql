-- 도움말 챗봇: 사용법 문서 조각(임베딩)과 사용량 제한
-- 임베딩은 Upstage embedding-passage/query (4096차원)입니다.
-- 행이 수십 개뿐이라 인덱스 없이 전체 비교합니다(ivfflat·hnsw는 2000차원까지만 지원).

create extension if not exists vector with schema extensions;

create table public.doc_chunks (
  id bigint generated always as identity primary key,
  source text not null,
  chunk_hash text not null,
  position int not null,
  heading text not null,
  content text not null,
  embedding extensions.vector(4096) not null,
  updated_at timestamptz not null default now(),
  unique (source, chunk_hash)
);

-- Edge Function(secret key)만 읽고 씁니다.
alter table public.doc_chunks enable row level security;
revoke all on public.doc_chunks from anon, authenticated;

-- 질문 임베딩과 가까운 문서 조각을 돌려줍니다.
create or replace function public.match_doc_chunks(query_embedding extensions.vector(4096), match_count int default 5)
returns table (heading text, content text, similarity float)
language sql stable
set search_path = ''
as $$
  select c.heading, c.content, 1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.doc_chunks c
  order by c.embedding operator(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 10);
$$;

-- 문서를 다시 적재할 때: 목록에 없는 조각은 지우고, 임베딩이 있는 조각은 추가하고, 나머지는 순서만 고칩니다.
-- p_chunks: [{ "hash", "position", "heading", "content", "embedding": [..] | null }]
create or replace function public.sync_doc_chunks(p_source text, p_chunks jsonb)
returns int
language plpgsql
set search_path = ''
as $$
declare
  removed int;
begin
  delete from public.doc_chunks
  where source = p_source
    and chunk_hash not in (select x->>'hash' from jsonb_array_elements(p_chunks) x);
  get diagnostics removed = row_count;

  insert into public.doc_chunks (source, chunk_hash, position, heading, content, embedding)
  select p_source, x->>'hash', (x->>'position')::int, x->>'heading', x->>'content',
         (x->'embedding')::text::extensions.vector
  from jsonb_array_elements(p_chunks) x
  where jsonb_typeof(x->'embedding') = 'array'
  on conflict (source, chunk_hash) do update
    set position = excluded.position, heading = excluded.heading, content = excluded.content,
        embedding = excluded.embedding, updated_at = now();

  update public.doc_chunks c
  set position = (x->>'position')::int
  from jsonb_array_elements(p_chunks) x
  where c.source = p_source and c.chunk_hash = x->>'hash' and c.position <> (x->>'position')::int;

  return removed;
end;
$$;

-- 사용량 제한: IP(해시)당 10분 20회, 전체 하루 500회
create table private.chat_requests (
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index chat_requests_created_at on private.chat_requests (created_at);
create index chat_requests_ip on private.chat_requests (ip_hash, created_at);

create or replace function public.chatbot_take_quota(p_ip text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := encode(extensions.digest(coalesce(p_ip, ''), 'sha256'), 'hex');
begin
  delete from private.chat_requests where created_at < now() - interval '1 day';

  if (select count(*) from private.chat_requests
      where ip_hash = v_hash and created_at > now() - interval '10 minutes') >= 20 then
    return false;
  end if;
  if (select count(*) from private.chat_requests) >= 500 then
    return false;
  end if;

  insert into private.chat_requests (ip_hash) values (v_hash);
  return true;
end;
$$;

revoke execute on function public.match_doc_chunks(extensions.vector, int) from public, anon, authenticated;
revoke execute on function public.sync_doc_chunks(text, jsonb) from public, anon, authenticated;
revoke execute on function public.chatbot_take_quota(text) from public, anon, authenticated;
grant execute on function public.match_doc_chunks(extensions.vector, int) to service_role;
grant execute on function public.sync_doc_chunks(text, jsonb) to service_role;
grant execute on function public.chatbot_take_quota(text) to service_role;
grant select, insert, update, delete on public.doc_chunks to service_role;
