/** Tracking-link (UTM) builder: one link per platform, labels filled in automatically. */

export function slugLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export type UtmSettings = { medium?: string; campaign?: string; content?: string };

export function defaultUtm(opts: { workspaceSlug: string; month: string; title: string }): Required<UtmSettings> {
  return {
    medium: "social",
    campaign: `${opts.workspaceSlug}-${opts.month}`,
    content: slugLabel(opts.title),
  };
}

export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function buildTrackedLinks(
  destination: string | null | undefined,
  platforms: string[],
  utm: Required<UtmSettings>,
): Record<string, string> {
  if (!destination || !isValidUrl(destination)) return {};
  const links: Record<string, string> = {};
  for (const platform of platforms) {
    const url = new URL(destination);
    url.searchParams.set("utm_source", platform);
    url.searchParams.set("utm_medium", utm.medium || "social");
    if (utm.campaign) url.searchParams.set("utm_campaign", utm.campaign);
    if (utm.content) url.searchParams.set("utm_content", utm.content);
    links[platform] = url.toString();
  }
  return links;
}
