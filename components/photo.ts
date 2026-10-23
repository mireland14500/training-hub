// Client-side helpers shared by the photo-reading forms.

/** Shrinks the photo so uploads are fast on mobile data and under server limits. */
export async function resizeImage(file: File, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not process photo"))), "image/jpeg", 0.85));
}

/** Uploads a photo and returns what was read from it. */
export async function readPhoto<T>(file: File, kind: "erg" | "hyrox" | "workout"): Promise<{ photoPath?: string; reading: T | null; error?: string }> {
  const body = new FormData();
  body.append("kind", kind);
  body.append("photo", new File([await resizeImage(file)], "photo.jpg", { type: "image/jpeg" }));
  const res = await fetch("/api/read-photo", { method: "POST", body });
  return res.json();
}

/** Seconds → "m:ss" / "h:mm:ss" (with tenths when present). */
export function fmtTime(s: number | null | undefined): string {
  if (s == null) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(1).replace(/\.0$/, "");
  const ss = sec.padStart(sec.includes(".") ? 4 : 2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function localInputValue(d: Date) {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
