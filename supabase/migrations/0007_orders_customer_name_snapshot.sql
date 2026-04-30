-- =====================================================
-- 0007_orders_customer_name_snapshot.sql
-- Snapshot del nombre del cliente en el momento del pedido. Hasta hoy
-- las queries hacían JOIN con customers para resolver `name`, pero el
-- nombre se sobreescribe en cada checkout (`createOrder`), distorsionando
-- el histórico cuando el mismo teléfono pide con nombres distintos.
-- Espejo simétrico al manejo de addresses: cada pedido tiene su propio
-- registro fiel del momento, sin afectar al cliente "vivo".
-- Idempotente.
-- =====================================================

alter table orders
  add column if not exists customer_name text;

-- Backfill one-time: copia el nombre actual del customer a las filas que
-- existían antes de la migración. Sin este UPDATE los pedidos viejos
-- quedarían con NULL en el snapshot (la query tiene fallback al JOIN
-- igual, pero llenar deja todo consistente).
update orders
   set customer_name = c.name
  from customers c
 where orders.customer_id = c.id
   and orders.customer_name is null;
