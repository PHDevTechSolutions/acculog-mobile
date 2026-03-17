"use client";

/**
 * useOfflineSync.ts
 *
 * Central hook for offline-first behaviour:
 *  - Detects online/offline state
 *  - Wraps AddLog POST with offline queuing
 *  - Syncs pending logs when connectivity returns
 *  - Wraps GET fetches with localStorage cache fallback
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addPendingLog,
  appendOptimisticLog,
  clearAllOfflineData,
  getCachedLastStatus,
  getCachedLoginSummary,
  getCachedLogs,
  getCachedUsers,
  getPendingLogs,
  incrementPendingLogRetry,
  purgeStalePendingLogs,
  removePendingLog,
  setCachedLastStatus,
  setCachedLoginSummary,
  setCachedLogs,
  setCachedUsers,
  updateCachedLoginSummaryOptimistic,
  type CachedActivityLog,
  type PendingLog,
} from "@/lib/offline-store";

export interface AddLogPayload {
  ReferenceID:     string;
  Email:           string;
  Type:            string;
  Status:          string;
  Location?:       string;
  Latitude?:       number;
  Longitude?:      number;
  PhotoURL?:       string;
  Remarks?:        string;
  TSM?:            string;
  SiteVisitAccount?: string;
}

interface SyncResult {
  synced:  number;
  failed:  number;
  pending: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useOfflineSync() {
  const [isOnline,      setIsOnline]      = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pendingCount,  setPendingCount]  = useState(0);
  const [isSyncing,     setIsSyncing]     = useState(false);
  const syncLockRef = useRef(false);

  // ── Track pending count ───────────────────────────────────────────────────

  const refreshPendingCount = useCallback(() => {
    setPendingCount(getPendingLogs().length);
  }, []);

  // ── Online / offline listeners ────────────────────────────────────────────

  useEffect(() => {
    const onOnline  = () => { setIsOnline(true);  triggerSync(); };
    const onOffline = () => { setIsOnline(false); };

    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);
    refreshPendingCount();

    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // ── Sync pending logs to server ───────────────────────────────────────────

  const syncPendingLogs = useCallback(async (): Promise<SyncResult> => {
    if (syncLockRef.current) return { synced: 0, failed: 0, pending: getPendingLogs().length };
    syncLockRef.current = true;
    setIsSyncing(true);

    purgeStalePendingLogs(5);
    const queue = getPendingLogs();
    let synced  = 0;
    let failed  = 0;

    for (const log of queue) {
      try {
        const { tempId, retryCount, ...payload } = log;

        const res = await fetch("/api/ModuleSales/Activity/AddLog", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json();
          // Replace the optimistic cached entry with the server-confirmed one
          const cached = getCachedLogs();
          const updated = cached.map((l) =>
            l._id === tempId
              ? { ...l, _id: data.id ?? tempId }
              : l
          );
          setCachedLogs(updated);
          removePendingLog(tempId);
          synced++;
        } else if (res.status === 409) {
          // Duplicate — remove from queue, it's already on server
          removePendingLog(tempId);
          synced++;
        } else {
          incrementPendingLogRetry(tempId);
          failed++;
        }
      } catch {
        incrementPendingLogRetry(log.tempId);
        failed++;
      }
    }

    refreshPendingCount();
    setIsSyncing(false);
    syncLockRef.current = false;

    return { synced, failed, pending: getPendingLogs().length };
  }, [refreshPendingCount]);

  const triggerSync = useCallback(() => {
    if (navigator.onLine) syncPendingLogs();
  }, [syncPendingLogs]);

  // Also try to sync on mount if online
  useEffect(() => {
    if (navigator.onLine) triggerSync();
  }, [triggerSync]);

  // ── Wrapped AddLog (offline-aware) ────────────────────────────────────────

  const addLog = useCallback(async (payload: AddLogPayload): Promise<{ ok: boolean; offline: boolean; error?: string }> => {
    const now = new Date().toISOString();

    if (!navigator.onLine) {
      // Queue it offline
      const pending = addPendingLog({ ...payload, date_created: now });

      // Optimistic UI update — add to cached logs immediately
      const optimistic: CachedActivityLog = {
        _id:             pending.tempId,
        ReferenceID:     payload.ReferenceID,
        Email:           payload.Email,
        Type:            payload.Type,
        Status:          payload.Status,
        Location:        payload.Location   ?? "",
        date_created:    now,
        PhotoURL:        payload.PhotoURL,
        Remarks:         payload.Remarks    ?? "",
        SiteVisitAccount: payload.SiteVisitAccount,
        TSM:             payload.TSM,
      };
      appendOptimisticLog(optimistic);

      // Update login summary cache optimistically
      updateCachedLoginSummaryOptimistic(payload.ReferenceID, payload.Status);

      refreshPendingCount();
      return { ok: true, offline: true };
    }

    // Online — normal POST
    try {
      const res = await fetch("/api/ModuleSales/Activity/AddLog", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        // Update last status cache
        setCachedLastStatus(payload.ReferenceID, {
          Status:       payload.Status,
          date_created: now,
        });
        updateCachedLoginSummaryOptimistic(payload.ReferenceID, payload.Status);
        return { ok: true, offline: false };
      }

      return { ok: false, offline: false, error: data.error ?? "Failed to add log" };
    } catch {
      // Network error mid-online — queue anyway
      const pending = addPendingLog({ ...payload, date_created: now });
      appendOptimisticLog({
        _id: pending.tempId, ReferenceID: payload.ReferenceID,
        Email: payload.Email, Type: payload.Type, Status: payload.Status,
        Location: payload.Location ?? "", date_created: now,
        PhotoURL: payload.PhotoURL, Remarks: payload.Remarks ?? "",
        SiteVisitAccount: payload.SiteVisitAccount, TSM: payload.TSM,
      });
      updateCachedLoginSummaryOptimistic(payload.ReferenceID, payload.Status);
      refreshPendingCount();
      return { ok: true, offline: true };
    }
  }, [refreshPendingCount]);

  // ── Wrapped GET fetches with cache fallback ──────────────────────────────

  const fetchLogs = useCallback(async (params: URLSearchParams): Promise<CachedActivityLog[]> => {
    if (!navigator.onLine) {
      return getCachedLogs();
    }
    try {
      const res  = await fetch(`/api/ModuleSales/Activity/FetchLog?${params.toString()}`);
      if (!res.ok) return getCachedLogs();
      const data = await res.json();
      const logs: CachedActivityLog[] = (data.data ?? []).map((l: any) => ({
        _id:             l._id,
        ReferenceID:     l.ReferenceID,
        Email:           l.Email,
        Type:            l.Type,
        Status:          l.Status,
        Location:        l.Location ?? "",
        date_created:    l.date_created,
        PhotoURL:        l.PhotoURL,
        Remarks:         l.Remarks ?? "",
        SiteVisitAccount: l.SiteVisitAccount,
        TSM:             l.TSM,
      }));
      setCachedLogs(logs);
      return logs;
    } catch {
      return getCachedLogs();
    }
  }, []);

  const fetchLastStatus = useCallback(async (referenceId: string) => {
    if (!navigator.onLine) {
      return getCachedLastStatus(referenceId);
    }
    try {
      const res = await fetch(`/api/ModuleSales/Activity/LastStatus?referenceId=${referenceId}`);
      if (!res.ok) return getCachedLastStatus(referenceId);
      const data = await res.json();
      if (data) setCachedLastStatus(referenceId, data);
      return data;
    } catch {
      return getCachedLastStatus(referenceId);
    }
  }, []);

  const fetchLoginSummary = useCallback(async (referenceId: string) => {
    if (!navigator.onLine) {
      return getCachedLoginSummary(referenceId);
    }
    try {
      const res = await fetch(`/api/ModuleSales/Activity/LoginSummary?referenceId=${referenceId}`);
      if (!res.ok) return getCachedLoginSummary(referenceId);
      const data = await res.json();
      if (data) setCachedLoginSummary(referenceId, data);
      return data;
    } catch {
      return getCachedLoginSummary(referenceId);
    }
  }, []);

  const fetchUsers = useCallback(async (referenceIDs: string[]): Promise<Record<string, any>> => {
    if (!navigator.onLine) {
      return getCachedUsers();
    }
    try {
      const res = await fetch(`/api/users?referenceIDs=${referenceIDs.join(",")}`);
      if (!res.ok) return getCachedUsers();
      const usersData = await res.json();
      const map: Record<string, any> = {};
      usersData.forEach((u: any) => {
        map[u.ReferenceID] = {
          Firstname:      u.Firstname,
          Lastname:       u.Lastname,
          profilePicture: u.profilePicture,
          TSM:            u.TSM,
          Directories:    u.Directories ?? [],
        };
      });
      setCachedUsers(map);
      return map;
    } catch {
      return getCachedUsers();
    }
  }, []);

  return {
    isOnline,
    isSyncing,
    pendingCount,
    addLog,
    fetchLogs,
    fetchLastStatus,
    fetchLoginSummary,
    fetchUsers,
    syncPendingLogs,
    triggerSync,
    clearAllOfflineData,
  };
}