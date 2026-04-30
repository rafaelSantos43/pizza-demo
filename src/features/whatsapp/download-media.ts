import "server-only";

import { getServerEnv } from "@/lib/env";

interface MediaPayload {
  bytes: Uint8Array;
  mimeType: string;
}

export async function downloadMedia(
  mediaId: string,
): Promise<MediaPayload | null> {
  const env = getServerEnv();
  const auth = `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`;

  try {
    const metaRes = await fetch(
      `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${mediaId}`,
      { headers: { Authorization: auth } },
    );
    if (!metaRes.ok) {
      console.error(
        "[whatsapp] downloadMedia metadata non-2xx",
        metaRes.status,
        await metaRes.text(),
      );
      return null;
    }
    const meta = (await metaRes.json()) as {
      url?: string;
      mime_type?: string;
    };
    if (!meta.url || !meta.mime_type) {
      console.error("[whatsapp] downloadMedia missing url/mime", meta);
      return null;
    }

    const fileRes = await fetch(meta.url, {
      headers: { Authorization: auth },
    });
    if (!fileRes.ok) {
      console.error(
        "[whatsapp] downloadMedia file non-2xx",
        fileRes.status,
        await fileRes.text(),
      );
      return null;
    }
    const arrayBuffer = await fileRes.arrayBuffer();
    return { bytes: new Uint8Array(arrayBuffer), mimeType: meta.mime_type };
  } catch (err) {
    console.error("[whatsapp] downloadMedia threw", err);
    return null;
  }
}
