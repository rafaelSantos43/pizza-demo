-- Pickup ("Recoger en el local"): el cliente decide en el checkout entre
-- domicilio (default, comportamiento actual) o pickup (saltea on_the_way,
-- ETA fijo de preparación, sin driver, sin dirección).
--
-- Validación blanda con CHECK; las keys permitidas también viven en TS
-- (DELIVERY_TYPES en src/features/catalog/types.ts).

alter table orders
  add column if not exists delivery_type text not null default 'delivery'
    check (delivery_type in ('delivery', 'pickup'));

alter table settings
  add column if not exists pickup_prep_min int not null default 30;

-- Dirección del local (para mostrar en checkout/review/whatsapp del cliente
-- que va a recoger). Texto libre — el dueño la escribe en Studio.
alter table settings
  add column if not exists business_address text;
