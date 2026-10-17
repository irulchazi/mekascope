# MekaScope

A human-reviewed bicycle diagnosis workflow powered by FastAPI, PostgreSQL, and Gemini. Users supply a photo and symptoms, review possible causes, perform guided checks, and approve an internal service task. Resolution outcomes remain attached to the case. The industrial pump page remains a static preview.

## Local setup

### Docker Compose

Requirements: Docker with Compose v2.24+ and a Gemini API key for image analysis.

From the repository root, create the backend environment file if you do not already have one:

```bash
cp app/.env.example app/.env
```

Set `GEMINI_API_KEY` in `app/.env`, then build and start the frontend, backend, and PostgreSQL together:

```bash
docker compose up --build
```

Open `http://127.0.0.1:5173`. API documentation is at `http://127.0.0.1:8000/docs`. For detached startup that waits for all services to become healthy, use `docker compose up --build -d --wait`.

The backend waits for PostgreSQL and applies Alembic migrations before serving requests. The frontend waits for the backend's database readiness check and proxies `/api` to `http://backend:8000` on the Compose network. Compose overrides `DATABASE_URL` from `app/.env` with the internal database address; the file's loopback address still works for running the backend on your host. The environment file is optional for catalogue and saved-case access, and is excluded from Docker images.

These containers run the local app with Vite serving the frontend. Source code is copied into the images; rerun `docker compose up --build` after changing code or dependencies. No host Python, uv, Node, or npm installation is needed for this setup.

To stop the stack and remove its containers while keeping saved cases:

```bash
docker compose down
```

The existing `postgres_data` volume is retained. Avoid `docker compose down -v` unless you intend to delete the database. If you are already running the frontend or backend on your host, stop those processes before starting the full stack so ports 5173 and 8000 are available.

### Host development

Requirements: uv, Python 3.11+, Node 20.19+ (or Node 22.12+), Docker Compose, and a Gemini API key. The project was verified with Python 3.14 and Node 26.

From the repository root:

```bash
uv sync --project app --locked
cp app/.env.example app/.env
```

Backend dependencies are defined in `app/pyproject.toml` and pinned in `app/uv.lock`. `uv sync` creates and manages `app/.venv` and installs the development group by default. No virtual environment activation is required. Use `uv sync --project app --locked --no-dev` for runtime dependencies only, and add `--no-dev` to runtime `uv run` commands to keep development dependencies excluded.

Set `GEMINI_API_KEY` in `app/.env`. The key stays on the backend. `GEMINI_MODEL` defaults to `gemini-3.6-flash` and can be changed to a model available to your account that supports image input and structured output.

Start PostgreSQL, apply migrations, and run the API:

```bash
docker compose up -d --wait db
uv run --project app --locked python -m alembic -c app/alembic.ini upgrade head
uv run --project app --locked python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In another terminal, start the frontend:

```bash
cd web
npm ci --registry=https://registry.npmjs.org
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` to `http://127.0.0.1:8000`. To use another backend, set `VITE_API_BASE_URL` in `web/.env` to its full API prefix, for example `http://127.0.0.1:8000/api/v1`, and allow the frontend origin through backend `CORS_ORIGINS`. `VITE_API_PROXY_TARGET` can override the local development proxy target. For a production frontend build, provide a reverse proxy for `/api` or set `VITE_API_BASE_URL` at build time.

The API provides Swagger UI at `http://127.0.0.1:8000/docs` and ReDoc at `/redoc`.

```bash
curl --fail http://127.0.0.1:8000/health
curl --fail http://127.0.0.1:8000/health/ready
```

`/health` reports process liveness. `/health/ready` checks the database migration revision against the deployed code and returns 503 with the migration command when they differ; it does not make a paid Gemini request. The catalogue and saved cases remain accessible without a Gemini key; analysis returns an actionable configuration error until a key is configured. PostgreSQL is required for case operations. The Compose database listens on loopback port 5433 and persists data in a named volume. `docker compose stop` preserves that volume.

## Workflow and API

