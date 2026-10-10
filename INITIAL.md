# INITIAL.md - Assignment Roaster Product Definition

> AI-powered code reviews with attitude: bootcamp learners submit their coding assignments and get a witty, brutally honest (but constructive) "roast" with a score and concrete fixes, which they can share via a public link.

---

## PRODUCT

### Name
Assignment Roaster

### Description
Assignment Roaster helps coding bootcamp learners level up faster by roasting their assignments.
A learner pastes code or uploads files (or a zip), adds the assignment brief, picks a roast intensity
(Mild / Medium / Savage), and OpenAI returns a structured critique: an overall score, a punchy
headline, a humorous-but-useful summary, line-level issues with suggested fixes, and what they did well.
Roasts can be shared through an opt-in public link so learners can show peers and mentors.

Roasts always target the **code**, never the person: humor is allowed, insults are not.

### Target User
Coding bootcamp learners (career switchers and beginners) submitting programming assignments
who want fast, honest, memorable feedback outside of mentor office hours.

### Type
- [x] SaaS (Software as a Service)

---

## TECH STACK

### Backend
- [x] FastAPI + Python 3.11+

### Frontend
- [x] React + TypeScript + Vite

### Database
- [x] PostgreSQL + SQLAlchemy + Alembic

### Authentication
- [x] Email/Password + Google OAuth (JWT access + refresh tokens)

### UI Framework
- [x] Chakra UI + Framer Motion

### AI Provider
- [x] OpenAI API (model configurable via `OPENAI_MODEL`)

### Payments
- [ ] None (free product; payments may be added later)

---

## MODULES

### Module 1: Authentication (Required)

**Description:** User authentication and authorization

**Models:**
- User: id, email, hashed_password (nullable for OAuth users), full_name, is_active, is_verified, is_admin, oauth_provider, created_at, updated_at
- RefreshToken: id, user_id (FK), token, expires_at, revoked, created_at

**API Endpoints:**
- POST /api/v1/auth/register - Create new account
- POST /api/v1/auth/login - Login with email/password
- POST /api/v1/auth/refresh - Refresh access token
- POST /api/v1/auth/logout - Revoke refresh token
- GET /api/v1/auth/me - Get current user profile
- PUT /api/v1/auth/me - Update profile
- GET /api/v1/auth/google - Start Google OAuth flow
- GET /api/v1/auth/google/callback - Google OAuth callback

**Frontend Pages:**
- /login - Login page (email/password + "Continue with Google")
- /register - Registration page
- /forgot-password - Forgot password page
- /profile - User profile page (protected)

---

### Module 2: Submissions

**Description:** Learners submit a coding assignment for roasting, either by pasting code or uploading files.

**Models:**
```
Submission:
  - id, user_id (FK -> users)
  - title: str (max 200)
  - assignment_brief: text (optional, max 5,000 chars) - what the assignment asked for
  - language: str (e.g. python, javascript, typescript, java, html/css, other)
  - source_type: enum (paste | upload)
  - code_content: text (pasted code, or concatenated text of uploaded files, max 100 KB)
  - created_at, updated_at

SubmissionFile:
  - id, submission_id (FK -> submissions, cascade delete)
  - filename: str (sanitized relative path)
  - storage_path: str
  - content_type: str
  - size_bytes: int
  - created_at
```

**API Endpoints:**
```
GET    /api/v1/submissions            - List current user's submissions (paginated)
POST   /api/v1/submissions            - Create from pasted code (JSON)
POST   /api/v1/submissions/upload     - Create from uploaded files / .zip (multipart)
GET    /api/v1/submissions/{id}       - Get one (with files + roasts)
PUT    /api/v1/submissions/{id}       - Update title / brief / pasted code
DELETE /api/v1/submissions/{id}       - Delete submission, files, roasts, share links
```

**Frontend Pages:**
```
/submissions           - List of my submissions
/submissions/new       - Paste code or drag-and-drop upload, brief, language, intensity
/submissions/{id}      - Submission detail: code viewer + roast results
/submissions/{id}/edit - Edit submission
```

