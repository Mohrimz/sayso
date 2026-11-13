"use client";

import { useSyncExternalStore } from "react";

/*
 * The chime for a new chat message: two soft, rising notes made with the Web
 * Audio API, so there's no audio file to load. Each device remembers whether
 * it's muted.
 *
 * Browsers only allow sound after someone has interacted with the page, so the
 * audio is unlocked on the first tap or key press.
 */

const MUTE_KEY = "sayso:message-sound";
const LAST_KEY = "sayso:message-sound-at";
const listeners = new Set<() => void>();

function read(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode or storage blocked: the setting just won't be remembered.
  }
}

export function messageSoundOn() {
  return typeof window === "undefined" || read(MUTE_KEY) !== "off";
}

export function setMessageSound(on: boolean) {
  write(MUTE_KEY, on ? "on" : "off");
  for (const fn of listeners) fn();
  if (on) playMessageSound({ force: true });
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => e.key === MUTE_KEY && fn();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

/** Whether message sounds are on for this device, kept in sync across tabs. */
export function useMessageSound(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, messageSoundOn, () => true);
  return [on, setMessageSound];
}

type AudioContextClass = typeof AudioContext;
let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Ctx: AudioContextClass | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextClass }).webkitAudioContext;
    if (!Ctx) return null;
    context = new Ctx();
  }
  return context;
}

/** Unlocks audio on the first tap or key press (browsers block sound before that). */
export function primeMessageSound() {
  const unlock = () => {
    const c = audio();
    if (c && c.state === "suspended") void c.resume();
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  return () => {
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
}

/**
 * Plays the chime. `quiet` is for a message arriving in the conversation
 * already on screen. A burst of messages, or the same message seen by several
 * open tabs, chimes once.
 */
export function playMessageSound({ quiet = false, force = false }: { quiet?: boolean; force?: boolean } = {}) {
  if (!force && !messageSoundOn()) return;
  const now = Date.now();
  if (!force && now - Number(read(LAST_KEY) ?? 0) < 1500) return;
  write(LAST_KEY, String(now));

  const c = audio();
  if (!c) return;
  if (c.state === "suspended") void c.resume();

  const out = c.createGain();
  out.gain.value = quiet ? 0.12 : 0.3;
  out.connect(c.destination);

  const start = c.currentTime + 0.02;
  // G5 then C6: a short, friendly rise. Each note has a little bell-like overtone.
  const notes: [number, number][] = [
    [783.99, 0],
    [1046.5, 0.12],
  ];
  for (const [freq, delay] of notes) {
    const at = start + delay;
    for (const [multiple, level] of [
      [1, 1],
      [2, 0.16],
      [3, 0.05],
    ] as const) {
      const osc = c.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * multiple;
      const env = c.createGain();
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(level, at + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      osc.connect(env).connect(out);
      osc.start(at);
      osc.stop(at + 0.55);
    }
  }
}
