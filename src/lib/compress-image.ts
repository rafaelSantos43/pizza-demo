// Comprime una imagen client-side: la redimensiona a maxDim en el lado más
// largo, la re-codifica como JPEG con quality indicado, y devuelve un nuevo
// File. Reduce fotos de celular de 3-5 MB a ~200-500 KB sin pérdida visual
// apreciable para un comprobante de pago.

const DEFAULT_MAX_DIM = 1600;
const DEFAULT_QUALITY = 0.8;

export async function compressImage(
  file: File,
  maxDim = DEFAULT_MAX_DIM,
  quality = DEFAULT_QUALITY,
): Promise<File> {
  // Si ya es pequeña (<500 KB) o no es imagen, la devolvemos tal cual.
  if (!file.type.startsWith("image/") || file.size < 500 * 1024) {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob: Blob | null = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
  });
  if (!blob) return file;

  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
