"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** True after hydration, false during server render. Avoids theme flashes without an effect. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
