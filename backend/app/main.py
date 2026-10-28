from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import create_engine, Column, Integer, String, Text, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, date, time, timedelta
from pathlib import Path
from dotenv import load_dotenv
import os, secrets, hashlib, re, json, asyncio
import fitz
from docx import Document as DocxDocument
import httpx
import urllib.request
import urllib.error

load_dotenv()
BASE = Path(__file__).resolve().parent.parent
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(BASE / "uploads")))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD = int(os.getenv("MAX_UPLOAD_MB", "10")) * 1024 * 1024
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE / 'lifemate.db'}")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()
pwd = CryptContext(schemes=["argon2"], deprecated="auto")
app = FastAPI(title="LifeMate AI API", version="1.0.0", description="Multi-Agent Personal Assistant API")
app.add_middleware(CORSMiddleware, allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

class User(Base):
    __tablename__="users"
    id=Column(Integer, primary_key=True); username=Column(String(60), unique=True, index=True, nullable=False)
    email=Column(String(255), unique=True, index=True, nullable=False); password_hash=Column(String(255), nullable=False)
    created_at=Column(DateTime, default=datetime.utcnow)

class SessionToken(Base):
    __tablename__="sessions"
    id=Column(Integer, primary_key=True); token_hash=Column(String(64), unique=True, index=True, nullable=False)
    user_id=Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False); expires_at=Column(DateTime, nullable=False)

class Doc(Base):
    __tablename__="documents"
    id=Column(Integer, primary_key=True); user_id=Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    filename=Column(String(255), nullable=False); stored_name=Column(String(255), nullable=False)
    extracted_text=Column(Text, default=""); summary=Column(Text, default=""); created_at=Column(DateTime, default=datetime.utcnow)

class Note(Base):
    __tablename__="notes"
    id=Column(Integer, primary_key=True); user_id=Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    title=Column(String(200), nullable=False); content=Column(Text, default=""); updated_at=Column(DateTime, default=datetime.utcnow)

class Medication(Base):
    __tablename__="medications"
    id=Column(Integer, primary_key=True); user_id=Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    name=Column(String(200), nullable=False); dosage=Column(String(120), default=""); instructions=Column(Text, default="")
    times=Column(String(500), default="09:00"); start_date=Column(String(10), default=lambda: date.today().isoformat())
    end_date=Column(String(10), default=""); active=Column(Boolean, default=True); last_taken_date=Column(String(10), default="")
    created_at=Column(DateTime, default=datetime.utcnow)

class MedLog(Base):
    __tablename__="med_logs"
    id=Column(Integer, primary_key=True); user_id=Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    medication_id=Column(Integer, ForeignKey("medications.id"), nullable=False); scheduled_date=Column(String(10), nullable=False)
    scheduled_time=Column(String(5), nullable=False); status=Column(String(20), default="pending"); updated_at=Column(DateTime, default=datetime.utcnow)

class Expense(Base):
    __tablename__="expenses"
    id=Column(Integer, primary_key=True); user_id=Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    amount=Column(Float, nullable=False); category=Column(String(80), default="Other"); description=Column(String(250), default="")
    payment_method=Column(String(60), default=""); expense_date=Column(String(10), default=lambda: date.today().isoformat())
    created_at=Column(DateTime, default=datetime.utcnow)

class Budget(Base):
    __tablename__="budgets"
    id=Column(Integer, primary_key=True); user_id=Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    daily_limit=Column(Float, default=1000.0)

class Task(Base):
    __tablename__="tasks"
    id=Column(Integer, primary_key=True); user_id=Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    title=Column(String(250), nullable=False); description=Column(Text, default=""); due_date=Column(String(10), default=lambda: date.today().isoformat())
    due_time=Column(String(5), default="17:00"); priority=Column(String(20), default="Medium"); status=Column(String(20), default="Pending")
    reminder_at=Column(String(16), default=""); reminded=Column(Boolean, default=False); created_at=Column(DateTime, default=datetime.utcnow)

class CalendarEvent(Base):
    __tablename__="calendar_events"
    id=Column(Integer, primary_key=True); user_id=Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    title=Column(String(250), nullable=False); event_date=Column(String(10), nullable=False); event_time=Column(String(5), default="")
    category=Column(String(40), default="Event"); details=Column(Text, default="")

class Notification(Base):
    __tablename__="notifications"
    id=Column(Integer, primary_key=True); user_id=Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    title=Column(String(200), nullable=False); message=Column(Text, nullable=False); category=Column(String(40), default="general")
    is_read=Column(Boolean, default=False); dedupe_key=Column(String(250), default=""); created_at=Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(bind=engine)

