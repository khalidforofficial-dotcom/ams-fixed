"use client";

export const QUEUE_KEY = "ams_queue";
export const FAILED_QUEUE_KEY = "ams_failed_queue";
export const QUEUE_EVENT = "ams-queue-change";

export type QueuedWrite = {
  id: string;
  type: string;
  data: Record<string, unknown>;
  offlineId?: string;
  attempts?: number;
  lastError?: string;
};

function read(key: string): QueuedWrite[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(key) || "[]") as QueuedWrite[]; } catch { return []; }
}
function write(key: string, items: QueuedWrite[]) {
  localStorage.setItem(key, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT));
}
export const getPendingWrites = () => read(QUEUE_KEY);
export const getFailedWrites = () => read(FAILED_QUEUE_KEY);

export function enqueueWrite(item: QueuedWrite) {
  const pending = read(QUEUE_KEY).filter((queued) => queued.id !== item.id);
  write(QUEUE_KEY, [...pending, { ...item, attempts: item.attempts || 0 }]);
}

export async function flushQueuedWrites() {
  const pending = read(QUEUE_KEY);
  const remaining: QueuedWrite[] = [];
  const failed = read(FAILED_QUEUE_KEY);
  for (const item of pending) {
    try {
      const response = await fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
    } catch (error) {
      const attempts = (item.attempts || 0) + 1;
      const updated = { ...item, attempts, lastError: error instanceof Error ? error.message : "Sync failed" };
      if (attempts >= 3) failed.push(updated); else remaining.push(updated);
    }
  }
  write(QUEUE_KEY, remaining);
  write(FAILED_QUEUE_KEY, failed);
  return { pending: remaining.length, failed: failed.length };
}

export function retryFailedWrite(id?: string) {
  const failed = read(FAILED_QUEUE_KEY);
  const retry = failed.filter((item) => !id || item.id === id).map((item) => ({ ...item, attempts: 0, lastError: undefined }));
  const keep = failed.filter((item) => id && item.id !== id);
  const pending = read(QUEUE_KEY);
  write(FAILED_QUEUE_KEY, keep);
  write(QUEUE_KEY, [...pending.filter((item) => !retry.some((candidate) => candidate.id === item.id)), ...retry]);
}

export function discardFailedWrite(id?: string) {
  write(FAILED_QUEUE_KEY, id ? read(FAILED_QUEUE_KEY).filter((item) => item.id !== id) : []);
}
