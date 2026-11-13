-- =====================================================================
-- PHONE PUSH NOTIFICATIONS  (run once in Supabase > SQL Editor)
-- Safe to re-run. Run AFTER schema.sql and policies.sql.
--
-- BEFORE YOU RUN: edit the two lines marked  <<< EDIT ME  below.
--   v_url    = your Netlify site address + /.netlify/functions/send-push
--   v_secret = any long random text. Use the SAME text in Netlify as the
--              environment variable PUSH_WEBHOOK_SECRET.
-- =====================================================================

-- 1. Phones that should receive notifications (one row per installed app)
create table if not exists public.device_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'android',
  updated_at timestamptz not null default now()
);
create index if not exists ix_device_tokens_user on public.device_tokens(user_id);
alter table public.device_tokens enable row level security;
-- No policies on purpose: browsers cannot read or write this table directly.

-- 2. The app saves / removes its phone token through these two functions
create or replace function public.register_device_token(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_token is null or length(p_token) < 20 or length(p_token) > 4096 then raise exception 'Invalid device token'; end if;
  insert into public.device_tokens(token, user_id) values (p_token, auth.uid())
  on conflict (token) do update set user_id = auth.uid(), updated_at = now();
end $$;

create or replace function public.unregister_device_token(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  delete from public.device_tokens where token = p_token and user_id = auth.uid();
end $$;

revoke all on function public.register_device_token(text), public.unregister_device_token(text) from public, anon;
grant execute on function public.register_device_token(text), public.unregister_device_token(text) to authenticated;

-- 3. Every new notification row asks the Netlify function to push it to phones
create extension if not exists pg_net with schema extensions;

create or replace function public.push_on_notification() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url    constant text := 'https://YOUR-SITE.netlify.app/.netlify/functions/send-push';  -- <<< EDIT ME
  v_secret constant text := 'CHANGE-ME-to-a-long-random-text';                           -- <<< EDIT ME
begin
  begin
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
      body := jsonb_build_object('record', to_jsonb(new))
    );
  exception when others then
    null;  -- a push problem must never block an order or payment
  end;
  return new;
end $$;

drop trigger if exists trg_push_notification on public.notifications;
create trigger trg_push_notification after insert on public.notifications
  for each row execute function public.push_on_notification();