def get_db():
    db=SessionLocal()
    try: yield db
    finally: db.close()

def token_hash(token): return hashlib.sha256(token.encode()).hexdigest()

def current_user(authorization: Optional[str] = Header(default=None), db: Session = Depends(get_db)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Please log in.")
    token=authorization.split(" ",1)[1].strip()
    sess=db.query(SessionToken).filter_by(token_hash=token_hash(token)).first()
    if not sess or sess.expires_at < datetime.utcnow():
        raise HTTPException(401, "Session expired. Please log in again.")
    user=db.query(User).filter_by(id=sess.user_id).first()
    if not user: raise HTTPException(401, "User not found.")
    return user

def user_required(obj, user, message="Record not found"):
    if not obj or obj.user_id != user.id: raise HTTPException(404, message)
    return obj

def notify(db, user_id, title, message, category, dedupe_key=""):
    if dedupe_key and db.query(Notification).filter_by(user_id=user_id, dedupe_key=dedupe_key).first(): return
    db.add(Notification(user_id=user_id,title=title,message=message,category=category,dedupe_key=dedupe_key))

class AuthIn(BaseModel):
    username: str
    password: str
    email: Optional[EmailStr] = None
class LoginIn(BaseModel):
    username: str
    password: str
class NoteIn(BaseModel): title: str; content: str = ""
class MedicationIn(BaseModel):
    name: str; dosage: str = ""; instructions: str = ""; times: str = "09:00"; start_date: str = ""; end_date: str = ""; active: bool = True
class MedStatusIn(BaseModel): status: str
class ExpenseIn(BaseModel):
    amount: float; category: str = "Other"; description: str = ""; payment_method: str = ""; expense_date: str = ""
class BudgetIn(BaseModel): daily_limit: float
class TaskIn(BaseModel):
    title: str; description: str = ""; due_date: str = ""; due_time: str = "17:00"; priority: str = "Medium"; status: str = "Pending"; reminder_at: str = ""
class EventIn(BaseModel):
    title: str; event_date: str; event_time: str = ""; category: str = "Event"; details: str = ""
class ChatIn(BaseModel):
    message: str
    language: str = "en-IN"
class ReadIn(BaseModel): is_read: bool

@app.get("/api/health")
def health(): return {"status":"ok","app":"LifeMate AI"}

@app.post("/api/auth/register")
def register(data: AuthIn, db: Session=Depends(get_db)):
    username=data.username.strip()
    if len(username)<3 or len(data.password)<8: raise HTTPException(400,"Username must be at least 3 characters and password at least 8 characters.")
    email=str(data.email).lower() if data.email else f"{username.lower()}@local.lifemate"
    if db.query(User).filter((User.username==username)|(User.email==email)).first(): raise HTTPException(409,"Username or email already exists.")
    u=User(username=username,email=email,password_hash=pwd.hash(data.password)); db.add(u); db.commit(); db.refresh(u)
    db.add(Budget(user_id=u.id,daily_limit=1000)); token=secrets.token_urlsafe(32)
    db.add(SessionToken(user_id=u.id,token_hash=token_hash(token),expires_at=datetime.utcnow()+timedelta(days=7))); db.commit()
    return {"token":token,"user":{"id":u.id,"username":u.username,"email":u.email}}

@app.post("/api/auth/login")
def login(data: LoginIn, db: Session=Depends(get_db)):
    u=db.query(User).filter(User.username==data.username.strip()).first()
    if not u or not pwd.verify(data.password,u.password_hash): raise HTTPException(401,"Invalid username or password.")
    token=secrets.token_urlsafe(32); db.add(SessionToken(user_id=u.id,token_hash=token_hash(token),expires_at=datetime.utcnow()+timedelta(days=7))); db.commit()
    return {"token":token,"user":{"id":u.id,"username":u.username,"email":u.email}}

@app.post("/api/auth/logout")
def logout(user: User=Depends(current_user), authorization: str=Header(...), db: Session=Depends(get_db)):
    token=authorization.split(" ",1)[1].strip()
    db.query(SessionToken).filter_by(token_hash=token_hash(token),user_id=user.id).delete(); db.commit()
    return {"ok":True}
@app.get("/api/me")
def me(user: User=Depends(current_user)): return {"id":user.id,"username":user.username,"email":user.email}

def extract_text(filename, raw):
    ext=Path(filename).suffix.lower()
    if ext==".txt": return raw.decode("utf-8",errors="replace")
    if ext==".pdf":
        with fitz.open(stream=raw,filetype="pdf") as pdf: return "\n".join(p.get_text() for p in pdf)
    if ext==".docx":
        import io
        doc=DocxDocument(io.BytesIO(raw))
        return "\n".join(p.text for p in doc.paragraphs)
    raise HTTPException(415,"Only PDF, DOCX, and TXT files are supported.")

async def summarize(text):
    key=os.getenv("GEMINI_API_KEY")
    if key and text.strip():
        try:
            model=os.getenv("GEMINI_MODEL","gemini-2.0-flash")
            async with httpx.AsyncClient(timeout=20) as client:
                r=await client.post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}",
                    json={"contents":[{"parts":[{"text":"Summarize the following document accurately. Use headings and key points. Do not add facts absent from the source.\n\n"+text[:80000]}]}]})
                r.raise_for_status()
                return r.json()["candidates"][0]["content"]["parts"][0]["text"]
        except Exception:
            pass
    words=re.findall(r"\S+",text)
    if not words: return "No readable text was found. This may be a scanned PDF requiring OCR."
    sentences=re.split(r"(?<=[.!?])\s+",text.strip())
    summary=" ".join(s.strip() for s in sentences[:5] if s.strip())
    if len(summary)>1800: summary=summary[:1800].rsplit(" ",1)[0]+"…"
    return "Local quick summary (configure GEMINI_API_KEY for AI summarization):\n\n"+summary

