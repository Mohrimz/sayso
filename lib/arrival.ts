/**
 * After signing in (password, email link, invite or first-time setup), people
 * go through /arrive, which plays the welcome animation and then opens the
 * page they were heading to. Shared by the server actions, the link
 * confirmation route and the browser.
 */
export type ArrivalKind = "back" | "new";

export function arrivalUrl(to: string, kind: ArrivalKind): string {
  return `/arrive?kind=${kind}&to=${encodeURIComponent(to)}`;
}
