# PRP: Assignment Roaster

> Implementation blueprint for parallel agent execution. This file is the **single source of truth** for
> the API contract: backend and frontend agents work in parallel and must match these shapes exactly.

---

## METADATA

| Field | Value |
|-------|-------|
| **Product** | Assignment Roaster |
| **Type** | SaaS |
| **Version** | 1.0 |
| **Created** | 2026-10-10 |
| **Complexity** | Medium |

---

## PRODUCT OVERVIEW

**Description:** Coding bootcamp learners paste code or upload files/.zip with an assignment brief, choose a roast
intensity (mild / medium / savage), and receive an OpenAI-generated structured critique: score 0–100, punchy headline,
summary, line-level issues with suggested fixes, and strengths. Roasts can be shared via opt-in public links.

**Value Proposition:** Fast, honest, memorable feedback outside mentor office hours; shareable results.

**MVP Scope:**
- [ ] Register/login (email + password, Google OAuth)
- [ ] Submit code by paste or file/zip upload, with assignment brief
- [ ] OpenAI roast with score, headline, summary, issues + fixes, strengths
- [ ] Public share links (create, copy, revoke, public `/r/{slug}` page)
- [ ] Dashboard listing my submissions and roasts
- (Built now but post-MVP priority: intensity selector UI, admin panel)

---

## TECH STACK

| Layer | Technology | Skill Reference |
|-------|------------|-----------------|
| Backend | FastAPI + Python (3.11 in Docker; code MUST also run on 3.10 locally) | skills/BACKEND.md |
| Frontend | React 18 + TypeScript (strict) + Vite | skills/FRONTEND.md |
| Database | PostgreSQL 16 + SQLAlchemy 2.0 (sync Session) + Alembic | skills/DATABASE.md |
| Auth | JWT via **PyJWT** + **bcrypt** (direct, no passlib), Google OAuth via httpx | skills/BACKEND.md |
| AI | `openai` Python SDK (AsyncOpenAI), JSON mode, Pydantic validation | — |
| UI | **Chakra UI v2** (`@chakra-ui/react@^2.10`) + Framer Motion 11 + `@emotion/*` | skills/FRONTEND.md |
| Data fetching | axios + @tanstack/react-query v5 + react-router-dom v6 | skills/FRONTEND.md |
| Testing | pytest + pytest-cov (SQLite in-memory by default), Vitest + RTL + jsdom | skills/TESTING.md |
| Deployment | Docker + docker compose + GitHub Actions | skills/DEPLOYMENT.md |

### Global implementation decisions (all agents)

- **Python 3.10 compatibility:** no `enum.StrEnum`, no `datetime.UTC`, no `typing.Self`. Use `class X(str, enum.Enum)` and `datetime.now(timezone.utc)`.
- **SQLAlchemy 2.0 typed style:** `DeclarativeBase`, `Mapped[...]`, `mapped_column(...)`. Use `sa.JSON` (not JSONB) and
  `sa.Enum(..., native_enum=False, length=20)` so models work on both PostgreSQL and SQLite (tests).
- **Port Tailwind snippets in skills/FRONTEND.md to Chakra UI:** build `GlassCard`, `GradientButton`, `PageWrapper`,
  `AnimatedList`, `AnimatedInput`, `MeshBackground` with `motion(Box)` / `motion(Button)` / Chakra style props. No Tailwind, no inline `style={{}}`.
- **JSON casing:** API uses **snake_case** everywhere; frontend TypeScript types mirror snake_case exactly (no mapping layer).
- **Datetimes:** ISO-8601 strings with timezone.
- **Errors:** every error response body is `{"detail": "<human message>", "code": "<MACHINE_CODE>"}`
  (FastAPI `HTTPException` / validation errors are normalized by exception handlers in `main.py`).
- **Pagination response:** `{"items": [...], "total": int, "page": int, "per_page": int}`; query params `page` (≥1, default 1), `per_page` (1–100, default 20).
- **Logging:** `logging.getLogger(__name__)`; never `print()`; never log code content or prompts at INFO.
- **Frontend:** no `any`, no `console.log`, no `dangerouslySetInnerHTML`, every async call has error handling (toast or inline Alert).

---

## DATABASE MODELS

All tables have `id: int PK`. `TimestampMixin` = `created_at` (server_default now, not null) + `updated_at` (nullable, onupdate now).

