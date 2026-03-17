"use client";

import { useEffect } from "react";
import { getPendingLogs } from "../lib/offline-store";

// TypeScript doesn't include the Background Sync API types by default,
// so we extend ServiceWorkerRegistration here to avoid the TS error.
interface SyncManager {
  register(tag: string): Promise<void>;
}

interface ExtendedServiceWorkerRegistration extends ServiceWorkerRegistration {
  readonly sync: SyncManager;
}

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // ── Register ─────────────────────────────────────────────────────────────
    navigator.serviceWorker
      .register("/service-worker.js", { scope: "/" })
      .then((reg) => {
        console.log("[SW] Registered, scope:", reg.scope);

        // Register Background Sync tag if browser supports it
        if ("SyncManager" in window) {
          const extReg = reg as ExtendedServiceWorkerRegistration;
          extReg.sync
            .register("sync-activity-logs")
            .catch((e: unknown) =>
              console.warn("[SW] Background Sync register failed:", e)
            );
        }
      })
      .catch((err: unknown) => console.error("[SW] Registration failed:", err));

    // ── Listen for SW_SYNC_TRIGGER messages from the service worker ───────────
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "SW_SYNC_TRIGGER") {
        console.log("[SW] Sync trigger received");
        window.dispatchEvent(new CustomEvent("acculog:sync"));
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);

    // ── Trigger sync when app comes to foreground ─────────────────────────────
    const handleVisibilityChange = () => {
      if (!document.hidden && navigator.onLine && getPendingLogs().length > 0) {
        window.dispatchEvent(new CustomEvent("acculog:sync"));
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // ── Trigger sync when connection is restored ──────────────────────────────
    const handleOnline = () => {
      if (getPendingLogs().length > 0) {
        window.dispatchEvent(new CustomEvent("acculog:sync"));
      }
    };

    window.addEventListener("online", handleOnline);

    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return null;
}