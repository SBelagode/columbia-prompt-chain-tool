// Mirrors the other two apps so uploads follow the same rules. Shared by the
// run form (client) and the run route.

export const MEME_BUCKET = "meme-images";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMAGE_LABEL = "5 MB";

// Formats both browsers can preview and Gemini accepts as inline image data.
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export const IMAGE_EXTENSIONS: Record<AllowedImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Stored in generations.user_prompt for image-based posts, which have no typed situation.
export const IMAGE_USER_PROMPT = "Uploaded image for Columbia meme generation";

export function isAllowedImageType(type: string): type is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type);
}

// Identifies the image format from its leading bytes; the browser-reported MIME type is not trusted.
export function sniffImageType(bytes: ArrayBuffer): AllowedImageType | null {
  const b = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 12));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return "image/png";
  }
  const ascii = (start: number, end: number) => String.fromCharCode(...b.slice(start, end));
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}