**Upload rules:**
- Allowed: source/text files (.py .js .ts .tsx .jsx .java .c .cpp .cs .go .rb .php .html .css .sql .md .json .txt) and .zip
- Max 1 MB per file, max 20 files, max 5 MB per zip, max 100 KB total extracted text sent to AI
- Zip extraction protected against path traversal (zip-slip) and zip bombs; binaries are skipped
- Uploaded code is **never executed**

---

### Module 3: Roasts (AI Feedback)

**Description:** Generates a structured, intensity-controlled roast of a submission using OpenAI.

**Models:**
```
Roast:
  - id, submission_id (FK -> submissions, cascade delete), user_id (FK -> users)
  - intensity: enum (mild | medium | savage)
  - status: enum (pending | completed | failed)
  - score: int (0-100, nullable until completed)
  - headline: str (one-liner roast, max 280)
  - summary: text (overall roast + verdict)
  - issues: JSON  [{file, line, severity: low|medium|high, category: bug|style|performance|security|readability|requirements, message, suggested_fix}]
  - strengths: JSON [str]
  - model: str
  - prompt_tokens: int, completion_tokens: int
  - error_message: str (nullable)
  - created_at, completed_at
```

**API Endpoints:**
```
POST   /api/v1/submissions/{id}/roasts  - Request a roast {intensity}
GET    /api/v1/submissions/{id}/roasts  - List roasts for a submission
GET    /api/v1/roasts/{id}              - Get one roast
DELETE /api/v1/roasts/{id}              - Delete a roast
```

**Frontend Pages:**
- Roast results panel on /submissions/{id}: score gauge, headline, summary, issues list grouped by severity (linked to file/line), strengths, "Re-roast" button with intensity selector
- Loading state with animated "heating up the grill" progress (Framer Motion)

**AI rules:**
- OpenAI called from a backend service only (API key never reaches the frontend)
- Structured JSON output validated with Pydantic; invalid output -> retry once -> mark `failed`
- System prompt enforces: critique the code not the person, no slurs/profanity, every roast point paired with a fix
- Submitted code is treated as untrusted data in the prompt (prompt-injection resistant delimiting)
- Per-user rate limit: 10 roasts/day (configurable via `ROASTS_PER_DAY`)

---

### Module 4: Sharing

**Description:** Opt-in public share links so learners can show a roast to peers or mentors.

**Models:**
```
ShareLink:
  - id, roast_id (FK -> roasts, cascade delete), user_id (FK -> users)
  - slug: str (unique, random, URL-safe, >= 10 chars)
  - is_active: bool
  - show_code: bool (owner chooses whether code is visible publicly)
  - view_count: int
  - expires_at: datetime (nullable)
  - created_at
```

**API Endpoints:**
```
POST   /api/v1/roasts/{id}/share     - Create (or return existing) share link {show_code, expires_at?}
GET    /api/v1/share-links           - List my share links
PATCH  /api/v1/share-links/{id}      - Toggle is_active / show_code / expiry
DELETE /api/v1/share-links/{id}      - Revoke link
GET    /api/v1/public/roasts/{slug}  - Public, unauthenticated read-only roast view
```

**Frontend Pages:**
- /r/{slug} - Public roast page (no login, read-only, Open Graph meta for nice link previews, "Get your own code roasted" CTA)
- Share dialog on /submissions/{id}: create link, copy URL, toggle code visibility, revoke

---

### Module 5: Dashboard

**Description:** Home base for the learner

**Frontend Pages:**
- /dashboard - Recent submissions, latest roasts and scores, "Roast new assignment" CTA, roasts remaining today
- /settings - Profile, default roast intensity, manage share links

---

### Module 6: Admin Panel

**Description:** Admin-only management interface (`is_admin` users)

**API Endpoints:**
- GET /api/v1/admin/users - List all users (paginated, searchable)
- PUT /api/v1/admin/users/{id} - Activate/deactivate user, toggle admin
- GET /api/v1/admin/stats - Users, submissions, roasts per day, failure rate, OpenAI token usage
- GET /api/v1/admin/share-links - List public links
- DELETE /api/v1/admin/share-links/{id} - Take down an abusive public link

