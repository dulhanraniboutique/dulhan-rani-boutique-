# Dulhan Rani Boutique — Rental Management

The project is split into two independently runnable applications:

- `frontend/` — React user interface served by Vite.
- `backend/` — Node.js/Express REST API.

## Requirements

- Node.js 18 or newer
- npm

## Run the frontend

From the project root:

```powershell
cd frontend
npm install
npm run dev
```

The app keeps articles, bookings, customers, and payments in browser storage and
synchronizes them with the API. It uses cached records while offline and retries
pending changes when connectivity returns. Profile PINs remain local to each
browser and are not part of the shared MongoDB data.

## Run the API with MongoDB

Create a MongoDB Atlas database user and copy the cluster connection URI. In a
second terminal:

```powershell
cd backend
npm install
Copy-Item .env.example .env
```

Set `MONGODB_URI` in `backend/.env` to the Atlas connection URI, set
`MONGODB_DB` to the database name, and then start the API:

```powershell
npm run dev
```

The API stores each business record in its own MongoDB collection. Its health
status is available at `http://localhost:4000/` (shows `MongoDB connected` when
the database responds, or a sanitized error reason if it does not) and as JSON
from `GET http://localhost:4000/api/health`.
Browser requests under `/api` are proxied to the local API by Vite. For a
hosted frontend, set `VITE_API_URL` to the API base URL and configure the
backend's `FRONTEND_URL` to the frontend origin.

Existing browser records are uploaded when their MongoDB collection is empty.
After a collection has records, MongoDB is the shared source of truth; each
browser keeps a local cache and queues edits made while the API is unavailable.

**Security before internet deployment:** administrator and salesperson PIN
checks are still browser-only, and the API does not yet authenticate users.
Do not expose this API publicly until server-side authentication and
authorization are implemented. CORS is not an access-control mechanism.

## Deploy frontend and backend to Vercel

The frontend and API are separate Vercel projects connected to the same GitHub
repository:

1. Import the repository in Vercel and set the frontend project's **Root
   Directory** to `frontend`. Its build command is `npm run build`, and its
   output directory is `dist`.
2. Create another Vercel project from the same repository and set its **Root
   Directory** to `backend`. Vercel detects the Express app in
   `src/server.js`.
3. In the backend project's Vercel environment variables, set `MONGODB_URI`,
   `MONGODB_DB`, and `FRONTEND_URL` (the exact deployed frontend origin, without
   a trailing slash). Set them for Production and Preview as appropriate.
4. In the frontend project's environment variables, set `VITE_API_URL` to the
   backend deployment origin, without a trailing slash, then redeploy.
5. Add the deployed API host to the MongoDB Atlas Network Access allowlist.
   For production, use a restricted network path where available rather than
   leaving database access open to all IP addresses.

The frontend's local Vite proxy is only for local development; deployed builds
use `VITE_API_URL`. Confirm the API at `/api/health` reports a connected
database before testing cross-device synchronization.

**Do not deploy the current API publicly yet.** The app's PIN checks are
browser-only and API routes currently have no authentication or authorization,
so anyone who can reach the API could read, add, change, or delete business
records. Add server-side authentication and access controls before exposing it.
