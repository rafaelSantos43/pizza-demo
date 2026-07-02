-- =====================================================
-- seed.sql — 33 pizzas (carta placeholder para demo)
-- =====================================================

-- settings (singleton)
-- Datos de demo. Las cuentas de pago tienen formato real colombiano pero son
-- ficticias (placeholders). El nombre comercial se cambia fácil con
-- scripts/rebrand.ts o con un UPDATE en Studio.
-- pizza_addons: 3 variantes de pizza (Borde queso, Borde queso+bocadillo,
-- Estofada). Precios en centavos COP (placeholders proporcionales).
insert into settings (
  id, business_name, trial_ends_at, paid_until,
  delivery_zones, payment_accounts, pizza_addons,
  pickup_prep_min, business_address
) values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Pizza Demo',
  current_date + 14,
  null,
  '[{"zone":"A","eta_min":30},{"zone":"B","eta_min":45}]'::jsonb,
  '{"nequi":"+57 300 555 0182","bancolombia":"Ahorros 1234-567890-12","llave":"pizzademo@nequi"}'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'key', 'borde_queso',
      'label', 'Borde relleno de queso',
      'prices', jsonb_build_object(
        'personal', 4000, 'pequena', 5000, 'mediana', 6000,
        'grande', 7000, 'familiar', 8000
      )
    ),
    jsonb_build_object(
      'key', 'borde_queso_bocadillo',
      'label', 'Borde relleno de queso y bocadillo',
      'prices', jsonb_build_object(
        'personal', 5000, 'pequena', 6000, 'mediana', 7000,
        'grande', 8000, 'familiar', 9000
      )
    ),
    jsonb_build_object(
      'key', 'estofada',
      'label', 'Pizza estofada',
      'prices', jsonb_build_object(
        'personal', 3000, 'pequena', 4000, 'mediana', 5000,
        'grande', 6000, 'familiar', 7000
      )
    )
  ),
  30,
  'Calle 63B #105-95, Robledo, Medellín'
) on conflict (id) do update set
  business_name    = excluded.business_name,
  trial_ends_at    = excluded.trial_ends_at,
  paid_until       = excluded.paid_until,
  delivery_zones   = excluded.delivery_zones,
  payment_accounts = excluded.payment_accounts,
  pizza_addons     = excluded.pizza_addons,
  pickup_prep_min  = excluded.pickup_prep_min,
  business_address = excluded.business_address;

