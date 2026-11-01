const PIN_ITERATIONS = 120000;

const toHex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
const fromHex = (value) => new Uint8Array(value.match(/.{2}/g).map((part) => Number.parseInt(part, 16)));

export async function makePinRecord(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PIN_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return { salt: toHex(salt), hash: toHex(new Uint8Array(bits)) };
}

export async function verifyPin(pin, record) {
  if (!record?.salt || !record?.hash) return false;
  const salt = fromHex(record.salt);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PIN_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  const hash = toHex(new Uint8Array(bits));
  return hash === record.hash;
}

export function validPin(pin) {
  return /^\d{4,6}$/.test(pin);
}