### User (`users`) — TimestampMixin
| Field | Type | Notes |
|-------|------|-------|
| email | String(255) | unique, index, not null, stored lowercase |
| hashed_password | String(255) | nullable (Google-only users) |
| full_name | String(100) | nullable |
| is_active | Boolean | default True |
| is_verified | Boolean | default False |
| is_admin | Boolean | default False |
| oauth_provider | String(20) | nullable, e.g. "google" |
| google_id | String(255) | unique, nullable, index |
| avatar_url | String(500) | nullable |
| default_intensity | Enum RoastIntensity | default "medium" |

Relationships: submissions, roasts, share_links, refresh_tokens (cascade delete-orphan).

### RefreshToken (`refresh_tokens`)
| Field | Type | Notes |
|-------|------|-------|
| user_id | FK users.id ondelete CASCADE | index |
| token_hash | String(64) | unique, index — SHA-256 hex of the JWT refresh token (never store raw) |
| expires_at | DateTime(tz) | |
| revoked | Boolean | default False |
| created_at | DateTime(tz) | server_default now |

### Submission (`submissions`) — TimestampMixin
| Field | Type | Notes |
|-------|------|-------|
| user_id | FK users.id CASCADE | index |
| title | String(200) | not null |
| assignment_brief | Text | nullable, ≤ 5000 chars (validated in schema) |
| language | String(30) | one of: python, javascript, typescript, java, c, cpp, csharp, go, ruby, php, html_css, sql, other |
| source_type | Enum SourceType (`paste`, `upload`) | |
| code_content | Text | pasted code or concatenated uploaded text (`// ===== FILE: path =====` headers), ≤ 100 KB |

Relationships: user, files (cascade), roasts (cascade, order_by created_at desc). Index (user_id, created_at).

### SubmissionFile (`submission_files`)
| Field | Type | Notes |
|-------|------|-------|
| submission_id | FK submissions.id CASCADE | index |
| filename | String(255) | sanitized relative path |
| storage_path | String(500) | path under UPLOAD_DIR |
| content_type | String(100) | |
| size_bytes | Integer | |
| created_at | DateTime(tz) | server_default now |

### Roast (`roasts`)
| Field | Type | Notes |
|-------|------|-------|
| submission_id | FK submissions.id CASCADE | index |
| user_id | FK users.id CASCADE | index |
| intensity | Enum RoastIntensity (`mild`, `medium`, `savage`) | |
| status | Enum RoastStatus (`pending`, `completed`, `failed`) | default pending |
| score | Integer | nullable, 0–100 |
| headline | String(280) | nullable |
| summary | Text | nullable |
| issues | JSON | list of RoastIssue dicts, default [] |
| strengths | JSON | list of str, default [] |
| model | String(100) | nullable |
| prompt_tokens | Integer | nullable |
| completion_tokens | Integer | nullable |
| error_message | String(500) | nullable |
| created_at | DateTime(tz) | server_default now, index |
| completed_at | DateTime(tz) | nullable |

Relationships: submission, user, share_link (one-to-one, uselist=False, cascade). Index (user_id, created_at).

### ShareLink (`share_links`)
| Field | Type | Notes |
|-------|------|-------|
| roast_id | FK roasts.id CASCADE | **unique** (one link per roast), index |
| user_id | FK users.id CASCADE | index |
| slug | String(32) | unique, index, `secrets.token_urlsafe(12)` |
| is_active | Boolean | default True |
| show_code | Boolean | default False |
| view_count | Integer | default 0 |
| expires_at | DateTime(tz) | nullable |
| created_at | DateTime(tz) | server_default now |

Enums live in `app/models/enums.py`: `RoastIntensity`, `RoastStatus`, `SourceType` (all `str, enum.Enum`).

---

## API CONTRACT (all prefixed `/api/v1`; JSON snake_case)

### Shared schema shapes

