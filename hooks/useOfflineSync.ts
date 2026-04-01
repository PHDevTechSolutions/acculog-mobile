// hooks/useOfflineSync.ts
"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { toast } from "sonner";
import {
  getAllPendingLogs,
  removePendingLog,
  incrementRetry,
  getPendingCount,
} from "@/lib/offline-store";

const MAX_RETRIES = 5;

export function useOfflineSync(onSyncComplete?: () => void) {
  const syncingRef = useRef(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  const refreshCount = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  }, []);

  const syncNow = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;

    const logs = await getAllPendingLogs();
    if (logs.length === 0) {
      syncingRef.current = false;
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const log of logs) {
      if (log.retries >= MAX_RETRIES) {
        // Give up on this log after too many failures
        await removePendingLog(log.id);
        continue;
      }

      try {
        const res = await fetch("/api/ModuleSales/Activity/AddLog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(log.payload),
        });

        if (res.ok || res.status === 409) {
          // 409 = duplicate, already saved — remove from queue
          await removePendingLog(log.id);
          successCount++;
        } else {
          await incrementRetry(log.id);
          failCount++;
        }
      } catch {
        await incrementRetry(log.id);
        failCount++;
      }
    }

    syncingRef.current = false;
    await refreshCount();

    if (successCount > 0) {
      toast.success(`${successCount} offline log${successCount > 1 ? "s" : ""} synced!`);
      onSyncComplete?.();
    }
    if (failCount > 0) {
      toast.error(`${failCount} log${failCount > 1 ? "s" : ""} failed to sync. Will retry later.`);
    }
  }, [onSyncComplete, refreshCount]);

  useEffect(() => {
    refreshCount();

    const handleOnline = () => {
      setIsOnline(true);
      syncNow();
    };
    const handleOffline = () => setIsOnline(false);

    // Custom event from service worker
    const handleSWSync = () => syncNow();

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("acculog:sync", handleSWSync);

    // Also try to sync on mount if online
    if (navigator.onLine) syncNow();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("acculog:sync", handleSWSync);
    };
  }, [syncNow, refreshCount]);

  return { pendingCount, isOnline, syncNow };
}