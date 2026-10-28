import React, {useEffect,useMemo,useState} from 'react';
import {Activity, Bell, Bot, CalendarDays, Check, ChevronLeft, ChevronRight, CircleDollarSign, ClipboardList, FileText, HeartPulse, Home, LogOut, Menu, Mic, Plus, Search, Send, Settings, ShieldCheck, Sparkles, Trash2, UploadCloud, UserRound, Wallet, X, CheckCircle2, Clock, TrendingUp, FileUp, MessageCircle} from 'lucide-react';
import {ResponsiveContainer,BarChart,Bar,XAxis,YAxis,Tooltip,CartesianGrid} from 'recharts';

const API = 'https://lifemate-ai-backend.onrender.com/api';
type AnyObj={ [key:string]:any };
function money(n:number){return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(n||0)}
function dateStr(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function App(){
 const [token,setToken]=useState(localStorage.getItem('lm_token')||''); const [user,setUser]=useState<AnyObj|null>(null);
 const [page,setPage]=useState('Dashboard'); const [collapsed,setCollapsed]=useState(false); const [loading,setLoading]=useState(false); const [error,setError]=useState('');
 const [dash,setDash]=useState<AnyObj>({}); const [docs,setDocs]=useState<AnyObj[]>([]); const [notes,setNotes]=useState<AnyObj[]>([]); const [meds,setMeds]=useState<AnyObj[]>([]); const [todayMeds,setTodayMeds]=useState<AnyObj[]>([]); const [expenses,setExpenses]=useState<AnyObj[]>([]); const [budget,setBudget]=useState<AnyObj>({daily_limit:1000,spent_today:0,remaining:1000}); const [tasks,setTasks]=useState<AnyObj[]>([]); const [events,setEvents]=useState<AnyObj[]>([]); const [notifications,setNotifications]=useState<AnyObj[]>([]);
 const [chat,setChat]=useState<AnyObj[]>([{role:'assistant',text:'Hi! I’m LifeMate AI. Ask me about your saved tasks, expenses, medicines, documents, or calendar.'}]);
const [message,setMessage]=useState('');
const [language,setLanguage]=useState('en-IN');
 const [authMode,setAuthMode]=useState('login'); const [auth,setAuth]=useState({username:'',password:'',email:''});
 const [modal,setModal]=useState(''); const [editing,setEditing]=useState<AnyObj|null>(null); const [search,setSearch]=useState(''); const [month,setMonth]=useState(new Date()); const [selectedDate,setSelectedDate]=useState(dateStr());
 const [noteDraft,setNoteDraft]=useState({title:'',content:''}); const [docQuestion,setDocQuestion]=useState(''); const [docAnswer,setDocAnswer]=useState('');
 const [expenseDraft,setExpenseDraft]=useState({amount:'',category:'Food',description:'',payment_method:'UPI',expense_date:dateStr()});
 const [taskDraft,setTaskDraft]=useState({title:'',description:'',due_date:dateStr(),due_time:'17:00',priority:'Medium',status:'Pending',reminder_at:''});
 const [medDraft,setMedDraft]=useState({name:'',dosage:'',instructions:'',times:'09:00',start_date:dateStr(),end_date:'',active:true});
 const [budgetDraft,setBudgetDraft]=useState('1000'); const [eventDraft,setEventDraft]=useState({title:'',event_date:dateStr(),event_time:'',category:'Event',details:''});
 const [docFocus,setDocFocus]=useState<AnyObj|null>(null);
 const [monthExpenses,setMonthExpenses]=useState<AnyObj[]>([]);
 const nav=[['Dashboard',Home],['Documents',FileText],['Medical Agent',HeartPulse],['Expense Tracker',Wallet],['Task Scheduler',ClipboardList],['Calendar',CalendarDays],['AI Assistant',Bot],['Notifications',Bell]];
 async function api(path:string,opts:RequestInit={}){
  const headers:any={...(opts.headers||{})}; if(token)headers.Authorization=`Bearer ${token}`;
  if(opts.body && !(opts.body instanceof FormData))headers['Content-Type']='application/json';
  const r=await fetch(API+path,{...opts,headers}); const data= r.status===204?null:await r.json().catch(()=>({detail:'Unexpected server response'}));
  if(!r.ok)throw new Error(data?.detail||'Request failed'); return data;
 }
 async function loadAll(){
  try{const me=await api('/me');setUser(me);
   const [d,n,m,tm,e,b,t,ev,no,da]=await Promise.all([api('/documents'),api('/notes'),api('/medications'),api('/medications/today'),api('/expenses'),api('/budget'),api('/tasks'),api('/calendar'),api('/notifications'),api('/dashboard')]);
   setDocs(d);setNotes(n);setMeds(m);setTodayMeds(tm);setExpenses(e);setBudget(b);setBudgetDraft(String(b.daily_limit));setTasks(t);setEvents(ev);setNotifications(no);setDash(da);
  }catch(e:any){if(String(e.message).toLowerCase().includes('session')||String(e.message).toLowerCase().includes('log in')){logoutLocal()}else setError(e.message)}
 }
 useEffect(()=>{if(token)loadAll()},[token]);
 function logoutLocal(){localStorage.removeItem('lm_token');setToken('');setUser(null)}
 async function logout(){try{await api('/auth/logout',{method:'POST'})}catch{}logoutLocal()}
 async function authSubmit(e:any){e.preventDefault();setError('');setLoading(true);try{const data=await api('/auth/'+authMode,{method:'POST',body:JSON.stringify(authMode==='register'?auth:{username:auth.username,password:auth.password})});localStorage.setItem('lm_token',data.token);setToken(data.token)}catch(e:any){setError(e.message)}finally{setLoading(false)}}
 async function refresh(){await loadAll()}
 async function doAction(fn:()=>Promise<any>){setError('');try{await fn();await refresh()}catch(e:any){setError(e.message)}}
 
async function sendChat(text = message) {
  if (!text.trim()) return;

  setChat(c => [...c, { role: 'user', text }]);
  setMessage('');

  try {
    const r = await api('/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: text,
        language: language
      })
    });

    setChat(c => [...c, { role: 'assistant', text: r.answer }]);
  } catch (e: any) {
    setChat(c => [
      ...c,
      {
        role: 'assistant',
        text: 'I could not reach the assistant service: ' + e.message
      }
    ]);
  }
}

