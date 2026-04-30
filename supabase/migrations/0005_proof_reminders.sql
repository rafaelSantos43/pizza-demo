-- =====================================================
-- 0005_proof_reminders.sql
-- PRD §F9: comprobante híbrido. Agrega:
--   - payment_proof_source: métrica de qué camino usó el cliente
--     ('web' = subió en checkout, 'whatsapp' = mandó por chat).
--   - proof_reminder_sent_at: flag para que el cron de recordatorio
--     (ver 0006_proof_reminders_cron.sql.skip) no notifique 2 veces.
-- Idempotente: re-correr no rompe.
-- =====================================================

alter table orders
  add column if not exists payment_proof_source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_payment_proof_source_check'
  ) then
    alter table orders
      add constraint orders_payment_proof_source_check
      check (payment_proof_source in ('web', 'whatsapp'));
  end if;
end $$;

alter table orders
  add column if not exists proof_reminder_sent_at timestamptz;
