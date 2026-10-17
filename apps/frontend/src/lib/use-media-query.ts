import { useSyncExternalStore } from "react";

/** Whether `query` matches now, following it as the window changes. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (listener) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", listener);
      return () => list.removeEventListener("change", listener);
    },
    () => window.matchMedia(query).matches,
  );
}
