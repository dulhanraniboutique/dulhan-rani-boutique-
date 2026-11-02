import "dotenv/config";
import { MongoClient } from "mongodb";

const collectionNames = [
  "articles",
  "bookings",
  "customers",
  "payments",
  "settings",
  "accounts",
  "sessions",
];
const databaseName = process.env.MONGODB_DB;

if (!process.env.MONGODB_URI || !databaseName) {
  throw new Error("MONGODB_URI and MONGODB_DB must be configured.");
}
if (process.env.CONFIRM_WORKSPACE_RESET !== databaseName) {
  throw new Error(`Set CONFIRM_WORKSPACE_RESET to exactly "${databaseName}" to delete all workspace data.`);
}

const client = new MongoClient(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
});

try {
  await client.connect();
  const database = client.db(databaseName);
  for (const name of collectionNames) {
    const result = await database.collection(name).deleteMany({});
    console.log(`Cleared ${name}: ${result.deletedCount} record(s).`);
  }
} finally {
  await client.close();
}
