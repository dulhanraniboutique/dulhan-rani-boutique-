import "dotenv/config";
import cors from "cors";
import express from "express";
import { MongoClient } from "mongodb";
import { pathToFileURL } from "node:url";

const app = express();
const port = Number(process.env.PORT) || 4000;
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
const resources = new Set(["articles", "bookings", "customers", "payments"]);
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

app.use(cors({ origin: frontendUrl }));
app.use(express.json({ limit: "25mb" }));

app.get("/api/health", async (_request, response, next) => {
  try {
    await (await connectToDatabase()).db(process.env.MONGODB_DB).command({ ping: 1 });
    response.json({ status: "ok", database: "connected" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/data/:resource", async (request, response, next) => {
  try {
    if (!resources.has(request.params.resource)) {
      response.status(404).json({ error: "Unknown data collection." });
      return;
    }

    const items = await (await connectToDatabase())
      .db(process.env.MONGODB_DB)
      .collection(request.params.resource)
      .find({})
      .toArray();
    response.json({
      items: items.map(({ _id, ...item }) => ({ ...item, id: String(_id) })),
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/data/:resource/sync", async (request, response, next) => {
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