@app.post("/api/documents/upload")
async def upload_document(file: UploadFile=File(...), user: User=Depends(current_user), db: Session=Depends(get_db)):
    filename=Path(file.filename or "document.txt").name
    if Path(filename).suffix.lower() not in [".pdf",".docx",".txt"]: raise HTTPException(415,"Only PDF, DOCX, and TXT files are supported.")
    raw=await file.read()
    if len(raw)>MAX_UPLOAD: raise HTTPException(413,f"File exceeds {MAX_UPLOAD//(1024*1024)} MB limit.")
    text=extract_text(filename,raw)
    stored=f"{user.id}_{secrets.token_hex(12)}{Path(filename).suffix.lower()}"
    (UPLOAD_DIR/stored).write_bytes(raw)
    summary=await summarize(text)
    doc=Doc(user_id=user.id,filename=filename,stored_name=stored,extracted_text=text,summary=summary)
    db.add(doc); db.commit(); db.refresh(doc)
    return doc_out(doc)

def doc_out(d): return {"id":d.id,"filename":d.filename,"summary":d.summary,"text_preview":d.extracted_text[:1200],"created_at":d.created_at.isoformat()}
@app.get("/api/documents")
def list_docs(user: User=Depends(current_user),db: Session=Depends(get_db)):
    return [doc_out(x) for x in db.query(Doc).filter_by(user_id=user.id).order_by(Doc.created_at.desc()).all()]
@app.get("/api/documents/{doc_id}")
def get_doc(doc_id:int,user:User=Depends(current_user),db:Session=Depends(get_db)):
    d=user_required(db.query(Doc).filter_by(id=doc_id).first(),user)
    return {**doc_out(d),"text":d.extracted_text}
@app.get("/api/documents/{doc_id}/download")
def download_doc(doc_id:int,user:User=Depends(current_user),db:Session=Depends(get_db)):
    d=user_required(db.query(Doc).filter_by(id=doc_id).first(),user)
    p=UPLOAD_DIR/d.stored_name
    if not p.exists(): raise HTTPException(404,"Stored file missing.")
    return FileResponse(p,filename=d.filename)
@app.delete("/api/documents/{doc_id}")
def delete_doc(doc_id:int,user:User=Depends(current_user),db:Session=Depends(get_db)):
    d=user_required(db.query(Doc).filter_by(id=doc_id).first(),user)
    (UPLOAD_DIR/d.stored_name).unlink(missing_ok=True); db.delete(d); db.commit(); return {"ok":True}

