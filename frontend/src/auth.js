export const sessionTokenKey = "drb-session-token";

const apiBase = import.meta.env.VITE_API_URL || "";

export function validPin(pin) {
  return /^\d{4,6}$/.test(pin);
}

export function getSessionToken() {
  return localStorage.getItem(sessionTokenKey);
}

function saveSessionToken(token) {
  localStorage.setItem(sessionTokenKey, token);
}

function clearSessionToken() {
  localStorage.removeItem(sessionTokenKey);
}

async function request(path, options = {}, authenticated = false) {
  const token = authenticated ? getSessionToken() : null;
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || `Authentication request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return result;
}

export function loadAuthProfiles() {
  return request("/api/auth/profiles");
}

export function loadManagedProfiles() {
  return request("/api/auth/profiles/manage", {}, true);
}

export async function setupAdmin(details) {
  const result = await request("/api/auth/setup", {
    method: "POST",
    body: JSON.stringify(details),
  });
  saveSessionToken(result.token);
  return result.session;
}

export async function signIn(id, pin) {
  const result = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ id, pin }),
  });
  saveSessionToken(result.token);
  return result.session;
}

export async function restoreSession() {
  if (!getSessionToken()) return null;
  try {
    const result = await request("/api/auth/session", {}, true);
    return result.session;
  } catch (error) {
    if (error.status === 401) clearSessionToken();
    throw error;
  }
}

export async function signOut() {
  try {
    if (getSessionToken()) await request("/api/auth/session", { method: "DELETE" }, true);
  } finally {
    clearSessionToken();
  }
}

export async function saveProfile(id, details) {
  const result = await request(`/api/auth/profiles/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(details),
  }, true);
  return result.profile;
}

export async function createStaff(details) {
  const result = await request("/api/auth/profiles", {
    method: "POST",
    body: JSON.stringify(details),
  }, true);
  return result.profile;
}

export async function deleteStaff(id) {
  await request(`/api/auth/profiles/${encodeURIComponent(id)}`, { method: "DELETE" }, true);
}

export async function updateAdminPin(currentPin, newPin) {
  await request("/api/auth/admin-pin", {
    method: "PUT",
    body: JSON.stringify({ currentPin, newPin }),
  }, true);
}
