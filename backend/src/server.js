import "dotenv/config";
import cors from "cors";
import express from "express";
import { createHash, pbkdf2 as derivePinHash, randomBytes, timingSafeEqual } from "node:crypto";
import { MongoClient } from "mongodb";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const app = express();
const port = Number(process.env.PORT) || 4000;
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
const resources = new Set(["articles", "bookings", "customers", "payments", "sales", "settings"]);
const pbkdf2 = promisify(derivePinHash);
const pinIterations = 120000;
let client;

function getClient() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required to connect to the database.");
  }
  if (!client) {
    client = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });
  }
  return client;
}

async function connectToDatabase() {
  const mongoClient = getClient();
  await mongoClient.connect();
  return mongoClient;
}

async function getDatabase() {
  if (!process.env.MONGODB_DB) throw new Error("MONGODB_DB is required.");
  return (await connectToDatabase()).db(process.env.MONGODB_DB);
}

async function checkDatabaseConnection() {
  await (await connectToDatabase()).db(process.env.MONGODB_DB).command({ ping: 1 });
}

function getDatabaseErrorMessage(error) {
  const message = error instanceof Error ? error.message : "Unknown database connection error.";
  return message
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, "[MongoDB connection URI]")
    .slice(0, 500);
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function publicProfile(account) {
  return {
    id: String(account._id),
    role: account.role,
    name: account.name,
    email: account.email || "",
    phone: account.phone || "",
    title: account.title || "",
    active: account.active !== false,
    createdAt: account.createdAt || null,
  };
}

function loginProfile(account) {
  return {
    id: String(account._id),
    role: account.role,
    name: account.name,
    title: account.title || "",
    active: account.active !== false,
  };
}

async function createSession(account) {
  const token = randomBytes(32).toString("base64url");
  const db = await getDatabase();
  await db.collection("sessions").insertOne({
    _id: hashToken(token),
    accountId: account._id,
    createdAt: new Date(),
  });
  return { token, session: publicProfile(account) };
}

async function requireAuth(request, response, next) {
  try {
    const token = request.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) {
      response.status(401).json({ error: "Sign in to continue." });
      return;
    }

    const db = await getDatabase();
    const session = await db.collection("sessions").findOne({ _id: hashToken(token) });
    const account = session && await db.collection("accounts").findOne({ _id: session.accountId });
    if (!account || account.active === false) {
      response.status(401).json({ error: "Your session has ended. Please sign in again." });
      return;
    }
    request.account = account;
    request.sessionTokenHash = hashToken(token);
    next();
  } catch (error) {
    next(error);
  }
}

function requireAdmin(request, response, next) {
  if (request.account.role !== "admin") {
    response.status(403).json({ error: "Administrator access is required." });
    return;
  }
  next();
}

function requireResourceAccess(request, response, next) {
  if (request.params.resource === "settings" && request.account.role !== "admin") {
    response.status(403).json({ error: "Administrator access is required for workspace settings." });
    return;
  }
  next();
}

