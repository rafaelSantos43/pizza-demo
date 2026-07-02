-- Realtime necesita REPLICA IDENTITY FULL en `orders` para que el `payload.old`
-- de los eventos UPDATE incluya driver_id/status. Con el default (solo la PK en
-- `old`), el handler del driver (src/components/dashboard/driver-orders-list.tsx)
-- no puede detectar la transición "no actuable → actuable":
--   - re-dispara el beep en cada UPDATE de un pedido ya actuable (p.ej. al tocar
--     "Salgo", ready → on_the_way), y
--   - no descarta el toast persistente cuando el pedido sale de su lista
--     (reasignado a otro driver, entregado).
-- El panel del cajero no depende de `payload.old`, así que solo afecta al driver.
--
-- Costo: FULL escribe la fila vieja completa en el WAL en cada UPDATE. En el
-- volumen de un solo restaurante es despreciable.

alter table orders replica identity full;
