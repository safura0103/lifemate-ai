# LifeMate AI – Multi-Agent Personal Assistant

A runnable full-stack starter project for a final-year B.Tech IT project. It includes a React + Vite frontend and FastAPI backend with SQLite persistence, password hashing, per-user data isolation, document upload/text extraction, notes, medication schedules, expenses and budgets, tasks, calendar events, notifications, and a central chatbot with rule-based personal-data queries. Optional Gemini/OpenAI-style AI summarization can be configured through an API key; the app remains usable without one.

## Requirements
- Python 3.10+
- Node.js 18+ and npm

## Quick start (Windows / VS Code)

### 1. Backend
Open a terminal in the `lifemate-ai` folder:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

If PowerShell blocks activation, run `Set-ExecutionPolicy -Scope Process Bypass` in that terminal and activate again. Alternatively, use `.\.venv\Scripts\python.exe -m pip install -r requirements.txt` and `.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload`.

API: http://127.0.0.1:8000  
Swagger docs: http://127.0.0.1:8000/docs

### 2. Frontend (open a second terminal)
```powershell
cd frontend
npm install
npm run dev
```
Open the URL printed by Vite, usually http://localhost:5173.

## First use
Register an account on the app's login screen. Each account sees only its own records. For two-user testing, register two separate accounts in separate browser sessions.

## Optional AI
In `backend/.env`, set `GEMINI_API_KEY` and optionally `GEMINI_MODEL`. AI summarization is optional; without a key, a local extractive-style summary is returned. Do not commit `.env` or real keys.

## Important implementation notes
- SQLite is used by default to make local setup simple; this can be migrated to PostgreSQL later.
- The scheduler checks due medication/task reminders periodically while the backend process is running. For production, use a durable job queue and a managed database.
- Browser voice input uses Web Speech API where supported (typically Chromium browsers); text input is always available.
- The 15-day medication alert is deliberately phrased as a missing-record alert, not proof that a medicine was not taken.
- This is an educational project, not a medical device. It does not diagnose or recommend changing prescribed medication.
- Document summaries can take longer than 2–3 seconds depending on file size, network, and AI provider.
- For production deployment, add HTTPS, stronger session/token lifecycle controls, rate limiting, malware scanning, backups, and a durable scheduler.
