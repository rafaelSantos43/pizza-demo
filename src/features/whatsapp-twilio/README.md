# WhatsApp via Twilio (módulo de prueba — TEMPORAL)

Módulo aislado para probar el flujo F1 del PRD (cliente escribe a WhatsApp →
recibe link al catálogo) **sin** depender de la verificación de Meta ni
plantillas aprobadas.

> **No forma parte del producto v1.** El stack oficial es WhatsApp Cloud API
> de Meta (ver `src/features/whatsapp/`). Esto es solo para validar el flujo
> end-to-end mientras Meta verifica el negocio.

## Cómo eliminar este módulo

1. Borrar carpeta `src/features/whatsapp-twilio/`
2. Borrar carpeta `app/api/webhooks/twilio/`
3. Quitar el bloque `TWILIO_*` del `.env.local`

Listo. Cero referencias quedan en el resto del código (no se modificó
`src/lib/env.ts`, ni el sender de Meta, ni `handle-incoming.ts`).

## Setup

1. Cuenta Twilio gratis: https://console.twilio.com
2. Activar sandbox: Messaging → Try it out → **Send a WhatsApp message**.
   Copia el código `join <palabra>` y mándalo desde tu WhatsApp al
   `+1 415 523 8886`.
3. Llenar `.env.local`:
   ```
   TWILIO_ACCOUNT_SID=ACxxxx
   TWILIO_AUTH_TOKEN=xxxx
   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
   ```
4. Túnel a localhost:
   ```
   bunx ngrok http 3000
   ```
5. En el sandbox de Twilio, configurar:
   - **WHEN A MESSAGE COMES IN**: `https://<tu-ngrok>.ngrok-free.app/api/webhooks/twilio` (POST)
6. Si la verificación de firma falla (suele pasar detrás de proxy), fija
   `TWILIO_WEBHOOK_URL_OVERRIDE` al valor exacto que pegaste arriba.

## Probar

Desde tu WhatsApp (ya unido al sandbox) manda cualquier texto al número
`+1 415 523 8886`. Deberías recibir:

```
¡Hola <nombre>! 🍕 Aquí está nuestro menú:
http://localhost:3000/pedir/<token>

El link es solo para ti y expira en 2 horas.
```

> El link apunta a `NEXT_PUBLIC_APP_URL`. Si quieres que sea clickeable
> en tu celular, cambia esa var a la URL de ngrok temporalmente.

## Qué reusa del código del proyecto

- `signToken` de `src/features/order-tokens/sign.ts` (mismo token que Meta)
- `supabaseAdmin` para upsert de customer
- Tabla `whatsapp_messages_seen` para dedupe (los SIDs de Twilio empiezan
  con `SM`/`MM`, no chocan con los `wamid.xxx` de Meta)

## Qué NO hace

- No procesa imágenes (comprobantes de pago)
- No detecta intent "¿ya viene?"
- No envía notificaciones de cambio de estado
- No valida plantillas (el sandbox no lo requiere)

Si esto funciona y decides moverte de Meta a Twilio en producción, hay que
extender este módulo o promoverlo a reemplazo de `src/features/whatsapp/`.