@app.post("/api/documents/{doc_id}/ask")
async def ask_doc(
    doc_id: int,
    data: ChatIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db)
):
    d = user_required(
        db.query(Doc).filter_by(id=doc_id).first(),
        user
    )

    question = data.message.strip()
    document_text = d.extracted_text or ""

    if not question:
        raise HTTPException(400, "Please enter a question.")

    if not document_text.strip():
        return {
            "answer": "This document contains no readable text.",
            "source": d.filename
        }

    # Use Gemini when an API key is configured.
    key = os.getenv("GEMINI_API_KEY")

    if key:
        try:
            model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

            prompt = f"""
You are LifeMate AI's Document Agent.

Answer the user's question using ONLY the supplied document.
Give a direct, concise answer to the specific question.
For lists, include the relevant items and dates.
If the document does not contain the answer, say:
"I couldn't find that information in this document."
Never invent facts.

DOCUMENT:
{document_text[:80000]}

USER QUESTION:
{question}
"""

            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}",
                    json={
                        "contents": [
                            {"parts": [{"text": prompt}]}
                        ],
                        "generationConfig": {
                            "temperature": 0.1,
                            "maxOutputTokens": 500
                        }
                    }
                )

                response.raise_for_status()
                result = response.json()
                answer = result["candidates"][0]["content"]["parts"][0]["text"].strip()

                return {
                    "answer": answer,
                    "source": d.filename
                }

        except Exception:
            pass

    # Fallback when Gemini is not configured or unavailable.
    q = question.lower()

    patterns = [
        (["project name", "name of the project"],
         r"Project Name:\s*([^\n]+)"),
        (["project deadline", "deadline for the project"],
         r"Project Deadline:\s*([^\n]+)"),
        (["project owner", "who owns the project", "owner of the project"],
         r"Project Owner:\s*([^\n]+)"),
        (["total planned budget", "planned budget", "budget for november"],
         r"Total planned budget:\s*([^\n]+)"),
        (["main project risk", "main risk", "risk identified", "meeting risk"],
         r"Risk:\s*([^\n]+)"),
    ]

    for keywords, pattern in patterns:
        if any(keyword in q for keyword in keywords):
            match = re.search(pattern, document_text, re.IGNORECASE)
            if match:
                return {
                    "answer": match.group(1).strip(),
                    "source": d.filename
                }

    # Extract the most relevant sentences as a fallback.
    terms = [
        word.lower()
        for word in re.findall(r"\w+", question)
        if len(word) > 3
    ]

    sentences = re.split(r"(?<=[.!?])\s+|\n+", document_text)
    scored = []

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue

        sentence_lower = sentence.lower()
        score = sum(
            1 for term in terms
            if term in sentence_lower
        )

        if score:
            scored.append((score, sentence))

    scored.sort(key=lambda item: item[0], reverse=True)
    relevant = [sentence for _, sentence in scored[:3]]

    answer = (
        " ".join(relevant)
        if relevant
        else "I couldn't find that information in this document."
    )

    return {
        "answer": answer,
        "source": d.filename
    }

@app.get("/api/notes")
def notes(user:User=Depends(current_user),db:Session=Depends(get_db)):
    return [{"id":n.id,"title":n.title,"content":n.content,"updated_at":n.updated_at.isoformat()} for n in db.query(Note).filter_by(user_id=user.id).order_by(Note.updated_at.desc()).all()]
@app.post("/api/notes")
def create_note(data:NoteIn,user:User=Depends(current_user),db:Session=Depends(get_db)):
    n=Note(user_id=user.id,title=data.title.strip(),content=data.content); db.add(n); db.commit(); db.refresh(n); return {"id":n.id,"title":n.title,"content":n.content}
@app.put("/api/notes/{note_id}")
def update_note(note_id:int,data:NoteIn,user:User=Depends(current_user),db:Session=Depends(get_db)):
    n=user_required(db.query(Note).filter_by(id=note_id).first(),user); n.title=data.title.strip(); n.content=data.content; n.updated_at=datetime.utcnow(); db.commit(); return {"ok":True}
@app.delete("/api/notes/{note_id}")
def delete_note(note_id:int,user:User=Depends(current_user),db:Session=Depends(get_db)):
    n=user_required(db.query(Note).filter_by(id=note_id).first(),user); db.delete(n); db.commit(); return {"ok":True}

def medication_out(m): return {"id":m.id,"name":m.name,"dosage":m.dosage,"instructions":m.instructions,"times":m.times,"start_date":m.start_date,"end_date":m.end_date,"active":m.active}
@app.get("/api/medications")
def meds(user:User=Depends(current_user),db:Session=Depends(get_db)):
    return [medication_out(m) for m in db.query(Medication).filter_by(user_id=user.id).order_by(Medication.id.desc()).all()]
@app.post("/api/medications")
def add_med(data:MedicationIn,user:User=Depends(current_user),db:Session=Depends(get_db)):
    if not data.name.strip(): raise HTTPException(400,"Medication name is required.")
    m=Medication(user_id=user.id,name=data.name.strip(),dosage=data.dosage,instructions=data.instructions,times=data.times,start_date=data.start_date or date.today().isoformat(),end_date=data.end_date,active=data.active)
    db.add(m); db.commit(); db.refresh(m); return medication_out(m)