Application routes use `/api/v1`; the complete request and response schemas are documented in `/docs`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/catalog` | Sample bicycle input context and static pump preview |
| GET / POST | `/equipment` | List or create saved equipment profiles |
| PUT | `/equipment/{id}` | Update equipment identity and configuration |
| GET / POST | `/service-records` | List or log dated service entries; filter with `equipment_id` |
| PUT | `/service-records/{id}` | Edit a service entry and its equipment link |
| POST | `/images/preview` | Convert a photo to a JPEG preview without saving a case |
| POST | `/cases` | Create a case using multipart input |
| GET | `/cases/{id}` | Restore results, evidence, available stages, and task |
| GET | `/cases/{id}/images/{image_id}` | Retrieve a photo belonging to the case |
| POST | `/cases/{id}/scan` | Recognize bicycle components using Gemini |
| POST | `/cases/{id}/investigate` | Rank possible causes and propose inspection checks |
| PUT | `/cases/{id}/verification-steps/{step_id}` | Save check confirmation and optional evidence |
| POST | `/cases/{id}/verify` | Reassess after all checks are confirmed |
| POST | `/cases/{id}/tasks` | Approve and create one internal service task |
| GET | `/tasks` | List approved maintenance tasks with their inspection context |
| PUT | `/tasks/{id}/status` | Move a task to `todo`, `in_progress`, or `done` |
| POST | `/tasks/{id}/resolve` | Record a user-reported resolution |

Case creation accepts `source=sample` or `source=upload`, a required nonblank `symptom`, and optional `configuration` and `service` notes. `upload` requires an `image`; `sample` rejects uploaded images. Notes and symptoms are limited to 4,000 characters. Sample cases include the prepared sample bicycle configuration/history. Custom uploads never inherit that context.

Step updates accept multipart `completed`, optional `observation`, and optional `image`. All checks must be confirmed before reassessment. Observations and photos are optional: a confirmation records that a check was performed, without inventing its outcome. Completed verification freezes its evidence; start a new case to change it. Task creation requires JSON `{"approved":true}`. Resolution accepts JSON `{"notes":"..."}`; notes are optional and limited to 4,000 characters.

Photos may be JPEG, PNG, WebP, or HEIC/HEIF (including 48-megapixel iPhone photos), at most 10 MiB and 64 million pixels. Both the initial upload and follow-up evidence offer file selection and a **Take photo** camera option on supported mobile devices. HEIC/HEIF selections are converted to JPEG for browser previews without creating a case. The server decodes and rotates uploads, strips metadata, resizes to at most 2048×2048, and stores normalized JPEG bytes in PostgreSQL. A multipart request limit also bounds streamed uploads.

Gemini supplies recognition, image annotations, ranked hypotheses, verification checks, and recommendations. Structured results are validated before persistence. Missing records remain unknown, source labels distinguish reports and inferences, and confidence values are model estimates rather than measured probabilities. Inconclusive results can recommend further inspection. Prepared diagnosis results are never used as a fallback for live analysis.

Analysis requests wait for Gemini, with a default 60-second timeout. PostgreSQL operation claims prevent concurrent analysis and expire after 120 seconds to recover interrupted work. Completed operations return their saved result on retry; repeated approval/resolution requests preserve the same task and outcome. Invalid sequencing returns 409, invalid input 422, oversized uploads 413, unsupported formats 415, provider failures 502, unavailable configuration/quota/billing/database 503, and timeouts 504. Failures preserve completed progress. Reloading a pending case polls for its result.

An image upload and its Gemini scan are separate requests. If Gemini reports depleted prepayment credits (upstream HTTP 402), the API returns 503 with an explicit billing message. Restore credits for the API key's project in Google AI Studio, then retry analysis on the saved case; uploading the photo again is unnecessary.

Browser session storage holds only the active case ID and selected stage. PostgreSQL holds the actual case, evidence, task, and outcome. **New case** clears the active view and leaves previous database records intact. Clearing browser storage loses the active-case reference; an existing ID can still be retrieved through the API. A case-history interface is not included.

The **Maintenance board** at `/maintenance` lists approved tasks across inspections. **Approve & create task** in the Act step adds one card to **To do**, with a link to open the board. Existing approved tasks appear automatically. Drag cards or use their status menu to move work through **To do**, **In progress**, and **Done**. Search by task ID, equipment, symptom, or diagnosis, and filter by priority. Open a card for the recommendation, resolution notes, and a link back to its source inspection. Moving a task to **Done** records its resolution on the inspection; resolving it from Act also moves its board card to **Done**. Completed outcomes are final, and retrying completion preserves the original notes. The board persists in PostgreSQL and does not require an active inspection in browser storage.

After updating an existing installation, run `uv run --project app --locked python -m alembic -c app/alembic.ini upgrade head` to add board statuses. Existing open tasks start in **To do**, and tasks with recorded outcomes start in **Done**. Production frontend hosting must serve the SPA entry point for `/maintenance` as well as `/`.

The Act step also offers **Skip, self-resolved**, which records a user-reported resolution without creating a task. Migration `0006` adds the case's self-resolution timestamp. Host development requires the migration command above after pulling this change; an older schema causes case access and **Approve & create task** to return 503. Compose applies it automatically when starting a rebuilt backend. Applying the migration preserves saved inspections, verification results, and tasks.

The **Equipment configuration** page at `/equipment` saves equipment names, manufacturer/model, serial or asset numbers, and configuration notes. The **Service history** page at `/service-history` logs dated work against an equipment profile, with service type, technician, and observations. Both pages support editing, searching, and reloads, and are available from the workspace navigation. Service history also filters by equipment and service type. Unknown fields remain blank until supplied.

Migration `0004` seeds **Road bike** (Element FRC 50 CRD, asset `2026/07/07-ELE-CRD`) with the supplied 2x10-speed drivetrain configuration. Docker applies it automatically on backend startup, so a fresh database or a database recreated after removing the volume includes the default equipment. Restarts and rebuilds retain the saved profile. The migration checks the fixed seed ID and asset number to avoid duplicates, preserves an existing matching profile and its service history, and leaves later edits intact. For host development, the usual `alembic upgrade head` command installs the seed.

Migration `0005` adds **RD adjuster**, a maintenance entry for Road bike dated **17 August 2026**, performed by **Bike Technician**, with the notes **Adjust the RD for better gear shifting.** It links to the actual Road bike profile even if `0004` reused an existing asset. Fresh databases receive both records, while repeated migrations preserve existing entries and edits without adding duplicates.

Choose **Inspect equipment** on a profile, or select **Saved equipment** when uploading a bicycle photo, to attach the saved configuration and recent service history to a new case. The API accepts the optional multipart `equipment_id` for uploaded cases. It snapshots the profile and up to 20 most recent service records at case creation, with configuration and history each bounded to 4,000 characters. Later record edits apply to future inspections; existing case context remains unchanged. The prepared sample bicycle keeps its own sample context. Additional service entries are entered manually; maintenance board resolutions stay attached to their source inspections.

Run `uv run --project app --locked python -m alembic -c app/alembic.ini upgrade head` to add the equipment and service tables to an existing host installation. Compose applies this migration on backend startup. Production frontend hosting must also serve the SPA entry point for `/equipment` and `/service-history`.

## Verification

Start the Compose database before integration or browser tests. The tests create a uniquely named temporary database, apply the actual Alembic migrations, and drop only that temporary database on teardown. The default administration URL is the local Compose database; override `TEST_DATABASE_URL` if needed. Its role must be allowed to create databases.

```bash
uv run --project app --locked python -m pytest -q
uv run --project app --locked ruff check app
uv run --project app --locked ruff format --check app
cd web
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Backend tests inject a fake Gemini adapter. Browser tests launch a test-only backend on port 8011, Vite on 5177, and a fresh PostgreSQL database. They cover sample/custom inputs, failure/retry, pending-operation refresh, evidence, task approval/resolution, persistent state, and the mobile pump preview. The test-only backend requires `MEKASCOPE_E2E=1` and is never selected by the normal application.