async function checkSalesWriteAccess(resource, account, collection, upserts, deletes) {
  if (account.role !== "sales") return null;
  if (deletes.length) return "Salesperson profiles cannot delete shared records.";

  if (resource === "bookings") {
    const existing = await collection.find({ _id: { $in: upserts.map((item) => item.id) } }).toArray();
    const existingById = new Map(existing.map((item) => [String(item._id), item]));
    const mutableFields = new Set(["paid", "status", "pickedUpAt", "actualReturn", "prepReadyArticleIds"]);
    for (const item of upserts) {
      const previous = existingById.get(item.id);
      if (!previous) {
        if (item.createdById !== account._id) return "You can only create bookings under your own profile.";
        if (!Number.isFinite(Number(item.amount)) || !Number.isFinite(Number(item.paid))
          || Number(item.amount) <= 0 || Number(item.paid) < 0 || Number(item.paid) > Number(item.amount)) {
          return "The booking amount or advance payment is invalid.";
        }
        continue;
      }
      if (previous.createdById !== account._id) return "You can only update bookings created by your profile.";
      const paid = Number(item.paid);
      const amount = Number(item.amount);
      const previousPaid = Number(previous.paid);
      if (!Number.isFinite(paid) || !Number.isFinite(amount) || !Number.isFinite(previousPaid)) {
        return "The booking amount or payment is invalid.";
      }
      const previousFields = { ...previous };
      delete previousFields._id;
      const keys = new Set([...Object.keys(previousFields), ...Object.keys(item)]);
      for (const key of keys) {
        if (mutableFields.has(key)) continue;
        if (JSON.stringify(previousFields[key]) !== JSON.stringify(item[key])) {
          return "Only booking payment and delivery status can be updated by a salesperson.";
        }
      }
      if (paid < previousPaid || paid > amount) {
        return "Booking payments must remain between the current paid amount and the rental total.";
      }
      if (item.status !== previous.status
        && !((previous.status === "Confirmed" && item.status === "Out")
          || (previous.status === "Out" && item.status === "Returned"))) {
        return "Only confirmed bookings can be picked up and active rentals can be returned.";
      }
    }
  }

  if (resource === "payments") {
    const existing = await collection.find({ _id: { $in: upserts.map((item) => item.id) } }).toArray();
    if (existing.length) return "Payment records cannot be changed after they are recorded.";
    if (upserts.some((item) => item.receivedById !== account._id)) {
      return "You can only record payments under your own profile.";
    }
    if (upserts.some((item) => !Number.isFinite(Number(item.amount)) || Number(item.amount) <= 0)) {
      return "Payment amounts must be greater than zero.";
    }
  }
  if (resource === "sales") {
    const existing = await collection.find({ _id: { $in: upserts.map((item) => item.id) } }).toArray();
    if (existing.length || deletes.length) return "Recorded sales cannot be changed after they are saved.";
    if (upserts.some((item) => item.createdById !== account._id)) {
      return "You can only record sales under your own profile.";
    }
    if (upserts.some((item) => !Number.isFinite(Number(item.amount))
      || !Number.isFinite(Number(item.paid))
      || Number(item.amount) <= 0
      || Number(item.paid) < 0
      || Number(item.paid) > Number(item.amount))) {
      return "Sale totals and received amounts are invalid.";
    }
    if (upserts.some((item) => typeof item.customer !== "string" || !item.customer.trim()
      || typeof item.itemDescription !== "string" || !item.itemDescription.trim()
      || typeof item.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.date))) {
      return "Sale customer, item details, or date are invalid.";
    }
  }
  return null;
}

async function makePinRecord(pin) {
  const salt = randomBytes(16);
  const hash = await pbkdf2(pin, salt, pinIterations, 32, "sha256");
  return { pinSalt: salt.toString("hex"), pinHash: hash.toString("hex") };
}