@app.put("/api/medications/{med_id}")
def edit_med(med_id:int,data:MedicationIn,user:User=Depends(current_user),db:Session=Depends(get_db)):
    m=user_required(db.query(Medication).filter_by(id=med_id).first(),user)
    for k,v in data.model_dump().items(): setattr(m,k,v)
    db.commit(); return medication_out(m)
@app.delete("/api/medications/{med_id}")
def delete_med(med_id:int,user:User=Depends(current_user),db:Session=Depends(get_db)):
    m=user_required(db.query(Medication).filter_by(id=med_id).first(),user); db.delete(m); db.commit(); return {"ok":True}
@app.get("/api/medications/today")
def med_today(user:User=Depends(current_user),db:Session=Depends(get_db)):
    today=date.today().isoformat(); result=[]
    for m in db.query(Medication).filter_by(user_id=user.id,active=True).all():
        if m.start_date<=today and (not m.end_date or m.end_date>=today):
            for tm in [x.strip() for x in m.times.split(",") if x.strip()]:
                log=db.query(MedLog).filter_by(user_id=user.id,medication_id=m.id,scheduled_date=today,scheduled_time=tm).first()
                result.append({"medication_id":m.id,"name":m.name,"dosage":m.dosage,"time":tm,"status":log.status if log else "pending","log_id":log.id if log else None})
    return result
@app.post("/api/medications/{med_id}/status")
def med_status(med_id:int,data:MedStatusIn,user:User=Depends(current_user),db:Session=Depends(get_db)):
    if data.status not in ["taken","snoozed","missed","pending"]: raise HTTPException(400,"Invalid status.")
    m=user_required(db.query(Medication).filter_by(id=med_id).first(),user)
    tm=datetime.now().strftime("%H:%M"); today=date.today().isoformat()
    log=db.query(MedLog).filter_by(user_id=user.id,medication_id=m.id,scheduled_date=today,scheduled_time=tm).first()
    if not log:
        log=MedLog(user_id=user.id,medication_id=m.id,scheduled_date=today,scheduled_time=tm,status=data.status); db.add(log)
    else: log.status=data.status
    log.updated_at=datetime.utcnow()
    if data.status=="taken": m.last_taken_date=today
    db.commit(); return {"ok":True,"status":data.status}
@app.get("/api/medications/logs")
def med_logs(user:User=Depends(current_user),db:Session=Depends(get_db)):
    return [{"id":x.id,"medication_id":x.medication_id,"scheduled_date":x.scheduled_date,"scheduled_time":x.scheduled_time,"status":x.status} for x in db.query(MedLog).filter_by(user_id=user.id).order_by(MedLog.id.desc()).limit(100).all()]

def expense_out(e): return {"id":e.id,"amount":e.amount,"category":e.category,"description":e.description,"payment_method":e.payment_method,"expense_date":e.expense_date}
@app.get("/api/expenses")
def expenses(user:User=Depends(current_user),db:Session=Depends(get_db)):
    return [expense_out(e) for e in db.query(Expense).filter_by(user_id=user.id).order_by(Expense.expense_date.desc(),Expense.id.desc()).all()]
@app.post("/api/expenses")
def add_expense(data:ExpenseIn,user:User=Depends(current_user),db:Session=Depends(get_db)):
    if data.amount<=0: raise HTTPException(400,"Amount must be greater than zero.")
    e=Expense(user_id=user.id,amount=round(data.amount,2),category=data.category,description=data.description,payment_method=data.payment_method,expense_date=data.expense_date or date.today().isoformat())
    db.add(e); db.flush()
    day_total=sum(x.amount for x in db.query(Expense).filter_by(user_id=user.id,expense_date=e.expense_date).all())
    b=db.query(Budget).filter_by(user_id=user.id).first()
    if b and day_total>b.daily_limit: notify(db,user.id,"Daily budget exceeded",f"Your expenses are ₹{day_total:.2f}, above your ₹{b.daily_limit:.2f} daily limit.","budget",f"budget-{e.expense_date}")
    db.commit(); db.refresh(e); return expense_out(e)
