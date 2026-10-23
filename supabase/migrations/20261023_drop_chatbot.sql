-- 도움말 챗봇 제거 (20261022_chatbot.sql 되돌리기)
drop function if exists public.match_doc_chunks(extensions.vector, int);
drop function if exists public.sync_doc_chunks(text, jsonb);
drop function if exists public.chatbot_take_quota(text);
drop table if exists public.doc_chunks;
drop table if exists private.chat_requests;
-- vector는 챗봇에서만 썼습니다.
drop extension if exists vector;