**Frontend Pages:**
- /admin - Admin dashboard (protected, admin only)
- /admin/users - User management
- /admin/share-links - Public link moderation

---

## MVP SCOPE

### Must Have (MVP)
- [x] User registration and login (email/password + Google)
- [x] Submit code by paste or file/zip upload, with assignment brief
- [x] OpenAI roast with score, headline, summary, issues + fixes, strengths
- [x] Public share links (create, copy, revoke, public /r/{slug} page)
- [x] Basic dashboard listing my submissions and roasts

### Nice to Have (Post-MVP)
- [ ] Intensity selector UI (MVP uses Medium by default; model + API support all three from day one)
- [ ] Full roast history and re-roast comparison
- [ ] Admin panel
- [ ] Progress analytics (score trend, recurring mistake categories)
- [ ] Email notifications
- [ ] Payments / paid tier with higher roast limits

---

## ACCEPTANCE CRITERIA

### Authentication
- [ ] User can register with email/password
- [ ] User can login with email/password
- [ ] User can sign up / login with Google OAuth (state parameter verified)
- [ ] JWT tokens work correctly with refresh
- [ ] Protected routes redirect to login

### Submissions
- [ ] User can create a submission by pasting code
- [ ] User can upload files or a .zip; disallowed types/oversized files are rejected with clear errors
- [ ] Zip path traversal attempts are rejected
- [ ] Users can only see, edit and delete their own submissions (404 for others)

### Roasts
- [ ] Requesting a roast returns a structured result with score 0-100, headline, summary, issues, strengths
- [ ] Intensity (mild/medium/savage) changes tone but every issue includes a suggested fix
- [ ] Invalid/failed OpenAI responses mark the roast `failed` with a user-friendly message
- [ ] Daily roast limit enforced (429 when exceeded)
- [ ] OpenAI is mocked in tests (no real API calls in CI)

### Sharing
- [ ] Owner can create a share link and copy its URL
- [ ] /r/{slug} renders the roast without login
- [ ] Code is hidden publicly unless `show_code` is enabled
- [ ] Revoked or expired links return 404
- [ ] View count increments on public view

### Admin Panel
- [ ] Only `is_admin` users can access /admin endpoints and pages (403 otherwise)
- [ ] Admin can deactivate users and take down share links

### Quality
- [ ] All API endpoints documented in OpenAPI
- [ ] Backend test coverage 80%+
- [ ] Frontend TypeScript strict mode passes
- [ ] Docker builds and runs successfully

---

## SPECIAL REQUIREMENTS

### Security
- [x] Rate limiting on auth endpoints and roast creation
- [x] Input validation on all endpoints
- [x] SQL injection prevention (SQLAlchemy ORM only)
- [x] XSS prevention (code rendered as text / escaped in syntax highlighter; AI output never rendered as raw HTML)
- [x] CSRF protection via OAuth state parameter
- [x] Uploaded code never executed; safe zip extraction
- [x] Prompt-injection resistant prompts; AI output schema-validated
- [x] Share slugs are unguessable random tokens

### Integrations
- [x] OpenAI API for roast generation
- [x] File upload storage (local disk in dev via `UPLOAD_DIR`; S3-compatible storage later)
- [ ] Email service for notifications (post-MVP)
- [ ] Payments (not needed)

---

## AGENTS

> These agents will build the product:

| Agent | Role | Works On |
|-------|------|----------|
| DATABASE-AGENT | Creates all models and migrations | User, RefreshToken, Submission, SubmissionFile, Roast, ShareLink |
| BACKEND-AGENT | Builds API endpoints and services | Auth, uploads, OpenAI roast service, sharing, admin |
| FRONTEND-AGENT | Creates UI pages and components | All pages incl. public /r/{slug} |
| DEVOPS-AGENT | Sets up Docker, CI/CD, environments | Infrastructure |
| TEST-AGENT | Writes unit and integration tests | All code (OpenAI mocked) |
| REVIEW-AGENT | Security and code quality audit | All code |

---

# READY?

```bash
/generate-prp INITIAL.md
```

Then:

```bash
/execute-prp PRPs/assignment-roaster-prp.md
```