-- Pizzas: 33 productos + sus 5 tamaños cada uno.
-- Se insertan con upsert por (name, category) usando una CTE que calcula
-- el price_cents por tier (las columnas de valores p/q/m/g/f).
with tiered (name, description, personal, pequena, mediana, grande, familiar) as (
  values
    -- Tier 1 — 22/33/42/51/63
    ('Hawaiana',        'Piña, jamón y queso.',                                                                     22000, 33000, 42000, 51000, 63000),
    ('Jamón y Queso',   'Jamón y queso.',                                                                            22000, 33000, 42000, 51000, 63000),
    ('Vegetariana',     'Champiñones, cebolla, pimentón, tomate, especias y queso.',                                 22000, 33000, 42000, 51000, 63000),
    ('Napolitana',      'Salsa napolitana, tomate, especias y queso.',                                               22000, 33000, 42000, 51000, 63000),
    ('California Style','Champiñones, tomate en cuadros, aceitunas, pimentón, albahaca y queso.',                    22000, 33000, 42000, 51000, 63000),
    ('Aborrajada',      'Plátano maduro, bocadillo y queso.',                                                        22000, 33000, 42000, 51000, 63000),
    ('Salami',          'Salami, jamón y queso.',                                                                    22000, 33000, 42000, 51000, 63000),
    ('Bocadillo',       'Queso y bocadillo.',                                                                        22000, 33000, 42000, 51000, 63000),
    ('Florentina',      'Champiñón, tomate, cebolla, jamón y queso.',                                                22000, 33000, 42000, 51000, 63000),

    -- Tier 2 — 23/34/44/53/65
    ('Peperoni',        'Peperoni y queso.',                                                                         23000, 34000, 44000, 53000, 65000),
    ('Ranchera',        'Jamón, salchicha, tocineta y queso.',                                                       23000, 34000, 44000, 53000, 65000),
    ('Paizeta',         'Jamón, maíz, tocineta, guacamole y queso.',                                                 23000, 34000, 44000, 53000, 65000),
    ('Vaticana',        'Tocineta, maíz, tomate y queso.',                                                           23000, 34000, 44000, 53000, 65000),
    ('Genovesa',        'Tocineta, aceitunas, champiñón, tomate y queso.',                                           23000, 34000, 44000, 53000, 65000),
    ('Pepernata',       'Peperoni, aceitunas, tomate, cebolla, albahaca, pimentón y queso.',                         23000, 34000, 44000, 53000, 65000),
    ('Bacon Peperoni',  'Peperoni, tocineta, cebolla y queso.',                                                      23000, 34000, 44000, 53000, 65000),
    ('Mexicana',        'Carne, cebolla, jalapeños, tomate, guacamole, pimentón y queso.',                           23000, 34000, 44000, 53000, 65000),
    ('Jalisco',         'Chorizo, maíz, guacamole, tomate, cebolla, albahaca, jalapeño, pimentón y queso.',          23000, 34000, 44000, 53000, 65000),
    ('Pollo Champiñón', 'Pollo, champiñones y queso.',                                                               23000, 34000, 44000, 53000, 65000),

    -- Tier 3 — 23/35/45/56/68
    ('Pollo Maíz',       'Pollo, maíz y queso.',                                                                     23000, 35000, 45000, 56000, 68000),
    ('Pollo Jamón',      'Pollo, jamón y queso.',                                                                    23000, 35000, 45000, 56000, 68000),
    ('Pollo Tocineta',   'Pollo, tocineta y queso.',                                                                 23000, 35000, 45000, 56000, 68000),
    ('Pollo BBQ',        'Pollo, salsa BBQ, cebolla y queso.',                                                       23000, 35000, 45000, 56000, 68000),
    ('Pollo Miel Mostaza','Pollo, salsa miel mostaza, tocineta y queso.',                                            23000, 35000, 45000, 56000, 68000),
    ('4 Quesos',         'Queso mozzarella, queso crema, queso americano y queso parmesano.',                        23000, 35000, 45000, 56000, 68000),
    ('Costilla',         'Costilla en salsa BBQ, plátano maduro, cebolla puerro y queso.',                           23000, 35000, 45000, 56000, 68000),
    ('Carnes',           'Carne desmechada en reducción de panela, jamón, cebolla puerro, pimentón y queso.',        23000, 35000, 45000, 56000, 68000),

    -- Tier 4 — 24/36/47/58/70
    ('Filadelfia',       'Pollo, tocineta, maíz tierno, cebolla, aceitunas y queso.',                                24000, 36000, 47000, 58000, 70000),
    ('Paisa',            'Tocineta, chorizo especial porcionado, maíz tierno, plátano maduro, guacamole y queso.',   24000, 36000, 47000, 58000, 70000),
    ('California',       'Carne molida, chorizo especial, cebolla, pimentón y queso.',                               24000, 36000, 47000, 58000, 70000),
    ('Especial Carnes',  'Pollo, jamón, chorizo, tocineta y queso.',                                                 24000, 36000, 47000, 58000, 70000),
    ('Especial Family',  'Tomate, cebolla, peperoni, tocineta, chorizo y queso.',                                    24000, 36000, 47000, 58000, 70000),

    -- Tier 5 — 34/47/60/72/93 (camarones)
    ('Marinera',         'Camarones, cebolla, tomate en cuadros y queso.',                                           34000, 47000, 60000, 72000, 93000)
),
upserted as (
  insert into products (name, category, description, active, max_flavors, min_size_for_multiflavor)
  select name, 'pizza', description, true, 2, 'pequena'
  from tiered
  on conflict do nothing
  returning id, name
),
prices as (
  select u.id as product_id, t.personal, t.pequena, t.mediana, t.grande, t.familiar
  from upserted u
  join tiered t using (name)
)
insert into product_sizes (product_id, size, price_cents)
select product_id, s.size, s.price
from prices
cross join lateral (values
  ('personal', personal),
  ('pequena',  pequena),
  ('mediana',  mediana),
  ('grande',   grande),
  ('familiar', familiar)
) as s(size, price)
on conflict (product_id, size) do update set price_cents = excluded.price_cents;
