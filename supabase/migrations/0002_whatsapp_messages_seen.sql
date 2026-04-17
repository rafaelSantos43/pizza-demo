-- =====================================================
-- 0002_whatsapp_messages_seen.sql
-- Idempotencia para webhook de WhatsApp: Meta puede entregar el mismo
-- mensaje varias veces (reintentos al recibir != 2xx, redes flakeas).
-- Idempotente: re-correr no debe romper.
-- =====================================================

create table if not exists whatsapp_messages_seen (
  wa_message_id text primary key,
  processed_at timestamptz not null default now()
);

alter table whatsapp_messages_seen enable row level security;

drop policy if exists wa_messages_seen_service_role_all on whatsapp_messages_seen;
create policy wa_messages_seen_service_role_all on whatsapp_messages_seen
  for all to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create index if not exists idx_wa_messages_seen_processed
  on whatsapp_messages_seen(processed_at);