async function verifyPin(pin, account) {
  const salt = Buffer.from(account.pinSalt, "hex");
  const expected = Buffer.from(account.pinHash, "hex");
  const actual = await pbkdf2(pin, salt, pinIterations, expected.length, "sha256");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function validPin(pin) {
  return typeof pin === "string" && /^\d{4,6}$/.test(pin);
}

app.use(cors({ origin: frontendUrl }));
app.use(express.json({ limit: "25mb" }));

app.get("/", async (_request, response) => {
  try {
    await checkDatabaseConnection();
    response.type("text/plain").send("MongoDB connected");
  } catch (error) {
    const reason = getDatabaseErrorMessage(error);
    console.error("Database health check failed:", reason);
    response.status(503).type("text/plain").send(`MongoDB disconnected: ${reason}`);
  }
});

app.get("/api/health", async (_request, response) => {
  try {
    await checkDatabaseConnection();
    response.json({ status: "ok", database: "connected" });
  } catch (error) {
    const reason = getDatabaseErrorMessage(error);
    console.error("Database health check failed:", reason);
    response.status(503).json({ status: "error", database: "disconnected", error: reason });
  }
});

app.get("/api/auth/profiles", async (_request, response, next) => {
  try {
    const accounts = await (await getDatabase()).collection("accounts")
      .find({ role: { $in: ["admin", "sales"] }, active: { $ne: false } })
      .project({ pinSalt: 0, pinHash: 0, failedAttempts: 0, lockedUntil: 0 })
      .toArray();
    const admin = accounts.find((account) => account.role === "admin");
    response.json({
      adminConfigured: Boolean(admin),
      admin: admin ? loginProfile(admin) : null,
      salespeople: accounts.filter((account) => account.role === "sales").map(loginProfile),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/profiles/manage", requireAuth, requireAdmin, async (_request, response, next) => {
  try {
    const accounts = await (await getDatabase()).collection("accounts")
      .find({ role: { $in: ["admin", "sales"] } })
      .project({ pinSalt: 0, pinHash: 0, failedAttempts: 0, lockedUntil: 0 })
      .toArray();
    response.json({
      admin: publicProfile(accounts.find((account) => account.role === "admin")),
      salespeople: accounts.filter((account) => account.role === "sales").map(publicProfile),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/setup", async (request, response, next) => {
  try {
    const setupToken = process.env.INITIAL_ADMIN_SETUP_TOKEN;
    if (!setupToken || !safeEqual(request.body?.setupToken, setupToken)) {
      response.status(403).json({ error: "The initial administrator setup token is missing or incorrect." });
      return;
    }
    const { name, pin } = request.body || {};
    if (typeof name !== "string" || !name.trim() || name.trim().length > 60 || !validPin(pin)) {
      response.status(400).json({ error: "Enter an administrator name and a 4 to 6 digit PIN." });
      return;
    }

    const db = await getDatabase();
    const account = {
      _id: "admin",
      role: "admin",
      name: name.trim(),
      email: "",
      phone: "",
      active: true,
      createdAt: new Date(),
      ...(await makePinRecord(pin)),
    };
    try {
      await db.collection("accounts").insertOne(account);
    } catch (error) {
      if (error.code === 11000) {
        response.status(409).json({ error: "An administrator profile already exists." });
        return;
      }
      throw error;
    }
    response.status(201).json(await createSession(account));
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (request, response, next) => {
  try {
    const { id, pin } = request.body || {};
    if (typeof id !== "string" || !validPin(pin)) {
      response.status(400).json({ error: "Enter a profile and a 4 to 6 digit PIN." });
      return;
    }

    const db = await getDatabase();
    const accounts = db.collection("accounts");
    const account = await accounts.findOne({ _id: id });
    const now = new Date();
    if (!account || account.active === false
      || (account.lockedUntil && account.lockedUntil > now)) {
      response.status(401).json({ error: "Profile or PIN is incorrect, or the profile is temporarily locked." });
      return;
    }

    if (!await verifyPin(pin, account)) {
      const failedAttempts = (account.failedAttempts || 0) + 1;
      await accounts.updateOne(
        { _id: account._id },
        { $set: { failedAttempts, ...(failedAttempts >= 5 ? { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) } : {}) } },
      );
      response.status(401).json({ error: "Profile or PIN is incorrect, or the profile is temporarily locked." });
      return;
    }

    await accounts.updateOne({ _id: account._id }, { $unset: { failedAttempts: "", lockedUntil: "" } });
    response.json(await createSession(account));
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/session", requireAuth, (request, response) => {
  response.json({ session: publicProfile(request.account) });
});

app.delete("/api/auth/session", requireAuth, async (request, response, next) => {
  try {
    await (await getDatabase()).collection("sessions").deleteOne({ _id: request.sessionTokenHash });
    response.json({ status: "ok" });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/profiles", requireAuth, requireAdmin, async (request, response, next) => {
  try {
    const { name, email = "", phone = "", title = "Salesperson", pin } = request.body || {};
    if (typeof name !== "string" || !name.trim() || name.trim().length > 60
      || typeof email !== "string" || typeof phone !== "string" || typeof title !== "string"
      || !validPin(pin)) {
      response.status(400).json({ error: "Enter a name and a 4 to 6 digit PIN." });
      return;
    }

    const db = await getDatabase();
    const accounts = db.collection("accounts");
    if (await accounts.countDocuments({ role: "sales", active: { $ne: false } }) >= 6) {
      response.status(409).json({ error: "A maximum of six active salesperson profiles is allowed." });
      return;
    }
    const account = {
      _id: `sales-${randomBytes(16).toString("hex")}`,
      role: "sales",
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      title: title.trim() || "Salesperson",
      active: true,
      createdAt: new Date(),
      ...(await makePinRecord(pin)),
    };
    await accounts.insertOne(account);
    response.status(201).json({ profile: publicProfile(account) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/auth/profiles/:id", requireAuth, async (request, response, next) => {
  try {
    const { id } = request.params;
    const isAdmin = request.account.role === "admin";
    if (!isAdmin && id !== request.account._id) {
      response.status(403).json({ error: "You can only update your own profile." });
      return;
    }

    const { name, email, phone, title, active, pin } = request.body || {};
    if ((name !== undefined && (typeof name !== "string" || !name.trim() || name.trim().length > 60))
      || (email !== undefined && typeof email !== "string")
      || (phone !== undefined && typeof phone !== "string")
      || (title !== undefined && typeof title !== "string")
      || (active !== undefined && (!isAdmin || typeof active !== "boolean"))
      || (pin !== undefined && (!isAdmin || id === "admin" || !validPin(pin)))
      || (id === "admin" && active !== undefined)) {
      response.status(400).json({ error: "The profile details are invalid." });
      return;
    }

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (email !== undefined) updates.email = email.trim();
    if (phone !== undefined) updates.phone = phone.trim();
    if (title !== undefined) updates.title = title.trim();
    if (active !== undefined) updates.active = active;
    if (pin !== undefined) Object.assign(updates, await makePinRecord(pin));
    const db = await getDatabase();
    const accounts = db.collection("accounts");
    const result = await accounts.updateOne(
      { _id: id, ...(isAdmin ? {} : { role: request.account.role }) },
      { $set: updates },
    );
    if (!result.matchedCount) {
      response.status(404).json({ error: "Profile not found." });
      return;
    }
    if (active === false) await db.collection("sessions").deleteMany({ accountId: id });
    const updatedAccount = await accounts.findOne(
      { _id: id },
      { projection: { pinSalt: 0, pinHash: 0, failedAttempts: 0, lockedUntil: 0 } },
    );
    response.json({ profile: publicProfile(updatedAccount) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/auth/profiles/:id", requireAuth, requireAdmin, async (request, response, next) => {
  try {
    if (request.params.id === "admin") {
      response.status(400).json({ error: "The administrator profile cannot be removed." });
      return;
    }
    const db = await getDatabase();
    await db.collection("accounts").deleteOne({ _id: request.params.id, role: "sales" });
    await db.collection("sessions").deleteMany({ accountId: request.params.id });
    response.json({ status: "ok" });
  } catch (error) {
    next(error);
  }
});

app.put("/api/auth/admin-pin", requireAuth, requireAdmin, async (request, response, next) => {
  try {
    const { currentPin, newPin } = request.body || {};
    if (!validPin(currentPin) || !validPin(newPin)) {
      response.status(400).json({ error: "Both PINs must contain 4 to 6 digits." });
      return;
    }
    const db = await getDatabase();
    const account = await db.collection("accounts").findOne({ _id: "admin", role: "admin" });
    if (!account || !await verifyPin(currentPin, account)) {
      response.status(401).json({ error: "Current administrator PIN is incorrect." });
      return;
    }
    await db.collection("accounts").updateOne({ _id: "admin" }, { $set: await makePinRecord(newPin) });
    response.json({ status: "ok" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/data/:resource", requireAuth, requireResourceAccess, async (request, response, next) => {
  try {
    if (!resources.has(request.params.resource)) {
      response.status(404).json({ error: "Unknown data collection." });
      return;
    }

    let query = {};
    if (request.account.role === "sales") {
      if (request.params.resource === "bookings" || request.params.resource === "sales") {
        query = { createdById: request.account._id };
      } else if (request.params.resource === "payments") {
        query = { receivedById: request.account._id };
      }
    }
    const items = await (await connectToDatabase())
      .db(process.env.MONGODB_DB)
      .collection(request.params.resource)
      .find(query)
      .toArray();
    response.json({
      items: items.map(({ _id, ...item }) => ({ ...item, id: String(_id) })),
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/data/:resource/sync", requireAuth, requireResourceAccess, async (request, response, next) => {
  try {
    if (!resources.has(request.params.resource)) {
      response.status(404).json({ error: "Unknown data collection." });
      return;
    }

    const { upserts, deletes } = request.body || {};
    if (!Array.isArray(upserts) || !Array.isArray(deletes)) {
      response.status(400).json({ error: "Expected upserts and deletes arrays." });
      return;
    }

    if (upserts.length > 1000 || deletes.length > 1000) {
      response.status(413).json({ error: "A sync request can contain at most 1000 changes." });
      return;
    }

    if (upserts.some((item) => !item || typeof item.id !== "string" || !item.id.trim())
      || deletes.some((id) => typeof id !== "string" || !id.trim())) {
      response.status(400).json({ error: "Every record must have a non-empty string id." });
      return;
    }

    const collection = (await connectToDatabase())
      .db(process.env.MONGODB_DB)
      .collection(request.params.resource);
    const accessError = await checkSalesWriteAccess(
      request.params.resource,
      request.account,
      collection,
      upserts,
      deletes,
    );
    if (accessError) {
      response.status(403).json({ error: accessError });
      return;
    }
    const operations = [
      ...upserts.map(({ id, ...item }) => ({
        replaceOne: {
          filter: { _id: id },
          replacement: { ...item, id },
          upsert: true,
        },
      })),
      ...(deletes.length ? [{
        deleteMany: {
          filter: { _id: { $in: deletes } },
        },
      }] : []),
    ];

    if (operations.length) await collection.bulkWrite(operations, { ordered: false });
    response.json({ status: "ok", saved: upserts.length, deleted: deletes.length });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error("API request failed:", error);
  response.status(500).json({ error: "The request could not be saved to the database." });
});

async function start() {
  await connectToDatabase();
  app.listen(port, () => {
    console.log(`DRB API listening on http://localhost:${port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().catch(async (error) => {
    console.error("Could not start the DRB API:", error.message);
    await client?.close().catch(() => {});
    process.exitCode = 1;
  });
}

export default app;
