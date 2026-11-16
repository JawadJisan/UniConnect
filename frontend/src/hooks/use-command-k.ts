'use client';

import { useEffect, useSyncExternalStore } from 'react';

/** Calls `toggle` on Ctrl+K, or ⌘K on Apple platforms. */
export function useCommandK(toggle: () => void) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggle();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toggle]);
}

const subscribeToNothing = () => () => {};

/** True on macOS and iOS, where the shortcut is ⌘K rather than Ctrl K. */
export function useIsApplePlatform() {
  return useSyncExternalStore(
    subscribeToNothing,
    () => /Mac|iPhone|iPad/.test(navigator.userAgent),
    () => true,
  );
}
