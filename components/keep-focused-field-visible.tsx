"use client";

import { useEffect } from "react";

const FIELD = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]), textarea, select';

/**
 * On phones and tablets, keeps the field being typed in where people can see
 * it: in the upper part of the space left above the on-screen keyboard, with
 * room for the button below it. Works inside any element marked
 * `data-keep-focus-visible`.
 *
 * Phone browsers don't shrink the page for the keyboard; they only shrink the
 * visual viewport. So this also sets `--keyboard-inset` (how much of the screen
 * the keyboard covers) on <html>, which the page adds as bottom padding so even
 * the last field can scroll up.
 */
export function KeepFocusedFieldVisible() {
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const vv = window.visualViewport;
    const root = document.documentElement;
    let timer = 0;

    const focusedField = (): HTMLElement | null => {
      const el = document.activeElement;
      return el instanceof HTMLElement && el.matches(FIELD) && el.closest("[data-keep-focus-visible]") ? el : null;
    };

    const update = () => {
      const field = focusedField();
      const covered = vv ? Math.max(0, Math.round(window.innerHeight - vv.height)) : 0;
      root.style.setProperty("--keyboard-inset", field ? `${covered}px` : "0px");
      if (!field) return;

      window.clearTimeout(timer);
      // Wait for the keyboard to finish opening and the browser's own scroll to settle.
      timer = window.setTimeout(() => {
        const rect = field.getBoundingClientRect();
        const visibleTop = vv ? vv.offsetTop : 0;
        const visibleHeight = vv ? vv.height : window.innerHeight;
        const top = rect.top - visibleTop;
        const bottom = rect.bottom - visibleTop;
        // Aim for the upper third, leaving space below for the submit button.
        const target = Math.min(140, Math.round(visibleHeight * 0.3));
        const wellPlaced = top >= 16 && top <= visibleHeight * 0.45 && bottom <= visibleHeight - 64;
        if (!wellPlaced) window.scrollBy({ top: top - target, behavior: "smooth" });
      }, 120);
    };

    const onFocusOut = () => window.setTimeout(update, 50);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", onFocusOut);
    vv?.addEventListener("resize", update);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", onFocusOut);
      vv?.removeEventListener("resize", update);
      root.style.removeProperty("--keyboard-inset");
    };
  }, []);

  return null;
}