@app.put("/api/expenses/{expense_id}")
def edit_expense(expense_id:int,data:ExpenseIn,user:User=Depends(current_user),db:Session=Depends(get_db)):
    e=user_required(db.query(Expense).filter_by(id=expense_id).first(),user)
    if data.amount<=0: raise HTTPException(400,"Amount must be greater than zero.")
    for k,v in data.model_dump().items():
        if k=="expense_date" and not v: v=date.today().isoformat()
        setattr(e,k,round(v,2) if k=="amount" else v)
    db.commit(); return expense_out(e)
@app.delete("/api/expenses/{expense_id}")
def delete_expense(expense_id:int,user:User=Depends(current_user),db:Session=Depends(get_db)):
    e=user_required(db.query(Expense).filter_by(id=expense_id).first(),user); db.delete(e); db.commit(); return {"ok":True}
@app.get("/api/budget")
def get_budget(user:User=Depends(current_user),db:Session=Depends(get_db)):
    b=db.query(Budget).filter_by(user_id=user.id).first()
    if not b: b=Budget(user_id=user.id,daily_limit=1000); db.add(b); db.commit(); db.refresh(b)
    today=date.today().isoformat(); spent=sum(e.amount for e in db.query(Expense).filter_by(user_id=user.id,expense_date=today).all())
    return {"daily_limit":b.daily_limit,"spent_today":round(spent,2),"remaining":round(b.daily_limit-spent,2)}
@app.put("/api/budget")
def set_budget(data:BudgetIn,user:User=Depends(current_user),db:Session=Depends(get_db)):
    if data.daily_limit<0: raise HTTPException(400,"Budget cannot be negative.")
    b=db.query(Budget).filter_by(user_id=user.id).first()
    if not b: b=Budget(user_id=user.id,daily_limit=data.daily_limit); db.add(b)
    else: b.daily_limit=data.daily_limit
    db.commit(); return {"daily_limit":b.daily_limit}

def task_out(t): return {"id":t.id,"title":t.title,"description":t.description,"due_date":t.due_date,"due_time":t.due_time,"priority":t.priority,"status":t.status,"reminder_at":t.reminder_at,"reminded":t.reminded}
@app.get("/api/tasks")
def tasks(user:User=Depends(current_user),db:Session=Depends(get_db)):
    return [task_out(t) for t in db.query(Task).filter_by(user_id=user.id).order_by(Task.due_date,Task.due_time).all()]
@app.post("/api/tasks")
def add_task(data:TaskIn,user:User=Depends(current_user),db:Session=Depends(get_db)):
    if not data.title.strip(): raise HTTPException(400,"Task title is required.")
    t=Task(user_id=user.id,title=data.title.strip(),description=data.description,due_date=data.due_date or date.today().isoformat(),due_time=data.due_time,priority=data.priority,status=data.status,reminder_at=data.reminder_at)
    db.add(t); db.commit(); db.refresh(t); return task_out(t)
@app.put("/api/tasks/{task_id}")
def edit_task(task_id:int,data:TaskIn,user:User=Depends(current_user),db:Session=Depends(get_db)):
    t=user_required(db.query(Task).filter_by(id=task_id).first(),user)
    for k,v in data.model_dump().items(): setattr(t,k,v)
    t.reminded=False; db.commit(); return task_out(t)
@app.patch("/api/tasks/{task_id}/complete")
def complete_task(task_id:int,user:User=Depends(current_user),db:Session=Depends(get_db)):
    t=user_required(db.query(Task).filter_by(id=task_id).first(),user); t.status="Completed"; db.commit(); return task_out(t)
@app.delete("/api/tasks/{task_id}")
def delete_task(task_id:int,user:User=Depends(current_user),db:Session=Depends(get_db)):
    t=user_required(db.query(Task).filter_by(id=task_id).first(),user); db.delete(t); db.commit(); return {"ok":True}

@app.get("/api/calendar")
def calendar(start:Optional[str]=None,end:Optional[str]=None,user:User=Depends(current_user),db:Session=Depends(get_db)):
    ev=[]
    for t in db.query(Task).filter_by(user_id=user.id).all():
        ev.append({"id":f"task-{t.id}","title":t.title,"date":t.due_date,"time":t.due_time,"category":"Task","status":t.status})
    for m in db.query(Medication).filter_by(user_id=user.id,active=True).all():
        if m.start_date:
            ev.append({"id":f"med-{m.id}","title":f"💊 {m.name}","date":m.start_date,"time":m.times.split(",")[0],"category":"Medication","status":"Scheduled"})
    for e in db.query(CalendarEvent).filter_by(user_id=user.id).all():
        ev.append({"id":f"event-{e.id}","title":e.title,"date":e.event_date,"time":e.event_time,"category":e.category,"status":"Scheduled","details":e.details})
    if start: ev=[e for e in ev if e["date"]>=start]
    if end: ev=[e for e in ev if e["date"]<=end]
    return sorted(ev,key=lambda x:(x["date"],x.get("time","")))
