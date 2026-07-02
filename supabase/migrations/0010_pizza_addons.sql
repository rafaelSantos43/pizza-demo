-- Adiciones: variantes de pizza con precio por tamaño.
-- Vive en settings.pizza_addons (JSONB) como [{key, label, prices: {size: cents}}, ...].
-- order_items.addon_key persiste el slug elegido por el cliente.
-- Validación blanda: keys permitidas hardcoded en TS (ADDON_KEYS), NO en CHECK
-- constraint — si en el futuro se agrega una 4ta variante solo cambia el código
-- sin migrar DB. El server valida contra settings.pizza_addons antes del INSERT.

alter table order_items
  add column if not exists addon_key text null;

alter table settings
  add column if not exists pizza_addons jsonb not null default '[]'::jsonb;
