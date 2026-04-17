-- =====================================================
-- 0001_init.sql — Schema inicial single-tenant
-- Pizza Demo (PRD §9.3 / §9.4)
-- Idempotente: re-correr no debe romper.
-- =====================================================

create extension if not exists pgcrypto;

-- =====================================================
-- 1. PROFILES (FK -> auth.users)
-- =====================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','cashier','kitchen','driver')),
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- =====================================================
-- 2. CUSTOMERS (sin auth, phone E.164 como clave natural)
-- default_address_id se agrega abajo (FK circular).
-- =====================================================
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text,
  last_order_at timestamptz,
  created_at timestamptz not null default now()
);

-- =====================================================
-- 3. ADDRESSES (estructura Colombia)
-- =====================================================
create table if not exists addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  street text not null,
  complex_name text,
  tower text,
  apartment text,
  neighborhood text,
  "references" text,
  zone text,
  created_at timestamptz not null default now()
);

create index if not exists idx_addresses_customer on addresses(customer_id);

-- FK circular: customers.default_address_id -> addresses
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customers'
      and column_name = 'default_address_id'
  ) then
    alter table customers
      add column default_address_id uuid references addresses(id) on delete set null;
  end if;
end $$;

-- =====================================================
-- 4. PRODUCTS (catálogo base)
-- =====================================================
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  description text,
  image_url text,
  active boolean not null default true,
  max_flavors int not null default 1 check (max_flavors >= 1),
  min_size_for_multiflavor text check (
    min_size_for_multiflavor is null
    or min_size_for_multiflavor in ('personal','pequena','mediana','grande','familiar')
  ),
  created_at timestamptz not null default now()
);

-- =====================================================
-- 5. PRODUCT_SIZES (5 tamaños por producto)
-- =====================================================
create table if not exists product_sizes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  size text not null check (size in ('personal','pequena','mediana','grande','familiar')),
  price_cents int not null check (price_cents >= 0),
  created_at timestamptz not null default now(),
  unique (product_id, size)
);

-- =====================================================
-- 6. ORDER_TOKENS (HMAC, 30 min, one-time)
-- =====================================================
create table if not exists order_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  customer_id uuid not null references customers(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_tokens_expires on order_tokens(expires_at);

-- =====================================================
-- 7. ORDERS
-- =====================================================
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete restrict,
  address_id uuid references addresses(id) on delete set null,
  status text not null check (status in (
    'new','awaiting_payment','payment_approved','payment_rejected',
    'preparing','ready','on_the_way','delivered','cancelled'
  )),
  total_cents int not null check (total_cents >= 0),
  payment_method text not null check (payment_method in ('cash','bancolombia','nequi','llave')),
  payment_proof_url text,
  needs_proof boolean not null default false,
  payment_approved_at timestamptz,
  eta_at timestamptz,
  delayed boolean not null default false,
  delay_notified_at timestamptz,
  driver_id uuid references profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_created_at on orders(created_at desc);
create index if not exists idx_orders_driver on orders(driver_id) where driver_id is not null;
create index if not exists idx_orders_needs_proof on orders(needs_proof) where needs_proof = true;

-- =====================================================
-- 8. ORDER_ITEMS
-- =====================================================
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  size text not null check (size in ('personal','pequena','mediana','grande','familiar')),
  qty int not null check (qty > 0),
  unit_price_cents int not null check (unit_price_cents >= 0),
  flavors text[],
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_items_order on order_items(order_id);

-- =====================================================
-- 9. ORDER_STATUS_EVENTS (auditoría)
-- =====================================================
create table if not exists order_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_status_events_order_created
  on order_status_events(order_id, created_at);

-- =====================================================
-- 10. SETTINGS (1 fila)
-- id constante para garantizar singleton.
-- =====================================================
create table if not exists settings (
  id uuid primary key default '00000000-0000-0000-0000-000000000001'::uuid,
  business_name text not null,
  trial_ends_at date,
  paid_until date,
  delivery_zones jsonb not null default '[]'::jsonb,
  payment_accounts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settings_singleton check (id = '00000000-0000-0000-0000-000000000001'::uuid)
);

-- =====================================================
-- 11. TRIGGER updated_at en settings
-- =====================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_settings_updated_at on settings;
create trigger trg_settings_updated_at
  before update on settings
  for each row execute function set_updated_at();

-- =====================================================
-- 12. HELPER is_staff()
-- Revisa si el auth.uid() actual es un profile activo.
-- =====================================================
create or replace function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and active = true
  );
