"use client";

import { useSyncExternalStore } from "react";

export type CartItem = { productId: string; quantity: number };

// The cart only stores product ids + quantities. Prices and stock are always re-read from
// the database (cart page) and re-checked on the server (place_order) - never trusted here.
const KEY = "cart:v1";
const MAX_ITEMS = 50;
const MAX_QTY = 99;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY: CartItem[] = [];

let cache: CartItem[] | null = null;
const listeners = new Set<() => void>();

function sanitize(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const out: CartItem[] = [];
  for (const entry of raw.slice(0, MAX_ITEMS)) {
    if (typeof entry !== "object" || entry === null) continue;
    const { productId, quantity } = entry as Record<string, unknown>;
    if (typeof productId !== "string" || !UUID.test(productId)) continue;
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) continue;
    out.push({ productId, quantity: Math.min(quantity, MAX_QTY) });
  }
  return out;
}

function read(): CartItem[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = sanitize(raw ? JSON.parse(raw) : []);
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: CartItem[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode / quota): cart still works for this session
  }
  listeners.forEach((l) => l());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) {
      cache = null;
      callback();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

const actions = {
  add(productId: string, quantity: number) {
    const current = read();
    const exists = current.some((i) => i.productId === productId);
    const next = exists
      ? current.map((i) =>
          i.productId === productId ? { ...i, quantity: Math.min(i.quantity + quantity, MAX_QTY) } : i,
        )
      : [...current, { productId, quantity: Math.min(quantity, MAX_QTY) }].slice(0, MAX_ITEMS);
    write(next);
  },
  setQuantity(productId: string, quantity: number) {
    const q = Math.max(1, Math.min(Math.floor(quantity), MAX_QTY));
    write(read().map((i) => (i.productId === productId ? { ...i, quantity: q } : i)));
  },
  remove(productId: string) {
    write(read().filter((i) => i.productId !== productId));
  },
  clear() {
    write([]);
  },
};

export function useCart() {
  const items = useSyncExternalStore(subscribe, read, () => EMPTY);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  return { items, count, ...actions };
}
