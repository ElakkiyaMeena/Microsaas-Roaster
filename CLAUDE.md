# CLAUDE.md - Assignment Roaster Project Rules

> Project-specific rules for Claude Code. This file is read automatically.

---

## Project Overview

**Project Name:** Assignment Roaster
**Description:** Coding bootcamp learners submit assignments (paste or upload) and get an OpenAI-generated "roast": a witty, intensity-controlled, constructive code review with a score and concrete fixes, shareable via a public link.
**Tech Stack:**
- Backend: FastAPI + Python 3.11+
- Frontend: React + TypeScript + Vite
- Database: PostgreSQL + SQLAlchemy + Alembic
- Auth: JWT (access + refresh) + Email/Password + Google OAuth
- UI: Chakra UI + Framer Motion
- AI: OpenAI API

---

## Project Structure

```
assignment-roaster/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models/
│   │   │   ├── user.py            # User, RefreshToken
│   │   │   ├── submission.py      # Submission, SubmissionFile
│   │   │   ├── roast.py           # Roast
│   │   │   └── share_link.py      # ShareLink
│   │   ├── schemas/
│   │   ├── routers/
│   │   │   ├── auth.py
│   │   │   ├── submissions.py
│   │   │   ├── roasts.py
│   │   │   ├── share_links.py
│   │   │   ├── public.py
│   │   │   └── admin.py
│   │   ├── services/
│   │   │   ├── upload_service.py  # validation, safe zip extraction, storage
│   │   │   ├── roast_service.py   # OpenAI prompt + structured output
│   │   │   └── share_service.py
│   │   └── auth/
│   ├── alembic/
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── context/
│   │   └── types/
│   └── package.json
├── .claude/
│   └── commands/
├── skills/
├── agents/
└── PRPs/
```

---

## Code Standards

### Python (Backend)
```python
# ALWAYS use type hints
def get_submission(db: Session, submission_id: int, user_id: int) -> Submission:
    pass

# ALWAYS add docstrings for public functions
async def create_roast(db: Session, submission: Submission, intensity: RoastIntensity) -> Roast:
    """
    Generate a roast for a submission using OpenAI.

    Args:
        db: Database session
        submission: The submission to roast (must belong to current user)
        intensity: mild | medium | savage

    Returns:
        Created Roast object (status completed or failed)
    """
    pass

# Async endpoints
@router.get("/submissions/{id}")
async def read_submission(id: int, db: Session = Depends(get_db)):
    pass
```

### TypeScript (Frontend)
```typescript
// ALWAYS define interfaces for props and data
type RoastIntensity = 'mild' | 'medium' | 'savage';
type IssueSeverity = 'low' | 'medium' | 'high';

interface RoastIssue {
  file: string | null;
  line: number | null;
  severity: IssueSeverity;
  category: string;
  message: string;
  suggestedFix: string;
}

interface Roast {
  id: number;
  submissionId: number;
  intensity: RoastIntensity;
  status: 'pending' | 'completed' | 'failed';
  score: number | null;
  headline: string;
  summary: string;
  issues: RoastIssue[];
  strengths: string[];
  createdAt: string;
}

// NO any types allowed
const fetchRoast = async (id: number): Promise<Roast> => {
  // ...
};
```

---

## Forbidden Patterns

### Backend
- ❌ Never use `print()`; use the `logging` module
- ❌ Never store passwords in plain text; use bcrypt
- ❌ Never hardcode secrets (incl. `OPENAI_API_KEY`); use environment variables
- ❌ Never use `SELECT *`; specify columns
- ❌ Never skip input validation
- ❌ Never execute, import, or eval uploaded code
- ❌ Never call OpenAI from the frontend or in tests (mock it)
- ❌ Never log full submitted code or AI prompts at INFO level

### Frontend
- ❌ Never use `any` type
- ❌ Never leave console.log in production
- ❌ Never skip error handling in async operations
- ❌ Never use inline styles; use Chakra UI style props / theme
- ❌ Never render code or AI output with `dangerouslySetInnerHTML`

