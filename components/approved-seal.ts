/**
 * The moment a client approves a post: the post turns to face them like a card
 * and a wax seal with the Sayso tick is pressed onto it. Built with plain DOM
 * and the Web Animations API (like the confetti before it), so it keeps
 * playing while the page swaps the approval form for the "Approved" card.
 * About 1.9s; a calm fade with reduced motion. Nothing to click: it never
 * blocks the page.
 */

const SEAL_SRC = "/empty/seal-top.webp";
const TOTAL_MS = 1900;

let showing: HTMLElement | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.style.cssText = css;
  return node;
}

export function stampApproved({ cover, title }: { cover?: string | null; title: string }) {
  if (typeof window === "undefined") return;
  showing?.remove();
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const root = el("div", "position:fixed;inset:0;z-index:80;pointer-events:none;display:grid;place-items:center;perspective:1100px;");
  root.setAttribute("aria-hidden", "true");
  const veil = el(
    "div",
    "position:absolute;inset:0;background:radial-gradient(circle at 50% 50%, rgb(23 21 28 / 0.32), rgb(23 21 28 / 0.12) 75%);opacity:0;",
  );
  const stage = el("div", "position:relative;transform-style:preserve-3d;");

  const width = Math.min(232, Math.round(window.innerWidth * 0.58));
  const card = el(
    "div",
    `position:relative;width:${width}px;aspect-ratio:4/5;border-radius:18px;background:#fff;padding:8px;box-sizing:border-box;` +
      "box-shadow:0 34px 64px -26px rgb(23 21 28 / 0.6), 0 0 0 1px rgb(23 21 28 / 0.06);backface-visibility:hidden;",
  );
  if (cover) {
    const img = el("img", "display:block;width:100%;height:100%;object-fit:cover;border-radius:12px;background:#f1efea;");
    img.src = cover;
    img.alt = "";
    card.append(img);
  } else {
    const face = el(
      "div",
      "display:flex;align-items:flex-end;height:100%;box-sizing:border-box;padding:18px;border-radius:12px;background:#f6f1e7;" +
        "font:600 18px/1.25 var(--font-display, system-ui), system-ui, sans-serif;color:#1d1b16;overflow:hidden;",
    );
    face.textContent = title;
    card.append(face);
  }

  const size = Math.round(width * 0.5);
  const spot = `position:absolute;width:${size}px;height:${size}px;right:${-Math.round(size * 0.24)}px;bottom:${-Math.round(size * 0.2)}px;`;
  const ring = el("div", `${spot}border-radius:50%;border:3px solid #ff5b2e;opacity:0;`);
  const seal = el("img", `${spot}opacity:0;`);
  seal.src = SEAL_SRC;
  seal.alt = "";

  stage.append(card, ring, seal);
  root.append(veil, stage);
  document.body.append(root);
  showing = root;

  const finish = () => {
    root.remove();
    if (showing === root) showing = null;
  };
  window.setTimeout(finish, TOTAL_MS + 250);

  if (reduce || typeof root.animate !== "function") {
    seal.style.opacity = "1";
    seal.style.transform = "rotate(-8deg)";
    const fade = [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }];
    veil.animate?.(fade, { duration: 1400, fill: "forwards" });
    stage.animate?.(fade, { duration: 1400, fill: "forwards" });
    return;
  }

  veil.animate([{ opacity: 0 }, { opacity: 1, offset: 0.14 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: TOTAL_MS, fill: "forwards" });

  // The post turns to face you.
  card.animate(
    [
      { transform: "translateY(40px) rotateY(-78deg) rotateX(14deg) scale(0.86)", opacity: 0 },
      { opacity: 1, offset: 0.4 },
      { transform: "none", opacity: 1 },
    ],
    { duration: 560, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "both" },
  );

  // The seal falls, presses in (a little squash) and stays at a hand-stamped angle.
  const landed = "drop-shadow(2px 5px 4px rgb(70 14 0 / 0.45))";
  seal.animate(
    [
      {
        transform: "scale(2.6) rotate(-32deg)",
        opacity: 0,
        filter: "drop-shadow(22px 34px 20px rgb(70 14 0 / 0.22))",
        easing: "cubic-bezier(0.55, 0, 0.9, 0.4)",
      },
      { opacity: 1, offset: 0.3 },
      { transform: "scale(1) rotate(-8deg)", opacity: 1, filter: landed, offset: 0.62, easing: "ease-out" },
      { transform: "scale(1.1, 0.88) rotate(-8deg)", offset: 0.75, easing: "ease-in-out" },
      { transform: "scale(0.97, 1.03) rotate(-8deg)", offset: 0.88 },
      { transform: "scale(1) rotate(-8deg)", opacity: 1, filter: landed },
    ],
    { duration: 420, delay: 340, fill: "both" },
  );

  // The card gives under the press, then everything lifts away.
  const impact = (340 + 420 * 0.62) / TOTAL_MS;
  stage.animate(
    [
      { transform: "none", opacity: 1, offset: 0 },
      { transform: "none", offset: impact },
      { transform: "translateY(6px) rotateX(8deg) scale(0.985)", offset: impact + 0.05, easing: "ease-out" },
      { transform: "none", offset: impact + 0.17 },
      { transform: "none", opacity: 1, offset: 0.8, easing: "ease-in" },
      { transform: "translateY(-16px) scale(0.96)", opacity: 0, offset: 1 },
    ],
    { duration: TOTAL_MS, fill: "forwards" },
  );

  ring.animate(
    [
      { transform: "scale(0.7)", opacity: 0.75 },
      { transform: "scale(1.9)", opacity: 0 },
    ],
    { duration: 650, delay: 340 + 420 * 0.62, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "forwards" },
  );
}
