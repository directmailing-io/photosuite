// Client-side Bild-Komprimierung via Canvas
// Skaliert auf maxSide und exportiert als JPEG mit gegebener Qualität.

export async function compressImage(
  file: File,
  maxSide = 2000,
  quality = 0.82,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // HEIC kann der Browser meist nicht decodieren — Original durchreichen
  if (file.type === "image/heic" || file.type === "image/heif") return file;

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    let { width, height } = img;
    if (width <= maxSide && height <= maxSide && file.size < 1.5 * 1024 * 1024) {
      // Klein genug — keine Komprimierung
      return file;
    }
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        quality,
      );
    });

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}