```jsonc
// UserResponse
{ "id": 1, "email": "a@b.com", "full_name": "Ada", "is_active": true, "is_verified": false, "is_admin": false,
  "oauth_provider": null, "avatar_url": null, "default_intensity": "medium", "created_at": "..." }

// TokenResponse
{ "access_token": "...", "refresh_token": "...", "token_type": "bearer" }

// SubmissionFileResponse
{ "id": 1, "filename": "src/app.py", "content_type": "text/x-python", "size_bytes": 1234, "created_at": "..." }

// RoastIssue
{ "file": "src/app.py" | null, "line": 12 | null, "severity": "low|medium|high",
  "category": "bug|style|performance|security|readability|requirements",
  "message": "...", "suggested_fix": "..." }

// RoastResponse
{ "id": 1, "submission_id": 1, "intensity": "medium", "status": "completed", "score": 72,
  "headline": "...", "summary": "...", "issues": [RoastIssue], "strengths": ["..."],
  "model": "...", "error_message": null, "created_at": "...", "completed_at": "...",
  "share_link": ShareLinkResponse | null }

// SubmissionListItem
{ "id": 1, "title": "...", "language": "python", "source_type": "paste", "created_at": "...", "updated_at": null,
  "roast_count": 2, "latest_score": 72 | null }

// SubmissionDetail
{ "id": 1, "title": "...", "assignment_brief": "..." | null, "language": "python", "source_type": "paste",
  "code_content": "...", "created_at": "...", "updated_at": null,
  "files": [SubmissionFileResponse], "roasts": [RoastResponse] }   // roasts newest first

// ShareLinkResponse
{ "id": 1, "roast_id": 1, "slug": "abc...", "url": "<FRONTEND_URL>/r/<slug>", "is_active": true, "show_code": false,
  "view_count": 0, "expires_at": null, "created_at": "..." }

// PublicRoastResponse (NO user_id, NO email, NO ids other than slug)
{ "slug": "...", "submission_title": "...", "language": "python", "intensity": "savage", "score": 72,
  "headline": "...", "summary": "...", "issues": [RoastIssue], "strengths": ["..."],
  "code_content": "..." | null,   // null unless show_code
  "author_name": "Ada" | null,    // first name only (first token of full_name) or null
  "created_at": "..." }

// RoastQuota
{ "limit": 10, "used_today": 3, "remaining": 7 }
```

### Module 1: Authentication — `routers/auth.py`
| Method | Endpoint | Request | Response | Notes |
|--------|----------|---------|----------|-------|
| POST | /auth/register | `{email, password (8–128), full_name?}` | 201 UserResponse | 409 `EMAIL_EXISTS`; rate limited 5/min/IP |
| POST | /auth/login | **JSON** `{email, password}` | TokenResponse | 401 `INVALID_CREDENTIALS`; 403 `USER_INACTIVE`; rate limited 10/min/IP |
| POST | /auth/refresh | `{refresh_token}` | TokenResponse | rotates: old token revoked; 401 if invalid/revoked/expired |
| POST | /auth/logout | `{refresh_token}` | 204 | revokes token (idempotent) |
| GET | /auth/me | — | UserResponse | auth |
| PUT | /auth/me | `{full_name?, default_intensity?}` | UserResponse | auth |
| GET | /auth/google | — | 307 redirect to Google | sets signed, httponly `oauth_state` cookie (10 min) |
| GET | /auth/google/callback | `?code&state` | 307 redirect to `{FRONTEND_URL}/auth/callback#access_token=..&refresh_token=..` | verifies state cookie == state (else redirect `/login?error=oauth_state`); finds by google_id, else links by email, else creates user (is_verified=True) |

Google redirect_uri = `{BACKEND_URL}/api/v1/auth/google/callback`. If `GOOGLE_CLIENT_ID` empty → `/auth/google` returns 503 `OAUTH_NOT_CONFIGURED`.
Rate limiting via `slowapi` (limiter instance in `app/rate_limit.py`, registered in main.py; disabled when `RATE_LIMIT_ENABLED=false`, which tests set).

### Module 2: Submissions — `routers/submissions.py`, `services/submission_service.py`, `services/upload_service.py`
| Method | Endpoint | Request | Response |
|--------|----------|---------|----------|
| GET | /submissions | `?page&per_page` | Paginated[SubmissionListItem] newest first |
| POST | /submissions | `{title, assignment_brief?, language, code_content}` | 201 SubmissionDetail (source_type=paste) |
| POST | /submissions/upload | multipart: `title`, `assignment_brief?`, `language`, `files` (1..N) | 201 SubmissionDetail (source_type=upload) |
| GET | /submissions/{id} | — | SubmissionDetail |
| PUT | /submissions/{id} | `{title?, assignment_brief?, language?, code_content?}` | SubmissionDetail; `code_content` only allowed for paste (400 `CODE_NOT_EDITABLE` for upload) |
| DELETE | /submissions/{id} | — | 204; also deletes stored files from disk |