@app.post("/api/calendar")
def add_event(data:EventIn,user:User=Depends(current_user),db:Session=Depends(get_db)):
    e=CalendarEvent(user_id=user.id,title=data.title,event_date=data.event_date,event_time=data.event_time,category=data.category,details=data.details); db.add(e); db.commit(); db.refresh(e)
    return {"id":e.id,"title":e.title,"date":e.event_date,"time":e.event_time,"category":e.category,"details":e.details}
@app.get("/api/notifications")
def notifications(user:User=Depends(current_user),db:Session=Depends(get_db)):
    return [{"id":n.id,"title":n.title,"message":n.message,"category":n.category,"is_read":n.is_read,"created_at":n.created_at.isoformat()} for n in db.query(Notification).filter_by(user_id=user.id).order_by(Notification.created_at.desc()).limit(100).all()]
@app.patch("/api/notifications/{notification_id}")
def read_notification(notification_id:int,data:ReadIn,user:User=Depends(current_user),db:Session=Depends(get_db)):
    n=user_required(db.query(Notification).filter_by(id=notification_id).first(),user); n.is_read=data.is_read; db.commit(); return {"ok":True}
@app.get("/api/dashboard")
def dashboard(user:User=Depends(current_user),db:Session=Depends(get_db)):
    today=date.today().isoformat(); month=today[:7]
    ex=db.query(Expense).filter_by(user_id=user.id).all()
    spent=sum(e.amount for e in ex if e.expense_date==today); monthly=sum(e.amount for e in ex if e.expense_date.startswith(month))
    b=db.query(Budget).filter_by(user_id=user.id).first()
    return {"documents":db.query(Doc).filter_by(user_id=user.id).count(),"medications":db.query(Medication).filter_by(user_id=user.id,active=True).count(),"tasks_pending":db.query(Task).filter_by(user_id=user.id,status="Pending").count(),"spent_today":round(spent,2),"spent_month":round(monthly,2),"daily_limit":b.daily_limit if b else 1000,"expenses_by_category":{cat:round(sum(e.amount for e in ex if e.expense_date.startswith(month) and e.category==cat),2) for cat in set(e.category for e in ex)},"today":today}

def format_time_12h(value):
    formatted = []
    for item in value.split(","):
        item = item.strip()
        try:
            parsed = datetime.strptime(item, "%H:%M")
            formatted.append(parsed.strftime("%I:%M %p").lstrip("0"))
        except ValueError:
            formatted.append(item)
    return ", ".join(formatted)



