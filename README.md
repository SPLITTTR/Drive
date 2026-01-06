# Drive Clone (Quarkus + Next.js + Clerk) — runnable starter

This repo is a **working starter** for a Google Drive–style clone:

- **Frontend:** Next.js (App Router) + Clerk authentication
- **Backend:** Quarkus REST API + PostgreSQL metadata + MinIO (S3-compatible) object storage
- **Sharing model:** **shared roots only** (you can access descendants through the root share)

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

## Step 2 — Run the backend (Quarkus)

Open a terminal in `backend/`:

```bash
cd backend
./mvnw.cmd quarkus:dev
```
or 
```bash
cd backend
quarkus dev
```

Backend runs at:
- API: `http://localhost:8080`
- Swagger UI: `http://localhost:8080/q/swagger-ui`

## Step 3 — Run the frontend (Next.js)

Open a second terminal in `frontend/`:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`.