-- Endurece la policy de auto-update de profiles: el usuario autenticado
-- puede modificar SU PROPIA fila, pero NO puede cambiar `role` ni `active`.
-- Sin esto, un driver podía hacer `update profiles set role='admin' where id = auth.uid()`
-- desde el browser (privilege escalation). Las mutaciones administrativas
-- pasan por Server Actions con `assertStaffRole(['admin'])` y service_role
-- (bypassea RLS), así que esta policy NO afecta el flujo de gestión.

drop policy if exists profiles_self_update on profiles;

create policy profiles_self_update on profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from profiles p where p.id = auth.uid())
    and active = (select p.active from profiles p where p.id = auth.uid())
  );