---

## Module-Specific Rules

### Submissions Module
- Every submission belongs to a user (`user_id` FK); always filter queries by current user (return 404, not 403, for others' data)
- `source_type` must be one of: `paste`, `upload`
- Upload limits: 1 MB/file, 20 files, 5 MB/zip, 100 KB total text sent to AI (values from config)
- Allow-list file extensions; skip binaries; sanitize filenames; reject zip entries with `..` or absolute paths

### Roasts Module
- `intensity` must be one of: `mild`, `medium`, `savage` (default `medium`)
- `status` must be one of: `pending`, `completed`, `failed`
- `score` is an integer 0–100
- All OpenAI access goes through `services/roast_service.py`
- Request JSON-structured output and validate with a Pydantic schema; retry once, then mark `failed`
- System prompt rules: roast the code, never the person; no slurs/profanity; every issue includes a `suggested_fix`; consider the assignment brief
- Wrap submitted code in clear delimiters and instruct the model to treat it as data (prompt-injection defense)
- Enforce `ROASTS_PER_DAY` per user (HTTP 429 when exceeded)
- Record `model`, `prompt_tokens`, `completion_tokens` on every roast

### Sharing Module
- Slugs generated with `secrets.token_urlsafe` (≥ 10 chars), unique
- Public endpoint `/api/v1/public/roasts/{slug}` requires no auth and returns only whitelisted fields (no email, no user_id)
- Code is excluded from public responses unless `show_code` is true
- Inactive or expired links return 404

### Admin Module
- All `/api/v1/admin/*` routes require `is_admin` (403 otherwise)
- Admins can deactivate users and deactivate/delete share links

---

## API Conventions

- All endpoints prefixed with `/api/v1/`
- Use plural nouns for resources: `/submissions`, `/roasts`, `/share-links`
- Return appropriate HTTP status codes:
  - 200: Success
  - 201: Created
  - 400: Bad Request
  - 401: Unauthorized
  - 403: Forbidden
  - 404: Not Found
  - 409: Conflict
  - 413: Payload Too Large (uploads)
  - 429: Too Many Requests (rate limits)
  - 502: Upstream AI error

---

## Authentication

### JWT Configuration
- Access token expires: 30 minutes
- Refresh token expires: 7 days
- Algorithm: HS256

### OAuth Providers
- Google OAuth 2.0 enabled
- Always verify state parameter for CSRF protection

---

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/assignment_roaster

# Auth
SECRET_KEY=your-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=your-chosen-model
OPENAI_TIMEOUT_SECONDS=60
ROASTS_PER_DAY=10

# Uploads
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_BYTES=1048576
MAX_ZIP_SIZE_BYTES=5242880
MAX_FILES_PER_SUBMISSION=20

# Frontend
VITE_API_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
```

---

## Development Commands

```bash
# Backend
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev

# Docker
docker-compose up -d

# Tests
pytest backend/tests -v
cd frontend && npm test

# Linting
ruff check backend/
cd frontend && npm run lint && npm run type-check
```

---

## Commit Message Format

```
feat([module]): add [feature]
fix([module]): fix [bug]
refactor([module]): refactor [component]
test([module]): add tests for [feature]
docs: update [documentation]
```

Modules: `auth`, `submissions`, `roasts`, `sharing`, `dashboard`, `admin`

---

## Skills Reference

| Task | Skill to Read |
|------|---------------|
| Database models | skills/DATABASE.md |
| API + Auth | skills/BACKEND.md |
| React + UI | skills/FRONTEND.md |
| Testing | skills/TESTING.md |
| Deployment | skills/DEPLOYMENT.md |

---

## Agent Coordination

For complex tasks, the ORCHESTRATOR coordinates:
- DATABASE-AGENT → Backend models
- BACKEND-AGENT → API development
- FRONTEND-AGENT → UI components
- TEST-AGENT → Testing
- REVIEW-AGENT → Code review
- DEVOPS-AGENT → Deployment

Read agent definitions in `/agents/` folder.
