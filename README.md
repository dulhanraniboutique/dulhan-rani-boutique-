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

The app synchronizes business records and workspace settings with the API. It
keeps a local cache while offline and retries pending changes when connectivity
returns. Staff profiles and hashed PINs are stored in MongoDB; the long-lived
session token stays in the current browser until sign-out.

## Run the API with MongoDB

Create a MongoDB Atlas database user and copy the cluster connection URI. In a
second terminal:

```powershell
cd backend
npm install
Copy-Item .env.example .env
```

Set `MONGODB_URI` in `backend/.env` to the Atlas connection URI, set
`MONGODB_DB` to the database name, and set `INITIAL_ADMIN_SETUP_TOKEN` to a
long random secret. The token is required once when creating the first
administrator. Then start the API:

```powershell
npm run dev
```

The API stores business records, workspace settings, staff profiles, and
sessions in MongoDB. PINs are hashed by the backend, and API data routes require
a signed-in session. Its health
status is available at `http://localhost:4000/` (shows `MongoDB connected` when
the database responds, or a sanitized error reason if it does not) and as JSON
from `GET http://localhost:4000/api/health`.
Browser requests under `/api` are proxied to the local API by Vite. For a
hosted frontend, set `VITE_API_URL` to the API base URL and configure the
backend's `FRONTEND_URL` to the frontend origin.

The first administrator setup and every later sign-in require a PIN. Sessions
remain active across reloads until the user signs out. Each browser keeps a
local cache and queues business-data changes while offline.

To clear all existing demo and workspace records before starting fresh, first
update `MONGODB_URI` with a newly rotated database password, then run this once
from `backend/` with the exact database name from `MONGODB_DB`:

```powershell
$env:CONFIRM_WORKSPACE_RESET = "your-database-name"
npm run reset:workspace
Remove-Item Env:\CONFIRM_WORKSPACE_RESET
```

This deletes all business records, settings, administrator/staff accounts, and
sessions in that database. The frontend clears its old `drb-*` browser cache
once after its next deployment. After the reset, create the administrator
again using `INITIAL_ADMIN_SETUP_TOKEN`.

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
   `MONGODB_DB`, `FRONTEND_URL` (the exact deployed frontend origin, without
   a trailing slash), and a strong `INITIAL_ADMIN_SETUP_TOKEN`. Set them for
   Production and Preview as appropriate.
4. In the frontend project's environment variables, set `VITE_API_URL` to the
   backend deployment origin, without a trailing slash, then redeploy.
5. Add the deployed API host to the MongoDB Atlas Network Access allowlist.
   For production, use a restricted network path where available rather than
   leaving database access open to all IP addresses.

The frontend's local Vite proxy is only for local development; deployed builds
use `VITE_API_URL`. Confirm the API at `/api/health` reports a connected
database, run the workspace reset if starting fresh, and create the first
administrator before using the workspace.