- `submission_service.get_owned_submission(db, submission_id, user_id) -> Submission` raises `NotFoundError` (404) for missing **or other users'** submissions. Roasts module imports it.
- Upload rules (from config): allowed extensions `.py .js .ts .tsx .jsx .java .c .cpp .h .cs .go .rb .php .html .css .sql .md .json .txt` + `.zip`;
  per-file ≤ `MAX_FILE_SIZE_BYTES` (413 `FILE_TOO_LARGE`), ≤ `MAX_FILES_PER_SUBMISSION` files incl. zip members (400 `TOO_MANY_FILES`),
  zip ≤ `MAX_ZIP_SIZE_BYTES` (413), total uncompressed zip ≤ 10× zip limit (zip bomb → 400 `INVALID_ZIP`),
  zip members with absolute paths / `..` / drive letters → 400 `INVALID_ZIP`; disallowed extension → 400 `UNSUPPORTED_FILE_TYPE`;
  non-UTF-8 / binary (NUL byte) files skipped; if no usable text → 400 `NO_READABLE_FILES`;
  concatenated text truncated to `MAX_CODE_CHARS` (100_000). Files saved under `UPLOAD_DIR/<user_id>/<uuid4>/<safe_name>`. Code never executed.

### Module 3: Roasts — `routers/roasts.py`, `services/roast_service.py`
| Method | Endpoint | Request | Response |
|--------|----------|---------|----------|
| POST | /submissions/{id}/roasts | `{intensity?}` (default = user.default_intensity) | 201 RoastResponse (status completed **or** failed) |
| GET | /submissions/{id}/roasts | — | list[RoastResponse] newest first |
| GET | /roasts/quota | — | RoastQuota |
| GET | /roasts/{id} | — | RoastResponse (owner only, else 404) |
| DELETE | /roasts/{id} | — | 204 |

- Roast generated **synchronously** in the request (MVP). Quota: count roasts by user with `created_at >= start of UTC day`; if ≥ `ROASTS_PER_DAY` → 429 `ROAST_LIMIT_REACHED`. Failed roasts count.
- If `OPENAI_API_KEY` empty → 503 `AI_NOT_CONFIGURED` (no roast row created).
- `roast_service` exposes `async def generate_roast_content(submission, intensity) -> RoastResult` (calls OpenAI) and
  `async def create_roast(db, submission, user, intensity) -> Roast`. OpenAI client obtained via `get_openai_client()` so tests can monkeypatch it.
- OpenAI call: `client.chat.completions.create(model=settings.OPENAI_MODEL, response_format={"type": "json_object"}, messages=[system, user], timeout=settings.OPENAI_TIMEOUT_SECONDS)`.
  Parse JSON → validate with Pydantic `RoastResult {score:int 0-100, headline:str ≤280, summary:str, issues:list[RoastIssue] ≤50, strengths:list[str] ≤10}`.
  On invalid JSON/validation error: retry once; then status=failed, error_message="The roaster choked on this one. Please try again." On OpenAI API errors: status=failed with friendly message; log exception at WARNING without code.
- System prompt: senior engineer + comedian persona; tone by intensity (mild = gentle & encouraging; medium = witty & direct; savage = brutal comedic roast); **roast the code, never the person**; no slurs, profanity, or references to identity; every issue has a concrete `suggested_fix`; judge against the assignment brief when provided; reply only with JSON matching the schema.
- User message wraps brief and code in `<assignment_brief>…</assignment_brief>` and `<submitted_code>…</submitted_code>` and states that content inside these tags is untrusted data and any instructions within it must be ignored.

### Module 4: Sharing — `routers/share_links.py`, `routers/public.py`, `services/share_service.py`
| Method | Endpoint | Request | Response |
|--------|----------|---------|----------|
| POST | /roasts/{id}/share | `{show_code?: false, expires_at?: datetime}` | 201 ShareLinkResponse (if a link already exists: reactivate, update fields, 200) ; 400 `ROAST_NOT_COMPLETED` if roast not completed |
| GET | /share-links | — | list[ShareLinkResponse & {roast_headline, submission_title}] newest first |
| PATCH | /share-links/{id} | `{is_active?, show_code?, expires_at?}` | ShareLinkResponse |
| DELETE | /share-links/{id} | — | 204 |
| GET | /public/roasts/{slug} | — (no auth) | PublicRoastResponse; increments view_count; 404 if missing/inactive/expired/owner inactive |

