/**
 * Make a photograph fit for the web, in the browser, before it is uploaded.
 *
 * WHY THE OLD LIMIT WAS WRONG. Every uploader in this app refused files over
 * 5MB. Nothing required that: the buckets carry no size limit at all, so the
 * number was invented in one component and copied into the next two. And of
 * every kind of business, a photography studio is the one that cannot meet it —
 * a JPEG straight out of Lightroom is routinely 15 to 40MB. The app was asking
 * a studio to go and shrink its own photographs before it would accept them,
 * which is work the studio has a computer for.
 *
 * WHAT IT DOES INSTEAD. The picture is decoded, scaled down so its longest edge
 * fits what the screen it will appear on can actually show, and re-encoded.
 * Nothing visible is lost: a cover is never drawn wider than about 1200 points,
 * so 2400 pixels is already twice what the densest display can resolve, and
 * every pixel beyond that is bytes spent on detail no one will ever see.
 *
 * WEBP AT HIGH QUALITY, JPEG WHERE THAT IS NOT AVAILABLE. WebP holds
 * transparency, which a logo needs and JPEG cannot give, and reaches the same
 * apparent quality in roughly a third of the bytes. Quality is set high on
 * purpose — this is a studio's work, and the point is to spend the saving on
 * dimensions no one can see rather than on artefacts they can.
 *
 * IT NEVER MAKES THINGS WORSE. If the source is already small enough and the
 * re-encode comes back larger, the original is kept. And SVG is returned
 * untouched, because rasterising a vector to fit a box is a downgrade rather
 * than a saving.
 *
 * The orientation flag matters more than it looks: a photograph taken on a
 * phone carries its rotation in EXIF rather than in its pixels, and a canvas
 * that ignores that writes it out sideways, permanently.
 */

/** Bigger than any screen can show, and small enough to decode without stalling. */
const DEFAULT_MAX_EDGE = 2400;
const QUALITY = 0.9;

/**
 * A ceiling on what is worth trying to decode at all.
 *
 * Not a rule about what a studio may upload — it is the point past which a
 * browser tab stops being able to hold the decoded bitmap. A 200MB image is
 * roughly a gigabyte once decoded, and the tab dies rather than the upload
 * failing politely.
 */
const DECODE_CEILING = 80 * 1024 * 1024;

export type PreparedImage = {
  file: File;
  /** What it started as, so a caller can say what it saved. */
  originalBytes: number;
  resized: boolean;
};

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      // from-image, so a photograph taken sideways on a phone is not written
      // out sideways for good.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Falls through to the img path, which older Safari needs anyway.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // Revoked after decode rather than after draw: the bitmap is in memory by
    // then and the object URL is only the way in.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

export async function prepareImage(
  file: File,
  { maxEdge = DEFAULT_MAX_EDGE }: { maxEdge?: number } = {},
): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new Error('That is not an image file.');
  // A vector is already the right size at every size.
  if (file.type === 'image/svg+xml') return { file, originalBytes: file.size, resized: false };
  if (file.size > DECODE_CEILING) {
    throw new Error('That image is too large for a browser to open. Export it at a smaller size first.');
  }

  const source = await decode(file);
  const width = 'width' in source ? source.width : 0;
  const height = 'height' in source ? source.height : 0;
  if (!width || !height) return { file, originalBytes: file.size, resized: false };

  // Never upscale. Making a small picture bigger adds bytes and no detail.
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { file, originalBytes: file.size, resized: false };
  ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
  if ('close' in source) source.close();

  let blob = await encode(canvas, 'image/webp');
  let ext = 'webp';
  // A browser that cannot write WebP answers with a PNG, which is worse than
  // the JPEG we would have asked for — so ask again, explicitly.
  if (!blob || blob.type !== 'image/webp') {
    blob = await encode(canvas, 'image/jpeg');
    ext = 'jpg';
  }
  if (!blob) return { file, originalBytes: file.size, resized: false };

  // If nothing was scaled and the re-encode came back bigger, the original was
  // already the better file.
  if (scale === 1 && blob.size >= file.size) {
    return { file, originalBytes: file.size, resized: false };
  }

  const base = file.name.replace(/\.[^.]+$/, '') || 'image';
  return {
    file: new File([blob], `${base}.${ext}`, { type: blob.type }),
    originalBytes: file.size,
    resized: scale < 1,
  };
}

/** "12.4MB" — for saying what a file was, and what it became. */
export function readableBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}
