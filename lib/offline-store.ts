/**
 * offline-store.ts
 *
 * JSON-based localStorage store for:
 *  1. Pending activity logs queued while offline
 *  2. Cached API responses (lastStatus, loginSummary, activityLogs)
 *
 * All data is stored under the "acculog_" namespace.
 */

const KEYS = {
  PENDING_LOGS:    "acculog_pending_logs",
  CACHED_LOGS:     "acculog_cached_logs",
  CACHED_USERS:    "acculog_cached_users",
  LAST_STATUS:     "acculog_last_status",
  LOGIN_SUMMARY:   "acculog_login_summary",
  CACHED_USER:     "acculog_user_details",
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PendingLog {
  /** Client-generated temp ID (uuid-like) */
  tempId:          string;
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
  /** ISO string — set at capture time on device */
  date_created:    string;
  /** How many sync attempts have failed */
  retryCount:      number;
}

export interface CachedActivityLog {
  _id:             string;
  ReferenceID:     string;
  Email:           string;
  Type:            string;
  Status:          string;
  Location:        string;
  date_created:    string;
  PhotoURL?:       string;
  Remarks:         string;
  SiteVisitAccount?: string;
  TSM?:            string;
}

export interface CachedUserInfo {
  Firstname:       string;
  Lastname:        string;
  profilePicture?: string;
  TSM:             string;
  Directories:     string[];
}

export interface LastStatusCache {
  Status:       string | null;
  date_created: string | null;
  cachedAt:     string;
}

export interface LoginSummaryCache {
  lastStatus:   string | null;
  lastTime:     string | null;
  loginCount:   number;
  cachedAt:     string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("localStorage write failed:", e);
  }
}

function remove(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key);
}

// ── Pending log queue ─────────────────────────────────────────────────────────

export function getPendingLogs(): PendingLog[] {
  return read<PendingLog[]>(KEYS.PENDING_LOGS, []);
}

export function addPendingLog(log: Omit<PendingLog, "tempId" | "retryCount">): PendingLog {
  const entry: PendingLog = {
    ...log,
    tempId:     `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    retryCount: 0,
  };
  const existing = getPendingLogs();
  write(KEYS.PENDING_LOGS, [...existing, entry]);
  return entry;
}

export function removePendingLog(tempId: string): void {
  const updated = getPendingLogs().filter((l) => l.tempId !== tempId);
  write(KEYS.PENDING_LOGS, updated);
}

export function incrementPendingLogRetry(tempId: string): void {
  const updated = getPendingLogs().map((l) =>
    l.tempId === tempId ? { ...l, retryCount: l.retryCount + 1 } : l
  );
  write(KEYS.PENDING_LOGS, updated);
}

/** Remove logs that have failed too many times (default max 5) */
export function purgeStalePendingLogs(maxRetries = 5): void {
  const updated = getPendingLogs().filter((l) => l.retryCount < maxRetries);
  write(KEYS.PENDING_LOGS, updated);
}

export function hasPendingLogs(): boolean {
  return getPendingLogs().length > 0;
}

// ── Cached activity logs ───────────────────────────────────────────────────────

export function getCachedLogs(): CachedActivityLog[] {
  return read<CachedActivityLog[]>(KEYS.CACHED_LOGS, []);
}

export function setCachedLogs(logs: CachedActivityLog[]): void {
  write(KEYS.CACHED_LOGS, logs);
}

/** Append a freshly captured offline log to the cached list so the UI shows it immediately */
export function appendOptimisticLog(log: CachedActivityLog): void {
  const existing = getCachedLogs();
  // Avoid duplicates
  const deduped = existing.filter((l) => l._id !== log._id);
  write(KEYS.CACHED_LOGS, [log, ...deduped]);
}

// ── Cached users map ──────────────────────────────────────────────────────────

export function getCachedUsers(): Record<string, CachedUserInfo> {
  return read<Record<string, CachedUserInfo>>(KEYS.CACHED_USERS, {});
}

export function setCachedUsers(map: Record<string, CachedUserInfo>): void {
  write(KEYS.CACHED_USERS, map);
}

// ── Last status ───────────────────────────────────────────────────────────────

export function getCachedLastStatus(referenceId: string): LastStatusCache | null {
  const all = read<Record<string, LastStatusCache>>(KEYS.LAST_STATUS, {});
  return all[referenceId] ?? null;
}

export function setCachedLastStatus(referenceId: string, data: Omit<LastStatusCache, "cachedAt">): void {
  const all = read<Record<string, LastStatusCache>>(KEYS.LAST_STATUS, {});
  all[referenceId] = { ...data, cachedAt: new Date().toISOString() };
  write(KEYS.LAST_STATUS, all);
}

// ── Login summary ─────────────────────────────────────────────────────────────

export function getCachedLoginSummary(referenceId: string): LoginSummaryCache | null {
  const all = read<Record<string, LoginSummaryCache>>(KEYS.LOGIN_SUMMARY, {});
  return all[referenceId] ?? null;
}

export function setCachedLoginSummary(referenceId: string, data: Omit<LoginSummaryCache, "cachedAt">): void {
  const all = read<Record<string, LoginSummaryCache>>(KEYS.LOGIN_SUMMARY, {});
  all[referenceId] = { ...data, cachedAt: new Date().toISOString() };
  write(KEYS.LOGIN_SUMMARY, all);
}

/** Update cached login summary optimistically after a successful offline capture */
export function updateCachedLoginSummaryOptimistic(referenceId: string, newStatus: string): void {
  const existing = getCachedLoginSummary(referenceId);
  const updated: LoginSummaryCache = {
    lastStatus:  newStatus,
    lastTime:    new Date().toISOString(),
    loginCount:  (existing?.loginCount ?? 0) + (newStatus === "Login" ? 1 : 0),
    cachedAt:    new Date().toISOString(),
  };
  const all = read<Record<string, LoginSummaryCache>>(KEYS.LOGIN_SUMMARY, {});
  all[referenceId] = updated;
  write(KEYS.LOGIN_SUMMARY, all);
}

// ── Cached user details (for profile/header) ──────────────────────────────────

export function getCachedUserDetails(): Record<string, unknown> | null {
  return read<Record<string, unknown> | null>(KEYS.CACHED_USER, null);
}

export function setCachedUserDetails(data: Record<string, unknown>): void {
  write(KEYS.CACHED_USER, data);
}

// ── Clear everything (logout) ─────────────────────────────────────────────────

export function clearAllOfflineData(): void {
  Object.values(KEYS).forEach(remove);
}