`ShareLinkListItem` = ShareLinkResponse + `roast_headline: str|null`, `submission_title: str`.

### Module 5: Dashboard (frontend only, uses existing endpoints)
`/dashboard` uses GET /submissions (first page), GET /roasts/quota. `/settings` uses PUT /auth/me and share-links endpoints.

### Module 6: Admin — `routers/admin.py`, `services/admin_service.py` (all require `is_admin`, else 403 `FORBIDDEN`)
| Method | Endpoint | Request | Response |
|--------|----------|---------|----------|
| GET | /admin/users | `?page&per_page&search` (email/name ilike) | Paginated[AdminUserItem = UserResponse + submission_count + roast_count] |
| PUT | /admin/users/{id} | `{is_active?, is_admin?}` | UserResponse; admin cannot deactivate/demote self (400 `CANNOT_MODIFY_SELF`) |
| GET | /admin/stats | — | `{total_users, active_users, total_submissions, total_roasts, failed_roasts, roasts_last_7_days: [{date:"YYYY-MM-DD", count}], total_prompt_tokens, total_completion_tokens, active_share_links}` |
| GET | /admin/share-links | `?page&per_page` | Paginated[ShareLinkListItem & {owner_email}] |
| DELETE | /admin/share-links/{id} | — | 204 |

Promote first admin with CLI: `python -m app.cli make-admin <email>` (`app/cli.py`, argparse).

### Health
`GET /health` → `{"status": "healthy"}` (no prefix).

---

## FRONTEND ROUTES & FILE OWNERSHIP

| Route | Page file | Protected | Owner (Phase 2) |
|-------|-----------|-----------|-----------------|
| / | pages/LandingPage.tsx | no | FE-DASHBOARD |
| /login | pages/LoginPage.tsx | no (redirect to /dashboard if logged in) | FE-AUTH |
| /register | pages/RegisterPage.tsx | no | FE-AUTH |
| /forgot-password | pages/ForgotPasswordPage.tsx (informational "coming soon, contact support") | no | FE-AUTH |
| /auth/callback | pages/OAuthCallbackPage.tsx (reads URL fragment tokens) | no | FE-AUTH |
| /profile | pages/ProfilePage.tsx | yes | FE-AUTH |
| /dashboard | pages/DashboardPage.tsx | yes | FE-DASHBOARD |
| /settings | pages/SettingsPage.tsx (default intensity + embeds `<ShareLinksManager />`) | yes | FE-DASHBOARD |
| /submissions | pages/SubmissionsPage.tsx | yes | FE-SUBMISSIONS |
| /submissions/new | pages/NewSubmissionPage.tsx (tabs Paste / Upload with drag-and-drop, intensity selector, "Roast it" → create then POST roast → navigate to detail) | yes | FE-SUBMISSIONS |
| /submissions/:id | pages/SubmissionDetailPage.tsx (code viewer, RoastPanel, re-roast w/ intensity, `<ShareButton roast={roast} />`) | yes | FE-SUBMISSIONS |
| /submissions/:id/edit | pages/EditSubmissionPage.tsx | yes | FE-SUBMISSIONS |
| /r/:slug | pages/PublicRoastPage.tsx (no auth, read-only, CTA "Get your own code roasted") | no | FE-SHARING |
| /admin | pages/admin/AdminDashboardPage.tsx | admin | FE-DASHBOARD |
| /admin/users | pages/admin/AdminUsersPage.tsx | admin | FE-DASHBOARD |
| /admin/share-links | pages/admin/AdminShareLinksPage.tsx | admin | FE-DASHBOARD |
| * | pages/NotFoundPage.tsx | no | FE-FOUNDATION |

