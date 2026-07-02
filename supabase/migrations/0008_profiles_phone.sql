alter table profiles add column if not exists phone text;

alter table profiles drop constraint if exists profiles_phone_e164;
alter table profiles add constraint profiles_phone_e164
  check (phone is null or phone ~ '^\+[1-9]\d{6,14}$');