A real Gemini smoke test is opt-in and may incur an API charge:

```bash
RUN_GEMINI_SMOKE=1 uv run --project app --locked python -m pytest app/tests/test_gemini.py -m live -q
```

To manage backend dependencies from the repository root:

```bash
uv add --project app <package>
uv add --project app --dev <development-package>
uv remove --project app <package>
uv lock --project app --upgrade
uv sync --project app --locked
```

Commit both `app/pyproject.toml` and `app/uv.lock` when dependencies change. Run the backend commands above from the repository root; `--project app` selects its dependency environment while keeping repository-relative imports and paths intact. The Playwright backend launcher also uses `uv` and the locked environment.

## Structure and boundaries

- `app/`: FastAPI entrypoint, Pydantic schemas, async database models, Gemini adapter, workflow services, catalogue, migrations, and tests.
- `web/`: React/TypeScript frontend, typed API client, Vite configuration, Playwright tests, and bundled sample photographs.
- `compose.yaml`: local frontend, backend with automatic migrations, and persistent PostgreSQL services.
- `app/Dockerfile`, `web/Dockerfile`: backend and frontend container builds using the committed dependency lockfiles.

This is a trusted prototype without login or per-user access restrictions. Service tasks are internal database records and resolutions are user reports. Camera capture, voice input, external maintenance systems, and automated retrieval from case memory are not included. The two bundled photographs were generated for this prototype.
