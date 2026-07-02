// Nombre comercial del restaurante operando el sistema. Cambiar acá
// reemplaza el branding en sidebar, login, landing y `<title>` de cada
// ruta. Cuando aparezca el 2do cliente y se vaya a multi-tenant, esto
// se reemplaza por una lectura de `settings.business_name` por tenant.
export const BRAND_NAME = "Pizza Demo";
export const BRAND_TAGLINE = "";

export function pageTitle(suffix?: string): string {
  return suffix ? `${suffix} | ${BRAND_NAME}` : BRAND_NAME;
}
