alter table order_items drop column if exists flavors;
alter table order_items add column if not exists flavors uuid[];

comment on column order_items.flavors is
  'UUIDs de products cuando el item es mitad-y-mitad (o combinacion). Vacio/NULL = un solo sabor (el product_id principal). Integridad referencial validada en la aplicacion (Postgres no soporta FK a elementos de array).';
