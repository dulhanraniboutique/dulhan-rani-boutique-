import { getSessionToken } from "./auth.js";

const collections = new Set(["articles", "bookings", "customers", "payments", "sales", "settings"]);
const pendingStorageKey = "drb-sync-pending";
const queues = new Map();
const apiBase = import.meta.env.VITE_API_URL || "";

function reportStatus(status, error = "") {
  window.dispatchEvent(new CustomEvent("drb-sync-status", {
    detail: { status, error },
  }));
}

async function request(path, options) {
  const token = getSessionToken();
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `API request failed (${response.status}).`);
  }
  return response.json();
}

function pendingChanges() {
  return JSON.parse(localStorage.getItem(pendingStorageKey) || "{}");
}

function savePendingChanges(pending) {
  localStorage.setItem(pendingStorageKey, JSON.stringify(pending));
}

function queueChanges(collection, changes) {
  const pending = pendingChanges();
  const current = pending[collection] || { upserts: {}, deletes: [] };
  const deletes = new Set(current.deletes);
  const upserts = { ...current.upserts };

  for (const id of changes.deletes) {
    deletes.add(id);
    delete upserts[id];
  }
  for (const item of changes.upserts) {
    deletes.delete(item.id);
    upserts[item.id] = item;
  }

  pending[collection] = {
    upserts,
    deletes: [...deletes],
  };
  savePendingChanges(pending);
}

function enqueue(collection, operation) {
  const previous = queues.get(collection) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  queues.set(collection, current);
  current.finally(() => {
    if (queues.get(collection) === current) queues.delete(collection);
  }).catch(() => {});
  return current;
}

async function sendChanges(collection, changes) {
  if (!changes.upserts.length && !changes.deletes.length) return;
  await request(`/api/data/${collection}/sync`, {
    method: "PUT",
    body: JSON.stringify(changes),
  });
}

async function flushPending(collection) {
  const pending = pendingChanges();
  const current = pending[collection];
  if (!current) return;

  const changes = {
    upserts: Object.values(current.upserts),
    deletes: current.deletes,
  };
  await sendChanges(collection, changes);

  delete pending[collection];
  savePendingChanges(pending);
}

export function itemChanges(previousItems, nextItems) {
  const previous = new Map(previousItems.map((item) => [item.id, item]));
  const next = new Map(nextItems.map((item) => [item.id, item]));
  return {
    upserts: nextItems.filter((item) => JSON.stringify(previous.get(item.id)) !== JSON.stringify(item)),
    deletes: [...previous.keys()].filter((id) => !next.has(id)),
  };
}

export function mergeChanges(items, changes) {
  const merged = new Map(items.map((item) => [item.id, item]));
  for (const id of changes.deletes) merged.delete(id);
  for (const item of changes.upserts) merged.set(item.id, item);
  return [...merged.values()];
}

export function loadCollection(collection) {
  if (!collections.has(collection)) throw new Error(`Unknown collection: ${collection}`);

  return enqueue(collection, async () => {
    reportStatus("syncing");
    await flushPending(collection);
    const result = await request(`/api/data/${collection}`);
    if (!Array.isArray(result.items)) throw new Error(`Invalid ${collection} response from the API.`);

    if (result.items.length === 0) {
      reportStatus("synced");
      return [];
    }

    reportStatus("synced");
    return result.items;
  }).catch((error) => {
    reportStatus("offline", error.message);
    throw error;
  });
}

export function persistCollectionChanges(collection, previousItems, nextItems) {
  if (!collections.has(collection)) throw new Error(`Unknown collection: ${collection}`);
  const changes = itemChanges(previousItems, nextItems);
  if (!changes.upserts.length && !changes.deletes.length) return Promise.resolve();

  return enqueue(collection, async () => {
    reportStatus("syncing");
    try {
      await flushPending(collection);
      await sendChanges(collection, changes);
      reportStatus("synced");
    } catch (error) {
      queueChanges(collection, changes);
      reportStatus("offline", error.message);
      throw error;
    }
  });
}

export function refreshCollection(collection) {
  if (!collections.has(collection)) throw new Error(`Unknown collection: ${collection}`);
  return enqueue(collection, async () => {
    reportStatus("syncing");
    await flushPending(collection);
    const result = await request(`/api/data/${collection}`);
    if (!Array.isArray(result.items)) throw new Error(`Invalid ${collection} response from the API.`);
    if (result.items.length === 0) {
      reportStatus("synced");
      return [];
    }
    reportStatus("synced");
    return result.items;
  }).catch((error) => {
    reportStatus("offline", error.message);
    throw error;
  });
}

export async function loadApprovalRequests() {
  const result = await request("/api/approval-requests");
  if (!Array.isArray(result.items)) throw new Error("Invalid approval request response from the API.");
  return result.items;
}

export function createApprovalRequest(requestDetails) {
  return request("/api/approval-requests", {
    method: "POST",
    body: JSON.stringify(requestDetails),
  });
}

export function reviewApprovalRequest(id, decision) {
  return request(`/api/approval-requests/${encodeURIComponent(id)}/review`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}
