/** Only build player URLs for known providers; never embed supplied HTML. */
export function videoEmbedUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    let youtubeId: string | null = null;
    if (host === "youtu.be") youtubeId = url.pathname.slice(1);
    if (["youtube.com", "www.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)) {
      if (url.pathname === "/watch") youtubeId = url.searchParams.get("v");
      else youtubeId = url.pathname.match(/^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})\/?$/)?.[1] ?? null;
    }
    if (youtubeId && /^[A-Za-z0-9_-]{11}$/.test(youtubeId)) {
      return `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0`;
    }
    if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)) {
      const match = url.pathname.match(/^\/(?:video\/)?([0-9]{5,12})(?:\/([A-Za-z0-9]{6,32}))?\/?$/);
      if (!match) return null;
      const hash = url.searchParams.get("h") ?? match[2];
      if (hash && !/^[A-Za-z0-9]{6,32}$/.test(hash)) return null;
      return `https://player.vimeo.com/video/${match[1]}${hash ? `?h=${hash}` : ""}`;
    }
  } catch { /* Not an absolute, valid URL. */ }
  return null;
}

export function isExerciseSourceUrl(value: unknown): value is string {
  return typeof value === "string" && /^https:\/\/www\.muscleandstrength\.com\/exercises\/[a-z0-9-]+(?:\.html)?$/.test(value);
}

export function videoWatchUrl(value: unknown): string | null {
  const embed = videoEmbedUrl(value);
  if (!embed) return null;
  const url = new URL(embed);
  const id = url.pathname.split("/").pop();
  return url.hostname === "player.vimeo.com"
    ? `https://vimeo.com/${id}${url.searchParams.get("h") ? `/${url.searchParams.get("h")}` : ""}`
    : `https://www.youtube.com/watch?v=${id}`;
}

export function guideSourceUrl(value: unknown): string | null {
  if (isExerciseSourceUrl(value)) return value;
  if (typeof value !== "string") return null;
  const video = videoEmbedUrl(value);
  if (video) return video;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password && !url.port &&
      ["www.southtees.nhs.uk", "www.cuh.nhs.uk", "www.nuffieldhealth.com"].includes(url.hostname)) return `${url.origin}${url.pathname}`;
  } catch { /* Not an allowed source. */ }
  return null;
}