$$;

-- =====================================================
-- 13. RLS — habilitado en TODAS las tablas
-- =====================================================
alter table profiles            enable row level security;
alter table customers           enable row level security;
alter table addresses           enable row level security;
alter table products            enable row level security;
alter table product_sizes       enable row level security;
alter table order_tokens        enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;
alter table order_status_events enable row level security;
alter table settings            enable row level security;

-- =====================================================
-- 14. POLICIES — patrón service_role full + staff read/write
-- Usamos drop if exists para idempotencia.
-- =====================================================

-- ------- profiles -------
drop policy if exists profiles_service_role_all on profiles;
create policy profiles_service_role_all on profiles
  for all to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists profiles_self_select on profiles;
create policy profiles_self_select on profiles
  for select to authenticated
  using (auth.uid() = id);

drop policy if exists profiles_staff_select on profiles;
create policy profiles_staff_select on profiles
  for select to authenticated
  using (is_staff());

drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ------- customers -------
drop policy if exists customers_service_role_all on customers;
create policy customers_service_role_all on customers
  for all to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists customers_staff_select on customers;
create policy customers_staff_select on customers
  for select to authenticated using (is_staff());

drop policy if exists customers_staff_insert on customers;
create policy customers_staff_insert on customers
  for insert to authenticated with check (is_staff());

drop policy if exists customers_staff_update on customers;
create policy customers_staff_update on customers
  for update to authenticated using (is_staff()) with check (is_staff());

drop policy if exists customers_staff_delete on customers;
create policy customers_staff_delete on customers
  for delete to authenticated using (is_staff());

-- ------- addresses -------
drop policy if exists addresses_service_role_all on addresses;
create policy addresses_service_role_all on addresses
  for all to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists addresses_staff_select on addresses;
create policy addresses_staff_select on addresses
  for select to authenticated using (is_staff());

drop policy if exists addresses_staff_insert on addresses;
create policy addresses_staff_insert on addresses
  for insert to authenticated with check (is_staff());

drop policy if exists addresses_staff_update on addresses;
create policy addresses_staff_update on addresses
  for update to authenticated using (is_staff()) with check (is_staff());

drop policy if exists addresses_staff_delete on addresses;
create policy addresses_staff_delete on addresses
  for delete to authenticated using (is_staff());

-- ------- products (anon SELECT solo activos para catálogo público RSC) -------
drop policy if exists products_service_role_all on products;
create policy products_service_role_all on products
  for all to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists products_staff_select on products;
create policy products_staff_select on products
  for select to authenticated using (is_staff());

drop policy if exists products_anon_select_active on products;
create policy products_anon_select_active on products
  for select to anon using (active = true);

drop policy if exists products_staff_insert on products;
create policy products_staff_insert on products
  for insert to authenticated with check (is_staff());

drop policy if exists products_staff_update on products;
create policy products_staff_update on products
  for update to authenticated using (is_staff()) with check (is_staff());

drop policy if exists products_staff_delete on products;
create policy products_staff_delete on products
  for delete to authenticated using (is_staff());

-- ------- product_sizes (anon SELECT abierto; el filtro por producto activo
-- se aplica en query). Justificación: anon puede leer un precio aunque el producto
-- esté inactivo, pero la query del catálogo siempre joinea con products.active=true.
-- ------- product_sizes -------
drop policy if exists product_sizes_service_role_all on product_sizes;
create policy product_sizes_service_role_all on product_sizes
  for all to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists product_sizes_staff_select on product_sizes;
create policy product_sizes_staff_select on product_sizes
  for select to authenticated using (is_staff());