Shared components (created in Phase 1 as working stubs, completed by owner):
- `components/roast/RoastView.tsx` — props `{ roast: Pick<Roast,'score'|'headline'|'summary'|'issues'|'strengths'|'intensity'> }` — score gauge, headline, summary, issues grouped by severity, strengths. **Owner: FE-SUBMISSIONS.** Reused by PublicRoastPage.
- `components/roast/CodeViewer.tsx` — props `{ code: string; language: string }` — renders `<Code whiteSpace="pre">` with line numbers (text only). **Owner: FE-SUBMISSIONS.**
- `components/sharing/ShareButton.tsx` — props `{ roast: Roast }` — opens modal: create link, copy URL, toggle show_code, revoke. **Owner: FE-SHARING.**
- `components/sharing/ShareLinksManager.tsx` — no props — table of my links with toggle/revoke. **Owner: FE-SHARING.**
- `components/layout/AppLayout.tsx` (navbar: Dashboard, Submissions, New Roast, Settings, Admin if is_admin, user menu/logout) — **Owner: FE-FOUNDATION.**
- `components/auth/ProtectedRoute.tsx` (props `{ children, requireAdmin?: boolean }`) — **Owner: FE-FOUNDATION** (uses `useAuth`).
- `context/AuthContext.tsx` + `hooks/useAuth.ts` — **Owner: FE-FOUNDATION** (complete implementation: user, isLoading, login(email,password), register(...), logout(), refreshUser(), setTokens(access, refresh)).

Service files (one per module): `services/api.ts` (foundation), `services/authService.ts`, `services/submissionService.ts`, `services/roastService.ts`, `services/shareService.ts`, `services/adminService.ts`. Hooks per module use React Query.
`types/index.ts` (foundation) defines **all** interfaces from the API contract above.
API errors: helper `getErrorMessage(err: unknown): string` in `lib/errors.ts` (foundation) reads `response.data.detail`.

---

## PHASE EXECUTION PLAN

**Phase 1: Foundation (4 agents in parallel)**
- DATABASE-AGENT: all models, enums, database.py, Alembic + initial migration
- BACKEND-AGENT: requirements, config, main.py (registers ALL routers — creates stub router files for every module), exceptions, rate_limit, auth/security.py (JWT + bcrypt), auth/dependencies.py (get_current_user, get_current_admin), pagination schema
- FRONTEND-AGENT: Vite project, Chakra theme, UI kit, api client, all types, AuthContext, layout, App.tsx with ALL routes → placeholder pages
- DEVOPS-AGENT: Dockerfiles, compose files, nginx, .env.example, CI

**Validation Gate 1:** pip install, import app, alembic upgrade (SQLite + Postgres via docker), npm install, npm run build, docker compose config

**Phase 2: Modules (parallel) — each agent edits ONLY its owned files**
- BE-AUTH, BE-SUBMISSIONS, BE-ROASTS, BE-SHARING, BE-ADMIN
- FE-AUTH, FE-SUBMISSIONS (incl. roast UI), FE-SHARING, FE-DASHBOARD (incl. landing, settings, admin)

**Validation Gate 2:** ruff check, ruff format, npm run lint, npm run type-check, npm run build

**Phase 3: Quality (3 agents in parallel)**
- TEST-AGENT: pytest (OpenAI mocked) ≥ 80% coverage, Vitest tests
- REVIEW-AGENT: security/perf/quality audit → fixes
- RESEARCH-AGENT: dependency advisories, best practices

**Final Validation:** full test suites, docker compose build/up, health checks

---

## VALIDATION GATES

| Gate | Commands |
|------|----------|
| 1 | `pip install -r backend/requirements.txt`, `alembic upgrade head`, `npm install`, `docker compose config` |
| 2 | `ruff check backend/`, `npm run lint`, `npm run type-check` |
| 3 | `pytest --cov=app --cov-fail-under=80`, `npm test` |
| Final | `docker compose up -d`, `curl localhost:8000/health`, `curl localhost:3000` |

---

## ENVIRONMENT VARIABLES

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/assignment_roaster
SECRET_KEY=change-me
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_TIMEOUT_SECONDS=60
ROASTS_PER_DAY=10
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_BYTES=1048576
MAX_ZIP_SIZE_BYTES=5242880
MAX_FILES_PER_SUBMISSION=20
MAX_CODE_CHARS=100000
RATE_LIMIT_ENABLED=true
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:8000
VITE_API_URL=http://localhost:8000
```

---

## NEXT STEP

```
/execute-prp PRPs/assignment-roaster-prp.md
```
