# Drive Clone (Quarkus + Next.js + Clerk) — runnable starter

This repo is a **working starter** for a Google Drive–style clone:

- **Frontend:** Next.js (App Router) + Clerk authentication
- **Backend:** Quarkus REST API + PostgreSQL metadata + MinIO (S3-compatible) object storage
- **Sharing model:** **shared roots only** (you can access descendants through the root share)
- **Duplicate names:** allowed (like Google Drive)

## What you need installed (Windows)

1. **Docker Desktop** (you already have it)
2. **Node.js LTS** (includes npm)
3. **Java JDK 21** (Temurin / Oracle)
4. (Optional) **Git** and **VS Code**

## Step 1 — Start PostgreSQL + MinIO (S3)

From the project root:

```bash
docker compose up -d
```

Verify:
- Postgres: `localhost:5432`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001` (user: `minio`, pass: `minio12345`)

A bucket named **drive-bucket** is created automatically.

## Step 2 — Create a Clerk app and env vars

Follow Clerk’s Next.js App Router quickstart (create an app and copy the keys).

### 2.1 Frontend env

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

### 2.2 Backend JWT verification key (Clerk PEM public key)

This starter verifies Clerk session tokens as JWTs using Quarkus SmallRye JWT.
Clerk’s docs explain that session tokens are JWTs verifiable via your instance’s public key, and show `iss` examples like `https://<instance>.clerk.accounts.dev`.

Create a file in the **project root** named:

`clerk_public_key.pem`

Paste the PEM public key in it (including the BEGIN/END lines).

Optional hardening later:
- set `mp.jwt.verify.issuer` (see `backend/src/main/resources/application.properties`).

## Step 3 — Run the backend (Quarkus)

Open a terminal in `backend/`:

```bash
cd backend
./mvnw.cmd quarkus:dev
```

Backend runs at:
- API: `http://localhost:8080`
- Swagger UI: `http://localhost:8080/q/swagger-ui`

## Step 4 — Run the frontend (Next.js)

Open a second terminal in `frontend/`:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`.

Sign in, then you can:
- create folders
- upload files
- navigate folders
- share an item (by Clerk user id)

## API overview

All endpoints are under `/v1` and require a valid Clerk session token (sent as Bearer).
Clerk recommends using `getToken()` and setting `Authorization: Bearer ...` for cross-origin requests.

- `GET /v1/root/children` — list your root items
- `GET /v1/folders/{id}/children` — list folder items
- `POST /v1/folders` — create folder
- `POST /v1/files/upload` — upload file (multipart/form-data)
- `GET /v1/files/{id}/download` — download file
- `POST /v1/items/{id}/share` — share a **root** item with another user
- `GET /v1/shared` — list items shared with you (shared roots)
- `DELETE /v1/items/{id}` — delete (hard delete; folders recurse)

## Design note: why Postgres only (no Mongo)

For a Drive-like model (nested folders + inherited access + consistent authorization checks),
PostgreSQL is the simplest option because you can do recursive queries and keep referential integrity.
MongoDB can work, but “who can access what?” becomes more complex without joins / strong constraints.

---
If you want, tell me what you want next (trash, starred, link sharing, per-folder sharing, etc.) and I’ll extend it.