def translate_with_ollama(text: str, language: str) -> str:
    language_names = {
        "hi": "Hindi",
        "mr": "Marathi",
        "en": "English",
    }

    lang_code = language.lower().split("-")[0]
    target_language = language_names.get(lang_code, "English")

    if lang_code == "en":
        return text

    prompt = (
        f"Translate the following response into natural, clear {target_language}. "
        "Preserve names, dates, numbers, currency amounts, medicine names, "
        "and all factual details. Translate only the response, without "
        "explanations or quotation marks.\n\n"
        f"Response:\n{text}"
    )

    payload = {
        "model": "llama3.2:3b",
        "prompt": prompt,
        "stream": False,
      "options": {
    "temperature": 0,
    "num_predict": 250
}
    }

    try:
        request = urllib.request.Request(
            "http://localhost:11434/api/generate",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        with urllib.request.urlopen(request, timeout=180) as response:
            result = json.loads(response.read().decode("utf-8"))

        return result.get("response", "").strip() or text

    except Exception as exc:
        print(f"Ollama translation failed: {exc}")
        return text

@app.post("/api/chat")

def chat(data: ChatIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = data.message.lower().strip()
    today = date.today().isoformat()
    month = today[:7]

    # Continue with your existing chat logic here

    # Expenses today
    if any(k in q for k in [
        "spent today", "spend today", "expense today",
        "expenses today", "how much money",
        "how much did i spend", "how much have i spent",
        "daily expense", "expense in a day"
    ]):
        total = sum(
            e.amount for e in db.query(Expense).filter_by(
                user_id=user.id, expense_date=today
            ).all()
        )
        answer = f"You have recorded ₹{total:.2f} in expenses today."

    # Expenses this month
    elif "month" in q and any(k in q for k in [
        "expense", "spent", "spending", "money"
    ]):
        total = sum(
            e.amount for e in db.query(Expense).filter_by(
                user_id=user.id
            ).all() if e.expense_date.startswith(month)
        )
        answer = f"Your recorded expenses this month total ₹{total:.2f}."

    # Tasks
    elif any(k in q for k in [
        "pending task", "tasks today", "task today",
        "what tasks", "to-do", "todo"
    ]):
        ts = db.query(Task).filter_by(
            user_id=user.id, status="Pending", due_date=today
        ).all()
        answer = "Today's pending tasks: " + (
            "; ".join(f"{t.title} at {t.due_time}" for t in ts)
            if ts else "none recorded."
        )

    # Medication schedules
    elif any(k in q for k in [
    "medicine today",
    "medicines today",
    "medication today",
    "next medicine",
    "my medicines",
    "my medications",
    "medicines are scheduled",
    "medications are scheduled",
    "what medicines",
    "what medications"
]):
        ms = db.query(Medication).filter_by(
            user_id=user.id, active=True
        ).all()
        answer = "Your active medication schedules: " + (
            "; ".join(
                f"{m.name} ({m.dosage or 'dosage not entered'}) at {m.times}"
                for m in ms
            ) if ms else "no active medication schedules recorded."
        )

    # Documents and notes
    elif any(k in q for k in [
        "document", "summarize", "summary",
        "notes", "uploaded file"
    ]):
        ds = db.query(Doc).filter_by(
            user_id=user.id
        ).order_by(Doc.created_at.desc()).all()
        ns = db.query(Note).filter_by(
            user_id=user.id
        ).order_by(Note.updated_at.desc()).all()

        if ds:
            answer = (
                f"Your latest document is '{ds[0].filename}'. "
                f"Summary: {ds[0].summary[:1000]}"
            )
        elif ns:
            answer = f"Your latest note is '{ns[0].title}': {ns[0].content[:800]}"
        else:
            answer = "You haven't uploaded documents or saved notes yet."

    # Tomorrow's activities
    elif any(k in q for k in ["tomorrow", "calendar", "activities"]):
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        ts = db.query(Task).filter_by(
            user_id=user.id, due_date=tomorrow
        ).all()
        es = db.query(CalendarEvent).filter_by(
            user_id=user.id, event_date=tomorrow
        ).all()
        items = (
            [f"{t.title} at {t.due_time}" for t in ts]
            + [f"{e.title} at {e.event_time}" for e in es]
        )
        answer = "Tomorrow's activities: " + (
            "; ".join(items) if items else "none recorded."
        )

    elif q.startswith("help") or "what can you do" in q:
        answer = (
            "I can look up your recorded expenses, medication schedules, "
            "pending tasks, documents, notes, and tomorrow's activities."
        )

    else:
        answer = (
            "I can help with your saved expenses, tasks, medication schedules, "
            "documents, and calendar. Try asking a specific question about them."
        )

    # Translate standard chatbot responses
   

        
    print("Selected language:", data.language)
    print("Original answer:", answer[:100])
    answer = translate_with_ollama(answer, data.language)
    return {
        "answer": answer,
        "agent": "coordinator",
        "timestamp": datetime.utcnow().isoformat()
    }

    

async def reminder_loop():
    while True:
        try:
            db=SessionLocal(); now=datetime.now(); today=now.date().isoformat(); hm=now.strftime("%H:%M")
            for t in db.query(Task).filter_by(status="Pending",reminded=False).all():
                scheduled=t.reminder_at or (t.due_date+"T"+t.due_time if t.due_date and t.due_time else "")
                if scheduled and scheduled.replace("T"," ")[:16] <= now.strftime("%Y-%m-%d %H:%M"):
                    notify(db,t.user_id,"Task reminder",f"Reminder: {t.title} is due {t.due_date} at {t.due_time}.","task",f"task-{t.id}-{scheduled}")
                    t.reminded=True
            # Create one missing-record alert per medication after 15 consecutive days since last recorded taken date.
            for m in db.query(Medication).filter_by(active=True).all():
                if m.last_taken_date:
                    try: gap=(date.today()-date.fromisoformat(m.last_taken_date)).days
                    except: gap=0
                    if gap>=15:
                        notify(db,m.user_id,"Medication record check-in","You have missed recording your medication for several days. Please consult your doctor if you have concerns.","medical",f"med-gap-{m.id}-{m.last_taken_date}")
            db.commit(); db.close()
        except Exception:
            try: db.close()
            except: pass
        await asyncio.sleep(30)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(reminder_loop())