drop policy if exists product_sizes_anon_select on product_sizes;
create policy product_sizes_anon_select on product_sizes
  for select to anon
  using (exists (select 1 from products p where p.id = product_id and p.active = true));

drop policy if exists product_sizes_staff_insert on product_sizes;
create policy product_sizes_staff_insert on product_sizes
  for insert to authenticated with check (is_staff());

drop policy if exists product_sizes_staff_update on product_sizes;
create policy product_sizes_staff_update on product_sizes
  for update to authenticated using (is_staff()) with check (is_staff());

drop policy if exists product_sizes_staff_delete on product_sizes;
create policy product_sizes_staff_delete on product_sizes
  for delete to authenticated using (is_staff());

-- ------- order_tokens (SOLO service_role) -------
drop policy if exists order_tokens_service_role_all on order_tokens;
create policy order_tokens_service_role_all on order_tokens
  for all to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ------- orders -------
drop policy if exists orders_service_role_all on orders;
create policy orders_service_role_all on orders
  for all to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists orders_staff_select on orders;
create policy orders_staff_select on orders
  for select to authenticated using (is_staff());

drop policy if exists orders_staff_insert on orders;
create policy orders_staff_insert on orders
  for insert to authenticated with check (is_staff());

drop policy if exists orders_staff_update on orders;
create policy orders_staff_update on orders
  for update to authenticated using (is_staff()) with check (is_staff());

drop policy if exists orders_staff_delete on orders;
create policy orders_staff_delete on orders
  for delete to authenticated using (is_staff());

-- ------- order_items -------
drop policy if exists order_items_service_role_all on order_items;
create policy order_items_service_role_all on order_items
  for all to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists order_items_staff_select on order_items;
create policy order_items_staff_select on order_items
  for select to authenticated using (is_staff());

drop policy if exists order_items_staff_insert on order_items;
create policy order_items_staff_insert on order_items
  for insert to authenticated with check (is_staff());

drop policy if exists order_items_staff_update on order_items;
create policy order_items_staff_update on order_items
  for update to authenticated using (is_staff()) with check (is_staff());

drop policy if exists order_items_staff_delete on order_items;
create policy order_items_staff_delete on order_items
  for delete to authenticated using (is_staff());

-- ------- order_status_events -------
drop policy if exists order_status_events_service_role_all on order_status_events;
create policy order_status_events_service_role_all on order_status_events
  for all to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists order_status_events_staff_select on order_status_events;
create policy order_status_events_staff_select on order_status_events
  for select to authenticated using (is_staff());

drop policy if exists order_status_events_staff_insert on order_status_events;
create policy order_status_events_staff_insert on order_status_events
  for insert to authenticated with check (is_staff());

drop policy if exists order_status_events_staff_update on order_status_events;
create policy order_status_events_staff_update on order_status_events
  for update to authenticated using (is_staff()) with check (is_staff());

drop policy if exists order_status_events_staff_delete on order_status_events;
create policy order_status_events_staff_delete on order_status_events
  for delete to authenticated using (is_staff());

-- ------- settings (anon SELECT para business_name y payment_accounts en /pedir) -------
drop policy if exists settings_service_role_all on settings;
create policy settings_service_role_all on settings
  for all to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists settings_staff_select on settings;
create policy settings_staff_select on settings
  for select to authenticated using (is_staff());

drop policy if exists settings_anon_select on settings;
create policy settings_anon_select on settings
  for select to anon using (true);

-- =====================================================
-- 15. STORAGE — bucket payment-proofs (privado)
-- =====================================================
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

-- Storage policies (sobre storage.objects)
drop policy if exists payment_proofs_service_role_all on storage.objects;
create policy payment_proofs_service_role_all on storage.objects
  for all to public
  using (bucket_id = 'payment-proofs' and auth.role() = 'service_role')
  with check (bucket_id = 'payment-proofs' and auth.role() = 'service_role');

drop policy if exists payment_proofs_staff_select on storage.objects;
create policy payment_proofs_staff_select on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-proofs' and is_staff());

-- =====================================================
-- TODO: tras `supabase link --project-ref <ref>` corre: bunx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
-- =====================================================