function startVoice(){
  const SR = (window as any).SpeechRecognition ||
             (window as any).webkitSpeechRecognition;

  if (!SR) {
    setError('Voice input is not supported in this browser. Try Chrome or use text input.');
    return;
  }

  const rec = new SR();
  rec.lang = language;
  rec.interimResults = false;
  rec.continuous = false;

  rec.onresult = (e: any) => {
    const spokenText = e.results[0][0].transcript;
    setMessage(spokenText);
  };

  rec.onerror = () => {
    setError('Microphone unavailable. Check browser permission and try again.');
  };

  rec.start();
}

function speak(text: string){
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;

    const voices = window.speechSynthesis.getVoices();
    const matchingVoice = voices.find(
      voice => voice.lang.toLowerCase() === language.toLowerCase()
    );

    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }

    window.speechSynthesis.speak(utterance);
  }
}
{const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;if(!SR){setError('Voice input is not supported in this browser. Try Chrome or use text input.');return}const rec=new SR();rec.lang='en-IN';rec.interimResults=false;rec.onresult=(e:any)=>{const t=e.results[0][0].transcript;setMessage(t);};rec.onerror=()=>setError('Microphone unavailable. Check browser permission.');rec.start()}
 
function startVoice(){
  const SR = (window as any).SpeechRecognition ||
             (window as any).webkitSpeechRecognition;

  if (!SR) {
    setError('Voice input is not supported in this browser. Try Chrome or use text input.');
    return;
  }

  const rec = new SR();
  rec.lang = language;
  rec.interimResults = false;
  rec.continuous = false;

  rec.onresult = (e: any) => {
    const spokenText = e.results[0][0].transcript;
    setMessage(spokenText);
  };

  rec.onerror = () => {
    setError('Microphone unavailable. Check browser permission and try again.');
  };

  rec.start();
}

