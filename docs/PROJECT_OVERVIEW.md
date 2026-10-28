# LifeMate AI Project Overview

## Architecture
React + TypeScript frontend → FastAPI REST API → SQLAlchemy → SQLite (local default). Optional Gemini summarization is server-side. Authentication uses hashed passwords and opaque bearer tokens stored as hashes in the database.

## Main modules
- Document Agent: PDF/DOCX/TXT extraction, summaries, document retrieval Q&A, downloads, notes.
- Medical Agent: medication schedule CRUD, daily schedule, taken/snoozed records, missing-record check-in notification.
- Expense Agent: expense CRUD, INR totals, daily budget and threshold alert.
- Task Agent: task CRUD, status, due dates, reminder scheduler.
- Calendar: events merged from tasks, active medication schedules, and user-created events.
- Coordinator: personal-data question routing with deterministic queries.
- Notifications: persistent in-app records.

## Known limitations to address before production
1. Local reminder scheduler runs inside the backend process and is not a durable distributed queue.
2. Browser push notifications are not implemented as a service worker; alerts are persistent in-app notifications.
3. Medication occurrence logging is a simple MVP and should be expanded to distinguish each scheduled time precisely.
4. Local fallback summaries are extractive, not equivalent to an LLM summary.
5. Document Q&A uses simple keyword sentence retrieval; use chunked embeddings/RAG for more advanced retrieval.
6. Add OCR for scanned PDFs, malware scanning, HTTPS, rate limits, backups, PostgreSQL, and production session lifecycle controls before deployment.