function speak(text: string){
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;

    const voices = window.speechSynthesis.getVoices();
    const matchingVoice = voices.find(
      voice => voice.lang.toLowerCase() === language.toLowerCase()
    );

    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }

    window.speechSynthesis.speak(utterance);
  }
}

 async function uploadFile(file?:File){if(!file)return;const fd=new FormData();fd.append('file',file);await doAction(async()=>{const r=await fetch(API+'/documents/upload',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:fd});const d=await r.json();if(!r.ok)throw new Error(d.detail||'Upload failed');setDocFocus(d);setPage('Documents')})}
 const filteredDocs=docs.filter(d=>d.filename.toLowerCase().includes(search.toLowerCase()));
 const todayTasks=tasks.filter(t=>t.due_date===dateStr()&&t.status!=='Completed'); const pending=tasks.filter(t=>t.status!=='Completed');
 const monthLabel=month.toLocaleDateString('en-US',{month:'long',year:'numeric'});
 const calendarDays=useMemo(()=>{const first=new Date(month.getFullYear(),month.getMonth(),1);const offset=(first.getDay()+6)%7;const count=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();return [...Array(offset).fill(null),...Array.from({length:count},(_,i)=>i+1)]},[month]);
 const selectedEvents=events.filter(e=>e.date===selectedDate);
 const chartData=useMemo(()=>{const days=[];const now=new Date();for(let i=6;i>=0;i--){const d=new Date(now);d.setDate(now.getDate()-i);const ds=dateStr(d);days.push({day:d.toLocaleDateString('en-US',{weekday:'short'}),spent:expenses.filter(e=>e.expense_date===ds).reduce((a,e)=>a+Number(e.amount),0)})}return days},[expenses]);
 const categories=['Food','Transport','Shopping','Education','Bills','Health','Other'];
 if(!token||!user)return <div className="auth-shell"><div className="auth-card"><div className="brand-mark"><Sparkles size={25}/></div><div className="eyebrow">YOUR PERSONAL AI COMPANION</div><h1>LifeMate <span>AI</span></h1><p className="muted">One calm place for your documents, health reminders, money, and daily plans.</p><form onSubmit={authSubmit} className="auth-form"><label>Username<input required minLength={3} value={auth.username} onChange={e=>setAuth({...auth,username:e.target.value})} placeholder="Choose a username"/></label>{authMode==='register'&&<label>Email (optional)<input type="email" value={auth.email} onChange={e=>setAuth({...auth,email:e.target.value})} placeholder="you@example.com"/></label>}<label>Password<input required minLength={8} type="password" value={auth.password} onChange={e=>setAuth({...auth,password:e.target.value})} placeholder="At least 8 characters"/></label>{error&&<div className="error">{error}</div>}<button className="primary full" disabled={loading}>{loading?'Please wait…':authMode==='login'?'Sign in':'Create account'}</button></form><p className="switch-auth">{authMode==='login'?"New to LifeMate?":"Already have an account?"} <button className="link" onClick={()=>{setAuthMode(authMode==='login'?'register':'login');setError('')}}>{authMode==='login'?'Create account':'Sign in'}</button></p><div className="secure-note"><ShieldCheck size={15}/> Your data is private to your account</div></div><div className="auth-art"><div className="orb orb-one"></div><div className="orb orb-two"></div><div className="art-copy"><div className="mini-pill"><Sparkles size={14}/> PERSONAL ORGANIZATION, REIMAGINED</div><h2>Make space for<br/><em>what matters.</em></h2><p>Documents. Daily habits. Budgets. Your next big idea.<br/>All connected in one thoughtful assistant.</p><div className="art-cards"><div><FileText/><span>Smart documents</span></div><div><HeartPulse/><span>Gentle reminders</span></div><div><TrendingUp/><span>Clearer finances</span></div></div></div></div></div>;
 return <div className="app-shell">
  <aside className={`sidebar ${collapsed?'collapsed':''}`}><div className="brand"><div className="brand-mark"><Sparkles size={21}/></div>{!collapsed&&<div><b>LifeMate <span>AI</span></b><small>PERSONAL ASSISTANT</small></div>}</div><div className="nav-caption">{!collapsed&&'WORKSPACE'}</div><nav>{nav.map(([label,Icon]:any)=><button key={label} className={`nav-item ${page===label?'active':''}`} onClick={()=>setPage(label)} title={label}><Icon size={19}/>{!collapsed&&<span>{label}</span>}{label==='Notifications'&&notifications.some(n=>!n.is_read)&&!collapsed&&<i className="nav-dot"/>}</button>)}</nav><div className="sidebar-bottom"><button className="nav-item" onClick={()=>setPage('Settings')}><Settings size={19}/>{!collapsed&&<span>Settings</span>}</button><div className="profile-mini"><div className="avatar">{user.username?.slice(0,1).toUpperCase()}</div>{!collapsed&&<div className="profile-text"><b>{user.username}</b><small>Personal workspace</small></div>}{!collapsed&&<button className="icon-button" onClick={logout} title="Log out"><LogOut size={16}/></button>}</div></div></aside>
  <main className="main"><header className="topbar"><div className="top-left"><button className="icon-button" onClick={()=>setCollapsed(!collapsed)}><Menu size={20}/></button><div className="breadcrumb">Workspace <span>/</span> <b>{page}</b></div></div><div className="top-actions"><div className="searchbox"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search documents…"/></div><button className="icon-button notification-button" onClick={()=>setPage('Notifications')}><Bell size={19}/>{notifications.some(n=>!n.is_read)&&<i/>}</button><div className="avatar">{user.username?.slice(0,1).toUpperCase()}</div></div></header>
  <div className="content">{error&&<div className="error-banner">{error}<button onClick={()=>setError('')}><X size={15}/></button></div>}
  {page==='Dashboard'&&<><div className="page-heading"><div><div className="eyebrow"> {new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div><h1>Good day, {user.username} <span className="wave">✦</span></h1><p>Here’s your personal overview. Small steps, well organized.</p></div><button className="primary" onClick={()=>setPage('AI Assistant')}><Sparkles size={16}/> Ask LifeMate</button></div>
  <div className="stats-grid"><Stat icon={FileText} label="Documents" value={dash.documents||0} hint="Saved in your library" tint="purple"/><Stat icon={HeartPulse} label="Active medicines" value={dash.medications||0} hint="Schedules to keep in view" tint="rose"/><Stat icon={CircleDollarSign} label="Spent today" value={money(dash.spent_today)} hint={`Limit ${money(dash.daily_limit)}`} tint="green"/><Stat icon={ClipboardList} label="Pending tasks" value={dash.tasks_pending||0} hint="One step at a time" tint="blue"/></div>
  <div className="dashboard-grid"><section className="panel spending-panel"><div className="panel-head"><div><h3>Spending overview</h3><p>Last 7 days · INR</p></div><span className="icon-tile green"><TrendingUp size={18}/></span></div><div className="chart-total"><strong>{money(dash.spent_month||0)}</strong><span>This month</span></div><div className="chart"><ResponsiveContainer width="100%" height={210}><BarChart data={chartData} barSize={24}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ececf4"/><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill:'#8b8da3',fontSize:12}}/><YAxis axisLine={false} tickLine={false} tick={{fill:'#8b8da3',fontSize:11}} width={42}/><Tooltip formatter={(v:any)=>money(Number(v))}/><Bar dataKey="spent" fill="#7467e8" radius={[7,7,2,2]}/></BarChart></ResponsiveContainer></div><button className="text-action" onClick={()=>setPage('Expense Tracker')}>View expense report →</button></section>
  <section className="panel budget-panel"><div className="panel-head"><div><h3>Daily budget</h3><p>Keep spending in balance</p></div><span className="icon-tile green"><Wallet size={18}/></span></div><div className="budget-amount">{money(budget.spent_today)} <span>/ {money(budget.daily_limit)}</span></div><div className="progress"><i style={{width:`${Math.min(100,(budget.spent_today/Math.max(1,budget.daily_limit))*100)}%`}}/></div><div className="budget-foot"><span>{money(Math.max(0,budget.remaining))} remaining</span><button className="text-action" onClick={()=>{setBudgetDraft(String(budget.daily_limit));setModal('budget')}}>Edit limit</button></div><div className="soft-callout"><Sparkles size={16}/><span>{budget.remaining<0?'You are over your daily limit. Review today’s spending.':'You’re all set. Keep an eye on today’s spending.'}</span></div></section>
  <section className="panel"><div className="panel-head"><div><h3>Today’s tasks</h3><p>{todayTasks.length} things on your list</p></div><button className="text-action" onClick={()=>setPage('Task Scheduler')}>View all →</button></div>{todayTasks.slice(0,4).map(t=><div className="list-row" key={t.id}><button className="check-circle" onClick={()=>doAction(()=>api(`/tasks/${t.id}/complete`,{method:'PATCH'}))}><Check size={13}/></button><div className="row-main"><b>{t.title}</b><small><Clock size={12}/> {t.due_time} · {t.priority} priority</small></div><span className={`priority ${t.priority.toLowerCase()}`}>{t.priority}</span></div>)}{!todayTasks.length&&<Empty icon={CheckCircle2} title="Your day is open" desc="Add a task when something needs your attention."/>}<button className="outline full" onClick={()=>{setEditing(null);setTaskDraft({...taskDraft,due_date:dateStr()});setModal('task')}}><Plus size={16}/> Add a task</button></section>
  <section className="panel"><div className="panel-head"><div><h3>Medication reminders</h3><p>Your saved schedules for today</p></div><button className="text-action" onClick={()=>setPage('Medical Agent')}>Manage →</button></div>{todayMeds.slice(0,4).map(m=><div className="list-row" key={`${m.medication_id}-${m.time}`}><span className="med-dot"><HeartPulse size={16}/></span><div className="row-main"><b>{m.name}</b><small>{m.dosage||'Dosage not entered'} · {m.time}</small></div><button className={`tiny-status ${m.status==='taken'?'done':''}`} onClick={()=>doAction(()=>api(`/medications/${m.medication_id}/status`,{method:'POST',body:JSON.stringify({status:m.status==='taken'?'pending':'taken'})}))}>{m.status==='taken'?'Taken':'Mark taken'}</button></div>)}{!todayMeds.length&&<Empty icon={HeartPulse} title="No reminders yet" desc="Add a schedule to keep your routine visible."/>}<button className="outline full" onClick={()=>{setEditing(null);setModal('med')}}><Plus size={16}/> Add medication</button></section></div>
  <section className="quick-section"><div className="section-title"><h3>Quick actions</h3><span>Pick up where you need</span></div><div className="quick-grid"><Quick icon={FileUp} title="Upload document" desc="Summaries & notes" onClick={()=>document.getElementById('quick-upload')?.click()}/><input id="quick-upload" type="file" hidden accept=".pdf,.docx,.txt" onChange={e=>uploadFile(e.target.files?.[0])}/><Quick icon={CircleDollarSign} title="Add expense" desc="Track where it goes" onClick={()=>setModal('expense')}/><Quick icon={ClipboardList} title="Create a task" desc="Plan your next step" onClick={()=>setModal('task')}/><Quick icon={MessageCircle} title="Talk to LifeMate" desc="Ask about your day" onClick={()=>setPage('AI Assistant')}/></div></section></>}
  {page==='Documents'&&<><PageTitle title="Document Agent" desc="Your files, key takeaways, and personal notes in one place." action={<label className="primary upload-btn"><UploadCloud size={17}/> Upload document<input type="file" hidden accept=".pdf,.docx,.txt" onChange={e=>uploadFile(e.target.files?.[0])}/></label>}/><div className="two-col"><section className="panel"><div className="panel-head"><div><h3>Document library</h3><p>PDF, DOCX, and TXT · max 10 MB</p></div></div>{filteredDocs.map(d=><button className={`doc-card ${docFocus?.id===d.id?'selected':''}`} key={d.id} onClick={()=>doAction(async()=>setDocFocus(await api(`/documents/${d.id}`)))}><span className="doc-icon"><FileText/></span><span className="row-main"><b>{d.filename}</b><small>{new Date(d.created_at).toLocaleDateString()} · Summary available</small></span><ChevronRight size={16}/></button>)}{!filteredDocs.length&&<Empty icon={FileText} title="No documents yet" desc="Upload a PDF, Word document, or text file to get started."/>}</section><section className="panel"><div className="panel-head"><div><h3>{docFocus?.filename||'Document summary'}</h3><p>Summary and document Q&A</p></div>{docFocus&&<button className="icon-button danger" onClick={()=>doAction(async()=>{await api(`/documents/${docFocus.id}`,{method:'DELETE'});setDocFocus(null)})}><Trash2 size={16}/></button>}</div>{docFocus?<><div className="summary-box"><div className="summary-label"><Sparkles size={15}/> SUMMARY</div><p>{docFocus.summary||'No summary available.'}</p></div><h4>Ask this document</h4><form className="inline-form" onSubmit={async e=>{e.preventDefault();try{const r=await api(`/documents/${docFocus.id}/ask`,{method:'POST',body:JSON.stringify({message:docQuestion})});setDocAnswer(r.answer)}catch(err:any){setError(err.message)}}}><input value={docQuestion} onChange={e=>setDocQuestion(e.target.value)} placeholder="What are the key points?"/><button className="primary"><Send size={16}/></button></form>{docAnswer&&<div className="answer-box">{docAnswer}</div>}<details className="text-preview"><summary>View extracted text preview</summary><p>{docFocus.text||docFocus.text_preview}</p></details><a className="text-action" href={`${API}/documents/${docFocus.id}/download`} onClick={async e=>{e.preventDefault();try{const r=await fetch(`${API}/documents/${docFocus.id}/download`,{headers:{Authorization:`Bearer ${token}`}});const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=docFocus.filename;a.click();URL.revokeObjectURL(a.href)}catch{setError('Download failed')}}}>Download original ↓</a></>:<Empty icon={Sparkles} title="Select a document" desc="Choose a file to see its summary and ask questions."/>}</section></div><section className="panel notes-panel"><div className="panel-head"><div><h3>My notes</h3><p>Save thoughts and key takeaways</p></div><button className="primary small" onClick={()=>{setEditing(null);setNoteDraft({title:'',content:''});setModal('note')}}><Plus size={15}/> New note</button></div><div className="notes-grid">{notes.map(n=><div className="note-card" key={n.id}><div className="note-head"><b>{n.title}</b><div><button className="icon-button" onClick={()=>{setEditing(n);setNoteDraft({title:n.title,content:n.content});setModal('note')}}>✎</button><button className="icon-button danger" onClick={()=>doAction(()=>api(`/notes/${n.id}`,{method:'DELETE'}))}><Trash2 size={14}/></button></div></div><p>{n.content}</p></div>)}{!notes.length&&<p className="muted">Your saved notes will appear here.</p>}</div></section></>}
  {page==='Medical Agent'&&<><PageTitle title="Medical reminders" desc="A gentle way to keep your prescribed schedule visible." action={<button className="primary" onClick={()=>{setEditing(null);setMedDraft({name:'',dosage:'',instructions:'',times:'09:00',start_date:dateStr(),end_date:'',active:true});setModal('med')}}><Plus size={16}/> Add medication</button>}/><div className="notice"><ShieldCheck size={19}/><span><b>Medication safety</b><br/>Use the schedule provided by your clinician. LifeMate does not diagnose or recommend changing medicines. Ask your doctor or pharmacist how to handle missed doses.</span></div><section className="panel"><div className="panel-head"><div><h3>Today's schedule</h3><p>{todayMeds.length} scheduled occurrence(s)</p></div></div>{todayMeds.map(m=><div className="medication-row" key={`${m.medication_id}-${m.time}`}><span className="med-large"><HeartPulse/></span><div className="row-main"><b>{m.name}</b><small>{m.dosage||'Dosage not specified'} · {m.time}</small><small>{m.status==='taken'?'Recorded as taken':m.status==='snoozed'?'Reminded later':'Awaiting record'}</small></div><button className="outline small" onClick={()=>doAction(()=>api(`/medications/${m.medication_id}/status`,{method:'POST',body:JSON.stringify({status:m.status==='taken'?'pending':'taken'})}))}>{m.status==='taken'?'Undo':'✓ Mark as taken'}</button><button className="icon-button" onClick={()=>doAction(()=>api(`/medications/${m.medication_id}/status`,{method:'POST',body:JSON.stringify({status:'snoozed'})}))} title="Remind me later"><Clock size={16}/></button></div>)}{!todayMeds.length&&<Empty icon={HeartPulse} title="No medication reminders today" desc="Add a schedule when you need one."/>}</section><section className="panel"><div className="panel-head"><div><h3>Medication schedules</h3><p>Only you can see these details</p></div></div><div className="table-wrap"><table><thead><tr><th>Medication</th><th>Dosage</th><th>Times</th><th>Start date</th><th>Status</th><th></th></tr></thead><tbody>{meds.map(m=><tr key={m.id}><td><b>{m.name}</b><small>{m.instructions}</small></td><td>{m.dosage||'—'}</td><td>{m.times}</td><td>{m.start_date}</td><td><span className={`status ${m.active?'success':'neutral'}`}>{m.active?'Active':'Paused'}</span></td><td className="table-actions"><button className="icon-button" onClick={()=>{setEditing(m);setMedDraft({...m});setModal('med')}}>✎</button><button className="icon-button danger" onClick={()=>doAction(()=>api(`/medications/${m.id}`,{method:'DELETE'}))}><Trash2 size={14}/></button></td></tr>)}</tbody></table>{!meds.length&&<Empty icon={HeartPulse} title="No schedules saved" desc="Add a medication schedule to see it here."/>}</div></section></>}
  {page==='Expense Tracker'&&<><PageTitle title="Expense tracker" desc="Understand your spending without the spreadsheet stress." action={<button className="primary" onClick={()=>{setEditing(null);setExpenseDraft({amount:'',category:'Food',description:'',payment_method:'UPI',expense_date:dateStr()});setModal('expense')}}><Plus size={16}/> Add expense</button>}/><div className="stats-grid three"><Stat icon={CircleDollarSign} label="Spent today" value={money(budget.spent_today)} hint="Recorded today" tint="green"/><Stat icon={Wallet} label="Daily budget" value={money(budget.daily_limit)} hint="Your chosen limit" tint="purple"/><Stat icon={TrendingUp} label="This month" value={money(dash.spent_month)} hint="Monthly total" tint="blue"/></div><section className="panel"><div className="panel-head"><div><h3>Daily spending</h3><p>Last seven days</p></div><button className="outline small" onClick={()=>setModal('budget')}>Set daily limit</button></div><div className="chart"><ResponsiveContainer width="100%" height={250}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ececf4"/><XAxis dataKey="day" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false}/><Tooltip formatter={(v:any)=>money(Number(v))}/><Bar dataKey="spent" fill="#7467e8" radius={[7,7,0,0]}/></BarChart></ResponsiveContainer></div></section><section className="panel"><div className="panel-head"><div><h3>Expense history</h3><p>All saved transactions</p></div></div><div className="table-wrap"><table><thead><tr><th>Expense</th><th>Category</th><th>Date</th><th>Payment</th><th>Amount</th><th></th></tr></thead><tbody>{expenses.filter(e=>(e.description+' '+e.category).toLowerCase().includes(search.toLowerCase())).map(e=><tr key={e.id}><td><b>{e.description||e.category}</b></td><td><span className="category-pill">{e.category}</span></td><td>{e.expense_date}</td><td>{e.payment_method||'—'}</td><td><b>{money(e.amount)}</b></td><td className="table-actions"><button className="icon-button" onClick={()=>{setEditing(e);setExpenseDraft({...e,amount:String(e.amount)});setModal('expense')}}>✎</button><button className="icon-button danger" onClick={()=>doAction(()=>api(`/expenses/${e.id}`,{method:'DELETE'}))}><Trash2 size={14}/></button></td></tr>)}</tbody></table>{!expenses.length&&<Empty icon={Wallet} title="No expenses recorded" desc="Add your first expense to see your spending history."/>}</div></section></>}
  {page==='Task Scheduler'&&<><PageTitle title="Task scheduler" desc="Give your priorities a place, and your day a little more structure." action={<button className="primary" onClick={()=>{setEditing(null);setTaskDraft({title:'',description:'',due_date:dateStr(),due_time:'17:00',priority:'Medium',status:'Pending',reminder_at:''});setModal('task')}}><Plus size={16}/> Create task</button>}/><div className="task-tabs"><span>{pending.length} pending</span><span>{tasks.filter(t=>t.status==='Completed').length} completed</span><span>{tasks.filter(t=>t.status!=='Completed'&&t.due_date<dateStr()).length} overdue</span></div><section className="panel"><div className="panel-head"><div><h3>Your tasks</h3><p>Ordered by due date</p></div></div>{tasks.filter(t=>(t.title+' '+t.description).toLowerCase().includes(search.toLowerCase())).map(t=><div className={`task-row ${t.status==='Completed'?'task-complete':''}`} key={t.id}><button className={`check-circle ${t.status==='Completed'?'checked':''}`} onClick={()=>doAction(()=>t.status==='Completed'?api(`/tasks/${t.id}`,{method:'PUT',body:JSON.stringify({...t,status:'Pending'})}):api(`/tasks/${t.id}/complete`,{method:'PATCH'}))}><Check size={13}/></button><div className="row-main"><b>{t.title}</b>{t.description&&<p>{t.description}</p>}<small><CalendarDays size={13}/> {t.due_date} · {t.due_time}</small></div><span className={`priority ${t.priority.toLowerCase()}`}>{t.priority}</span><span className={`status ${t.status==='Completed'?'success':'neutral'}`}>{t.status}</span><button className="icon-button" onClick={()=>{setEditing(t);setTaskDraft({...t});setModal('task')}}>✎</button><button className="icon-button danger" onClick={()=>doAction(()=>api(`/tasks/${t.id}`,{method:'DELETE'}))}><Trash2 size={14}/></button></div>)}{!tasks.length&&<Empty icon={ClipboardList} title="A clean slate" desc="Create a task and keep your next step in sight."/>}</section></>}
  {page==='Calendar'&&<><PageTitle title="Your calendar" desc="A clear view of the things that make up your days." action={<button className="primary" onClick={()=>{setEventDraft({...eventDraft,event_date:selectedDate});setModal('event')}}><Plus size={16}/> Add event</button>}/><div className="calendar-layout"><section className="panel calendar-panel"><div className="calendar-head"><button className="icon-button" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><ChevronLeft/></button><h3>{monthLabel}</h3><button className="icon-button" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}><ChevronRight/></button><button className="outline small" onClick={()=>{setMonth(new Date());setSelectedDate(dateStr())}}>Today</button></div><div className="calendar-grid">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><div className="weekday" key={d}>{d}</div>)}{calendarDays.map((d,i)=>{const ds=d?dateStr(new Date(month.getFullYear(),month.getMonth(),d)):'';const ev=events.filter(e=>e.date===ds);return <button key={i} disabled={!d} className={`calendar-day ${ds===selectedDate?'selected':''} ${ds===dateStr()?'today':''}`} onClick={()=>d&&setSelectedDate(ds)}><span>{d||''}</span>{ev.slice(0,2).map((e,j)=><i key={j} className={`event-dot ${e.category?.toLowerCase()==='medication'?'rose':e.category?.toLowerCase()==='task'?'blue':''}`}>{e.title.slice(0,13)}</i>)}{ev.length>2&&<small>+{ev.length-2} more</small>}</button>})}</div><div className="calendar-legend"><span><i className="event-dot purple-dot"/> Tasks</span><span><i className="event-dot rose"/> Medication</span><span><i className="event-dot blue"/> Events</span></div></section><section className="panel day-panel"><div className="panel-head"><div><h3>{new Date(selectedDate+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</h3><p>{selectedEvents.length} scheduled item(s)</p></div></div>{selectedEvents.map(e=><div className="event-row" key={e.id}><span className={`event-icon ${e.category?.toLowerCase()==='medication'?'rose':''}`}><CalendarDays size={17}/></span><div className="row-main"><b>{e.title}</b><small>{e.time||'Time not set'} · {e.category}</small></div></div>)}{!selectedEvents.length&&<Empty icon={CalendarDays} title="Nothing scheduled" desc="Enjoy the space or add an event for this date."/>}<button className="outline full" onClick={()=>{setEventDraft({...eventDraft,event_date:selectedDate});setModal('event')}}><Plus size={16}/> Add event on this day</button></section></div></>}
  {page==='AI Assistant'&&<><PageTitle title="LifeMate assistant" desc="Ask about your saved information in natural language."/><div className="chat-layout"><section className="panel chat-panel"><div className="chat-header"><div className="bot-avatar"><Bot/></div><div><b>LifeMate AI</b><small><i className="online-dot"/> Connected to your personal workspace</small></div>
<div className="chat-tools">
  <select
    aria-label="Choose language"
    value={language}
    onChange={e => {
      setLanguage(e.target.value);
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }}
  >
    <option value="en-IN">English</option>
    <option value="hi-IN">हिंदी (Hindi)</option>
    <option value="mr-IN">मराठी (Marathi)</option>
  </select>

  <span className="ai-chip">
    <Sparkles size={13}/> Multi-agent
  </span>
</div>
</div><div className="chat-messages">{chat.map((c,i)=><div className={`chat-line ${c.role}`} key={i}><div className="chat-bubble">{c.text}</div>{c.role==='assistant'&&<button className="speak-btn" onClick={()=>speak(c.text)} title="Speak response">🔊</button>}</div>)}</div><form className="chat-composer" onSubmit={e=>{e.preventDefault();sendChat()}}><button type="button" className="icon-button" onClick={startVoice} title="Voice input"><Mic size={18}/></button><input value={message} onChange={e=>setMessage(e.target.value)} placeholder="Ask about tasks, expenses, medicines…"/><button className="primary" disabled={!message.trim()}><Send size={17}/></button></form><div className="chat-footnote">LifeMate answers personal-data questions using your saved records. AI API is optional.</div></section><aside className="suggestions"><h3>Try asking</h3>{['How much did I spend today?','What tasks do I have pending today?','What medicines are scheduled for today?','What activities are scheduled for tomorrow?','Summarize my latest document'].map(q=><button key={q} onClick={()=>sendChat(q)}><MessageCircle size={15}/>{q}<ChevronRight size={15}/></button>)}<div className="notice mini"><ShieldCheck size={17}/><span>Your personal records are only queried within your account.</span></div></aside></div></>}
  {page==='Notifications'&&<><PageTitle title="Notifications" desc="A history of reminders and activity from your workspace." action={<button className="outline" onClick={refresh}>Refresh</button>}/><section className="panel">{notifications.map(n=><div className={`notification-row ${n.is_read?'read':''}`} key={n.id}><span className={`notification-icon ${n.category}`}><Bell size={17}/></span><div className="row-main"><b>{n.title}</b><p>{n.message}</p><small>{new Date(n.created_at).toLocaleString()}</small></div>{!n.is_read&&<button className="outline small" onClick={()=>doAction(()=>api(`/notifications/${n.id}`,{method:'PATCH',body:JSON.stringify({is_read:true})}))}>Mark read</button>}</div>)}{!notifications.length&&<Empty icon={Bell} title="You're all caught up" desc="Reminders and alerts will appear here."/>}</section></>}
  {page==='Settings'&&<><PageTitle title="Settings" desc="Manage your account and daily preferences."/><section className="panel settings-panel"><div className="settings-avatar"><div className="avatar large">{user.username?.slice(0,1).toUpperCase()}</div><div><h3>{user.username}</h3><p>{user.email}</p></div></div><div className="settings-line"><div><b>Account security</b><p>Your records are scoped to your account.</p></div><ShieldCheck color="#3b9b76"/></div><div className="settings-line"><div><b>Daily expense budget</b><p>Current limit: {money(budget.daily_limit)}</p></div><button className="outline small" onClick={()=>setModal('budget')}>Edit</button></div><div className="settings-line"><div><b>Session</b><p>Sign out of this device.</p></div><button className="outline small" onClick={logout}><LogOut size={15}/> Log out</button></div></section></>}
  </div></main>
  {modal&&<Modal title={modal==='task'?(editing?'Edit task':'Create task'):modal==='med'?(editing?'Edit medication':'Add medication'):modal==='expense'?(editing?'Edit expense':'Add expense'):modal==='note'?(editing?'Edit note':'New note'):modal==='budget'?'Daily budget':'Add calendar event'} close={()=>setModal('')}>
   {modal==='task'&&<form className="modal-form" onSubmit={e=>{e.preventDefault();doAction(async()=>{await api('/tasks'+(editing?`/${editing.id}`:''),{method:editing?'PUT':'POST',body:JSON.stringify(taskDraft)});setModal('')})}}><label>Task title<input required value={taskDraft.title} onChange={e=>setTaskDraft({...taskDraft,title:e.target.value})}/></label><label>Description<textarea value={taskDraft.description} onChange={e=>setTaskDraft({...taskDraft,description:e.target.value})}/></label><div className="form-grid"><label>Due date<input type="date" required value={taskDraft.due_date} onChange={e=>setTaskDraft({...taskDraft,due_date:e.target.value})}/></label><label>Due time<input type="time" value={taskDraft.due_time} onChange={e=>setTaskDraft({...taskDraft,due_time:e.target.value})}/></label><label>Priority<select value={taskDraft.priority} onChange={e=>setTaskDraft({...taskDraft,priority:e.target.value})}><option>Low</option><option>Medium</option><option>High</option></select></label><label>Reminder time<input type="datetime-local" value={taskDraft.reminder_at} onChange={e=>setTaskDraft({...taskDraft,reminder_at:e.target.value})}/></label></div><button className="primary full">Save task</button></form>}
   {modal==='med'&&<form className="modal-form" onSubmit={e=>{e.preventDefault();doAction(async()=>{await api('/medications'+(editing?`/${editing.id}`:''),{method:editing?'PUT':'POST',body:JSON.stringify(medDraft)});setModal('')})}}><label>Medication name<input required value={medDraft.name} onChange={e=>setMedDraft({...medDraft,name:e.target.value})}/></label><label>Prescribed dosage<input value={medDraft.dosage} onChange={e=>setMedDraft({...medDraft,dosage:e.target.value})} placeholder="As prescribed"/></label><label>Schedule times<input required value={medDraft.times} onChange={e=>setMedDraft({...medDraft,times:e.target.value})} placeholder="09:00, 21:00"/><small>Use 24-hour times separated by commas.</small></label><label>Instructions<textarea value={medDraft.instructions} onChange={e=>setMedDraft({...medDraft,instructions:e.target.value})}/></label><div className="form-grid"><label>Start date<input type="date" value={medDraft.start_date} onChange={e=>setMedDraft({...medDraft,start_date:e.target.value})}/></label><label>End date (optional)<input type="date" value={medDraft.end_date} onChange={e=>setMedDraft({...medDraft,end_date:e.target.value})}/></label></div><label className="checkbox-label"><input type="checkbox" checked={medDraft.active} onChange={e=>setMedDraft({...medDraft,active:e.target.checked})}/> Schedule is active</label><button className="primary full">Save schedule</button></form>}
   {modal==='expense'&&<form className="modal-form" onSubmit={e=>{e.preventDefault();doAction(async()=>{await api('/expenses'+(editing?`/${editing.id}`:''),{method:editing?'PUT':'POST',body:JSON.stringify({...expenseDraft,amount:Number(expenseDraft.amount)})});setModal('')})}}><label>Amount (₹)<input required min="0.01" step="0.01" type="number" value={expenseDraft.amount} onChange={e=>setExpenseDraft({...expenseDraft,amount:e.target.value})}/></label><label>Description<input value={expenseDraft.description} onChange={e=>setExpenseDraft({...expenseDraft,description:e.target.value})} placeholder="What was it for?"/></label><div className="form-grid"><label>Category<select value={expenseDraft.category} onChange={e=>setExpenseDraft({...expenseDraft,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label>Payment method<select value={expenseDraft.payment_method} onChange={e=>setExpenseDraft({...expenseDraft,payment_method:e.target.value})}><option>UPI</option><option>Cash</option><option>Card</option><option>Net banking</option><option>Other</option></select></label></div><label>Date<input type="date" value={expenseDraft.expense_date} onChange={e=>setExpenseDraft({...expenseDraft,expense_date:e.target.value})}/></label><button className="primary full">Save expense</button></form>}
   {modal==='note'&&<form className="modal-form" onSubmit={e=>{e.preventDefault();doAction(async()=>{await api('/notes'+(editing?`/${editing.id}`:''),{method:editing?'PUT':'POST',body:JSON.stringify(noteDraft)});setModal('')})}}><label>Title<input required value={noteDraft.title} onChange={e=>setNoteDraft({...noteDraft,title:e.target.value})}/></label><label>Note<textarea rows={7} value={noteDraft.content} onChange={e=>setNoteDraft({...noteDraft,content:e.target.value})}/></label><button className="primary full">Save note</button></form>}
   {modal==='budget'&&<form className="modal-form" onSubmit={e=>{e.preventDefault();doAction(async()=>{await api('/budget',{method:'PUT',body:JSON.stringify({daily_limit:Number(budgetDraft)})});setModal('')})}}><p className="muted">Choose the maximum amount you want to spend each day.</p><label>Daily limit (₹)<input required min="0" type="number" step="0.01" value={budgetDraft} onChange={e=>setBudgetDraft(e.target.value)}/></label><button className="primary full">Save budget</button></form>}
   {modal==='event'&&<form className="modal-form" onSubmit={e=>{e.preventDefault();doAction(async()=>{await api('/calendar',{method:'POST',body:JSON.stringify(eventDraft)});setModal('')})}}><label>Event title<input required value={eventDraft.title} onChange={e=>setEventDraft({...eventDraft,title:e.target.value})}/></label><div className="form-grid"><label>Date<input type="date" required value={eventDraft.event_date} onChange={e=>setEventDraft({...eventDraft,event_date:e.target.value})}/></label><label>Time<input type="time" value={eventDraft.event_time} onChange={e=>setEventDraft({...eventDraft,event_time:e.target.value})}/></label></div><label>Type<select value={eventDraft.category} onChange={e=>setEventDraft({...eventDraft,category:e.target.value})}><option>Event</option><option>Personal</option><option>Study</option><option>Deadline</option></select></label><label>Details<textarea value={eventDraft.details} onChange={e=>setEventDraft({...eventDraft,details:e.target.value})}/></label><button className="primary full">Save event</button></form>}
  </Modal>}
 </div>
}
function Stat({icon:Icon,label,value,hint,tint}:any){return <div className="stat-card"><span className={`icon-tile ${tint}`}><Icon size={19}/></span><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></div>}
function PageTitle({title,desc,action}:any){return <div className="page-heading"><div><div className="eyebrow">LIFEMATE WORKSPACE</div><h1>{title}</h1><p>{desc}</p></div>{action}</div>}
function Empty({icon:Icon,title,desc}:any){return <div className="empty"><span><Icon size={23}/></span><b>{title}</b><p>{desc}</p></div>}
function Quick({icon:Icon,title,desc,onClick}:any){return <button className="quick-card" onClick={onClick}><span><Icon size={19}/></span><div><b>{title}</b><small>{desc}</small></div><ChevronRight size={16}/></button>}
function Modal({title,close,children}:any){return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}><div className="modal"><div className="modal-head"><h3>{title}</h3><button className="icon-button" onClick={close}><X size={18}/></button></div>{children}</div></div>}
export default App;
