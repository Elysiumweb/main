import { useEffect, useState, useMemo, useRef } from "react";
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, serverTimestamp, setDoc, getDoc } from "firebase/firestore";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Trash2, CalendarDays, Clock, Edit2, X, Plus, Users, Check } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../lib/i18n";
import { GAMES, ROSTERS } from "../../lib/constants";
import { createNotification, logActivity } from "../../lib/notify";

// ----- helpers -----
const pad = (n) => String(n).padStart(2, "0");
const toDateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromDateKey = (k) => { const [y,m,day] = k.split("-").map(Number); return new Date(y,m-1,day); };
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const parseInput = (s) => s ? new Date(s) : null;

const startOfWeek = (d) => { const nd = new Date(d); const day = nd.getDay(); const diff = nd.getDate() - day + (day===0?-6:1); nd.setDate(diff); nd.setHours(0,0,0,0); return nd; };
const addDays = (d,n) => { const nd = new Date(d); nd.setDate(nd.getDate()+n); return nd; };
const weekDays = (start) => Array.from({length:7},(_,i)=>addDays(start,i));
const monthGrid = (current) => {
  const first = new Date(current.getFullYear(), current.getMonth(), 1);
  const start = startOfWeek(first);
  const days = [];
  for(let i=0;i<42;i++){ days.push(addDays(start,i)); }
  return days;
};
const isSameDay = (a,b)=> a && b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
const isToday = (d)=> isSameDay(d, new Date());

const COLORS = [
  { id: "#D8CA82", name: "Gold", bg: "bg-[#D8CA82]", text: "text-[#111111]" },
  { id: "#4285F4", name: "Blue", bg: "bg-[#4285F4]", text: "text-white" },
  { id: "#0B8043", name: "Green", bg: "bg-[#0B8043]", text: "text-white" },
  { id: "#D50000", name: "Red", bg: "bg-[#D50000]", text: "text-white" },
  { id: "#8E24AA", name: "Purple", bg: "bg-[#8E24AA]", text: "text-white" },
  { id: "#F4511E", name: "Orange", bg: "bg-[#F4511E]", text: "text-white" },
  { id: "#616161", name: "Grey", bg: "bg-[#616161]", text: "text-white" },
];

const HOURS = Array.from({length: 17}, (_,i)=> i+6); // 6h -> 22h

function normalizeEvent(ev){
  // compat old schema: ev.date -> start
  if(ev.start && ev.end) return ev;
  if(ev.date){
    const s = new Date(ev.date);
    if(!isNaN(s.getTime())){
      const e = new Date(s); e.setHours(e.getHours()+1);
      return { ...ev, start: s.toISOString(), end: e.toISOString(), color: ev.color || "#D8CA82" };
    }
  }
  return ev;
}

export default function Planning(){
  const { user, game, roster, isOfficial, canManage, role, displayName } = useAuth();
  const { t, lang } = useLang();
  const [eventsRaw, setEventsRaw] = useState([]);
  const [availDocs, setAvailDocs] = useState([]); // all availabilities in range
  const [view, setView] = useState("week"); // month | week | day
  const [tab, setTab] = useState("calendar"); // calendar | availability
  const [currentDate, setCurrentDate] = useState(new Date());
  const [gameFilter, setGameFilter] = useState(game === "Rocket League" ? "Rocket League" : "all");
  const [rosterFilter, setRosterFilter] = useState(roster || "all");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title:"", description:"", color:"#D8CA82", game: game || "EVA", roster: null, start:"", end:"", allDay:false });
  const [isDraggingAvail, setIsDraggingAvail] = useState(false);
  const dragValueRef = useRef(true);

  const events = useMemo(()=> eventsRaw.map(normalizeEvent), [eventsRaw]);

  const filteredEvents = useMemo(()=>{
    let list = [...events];
    if(!isOfficial){
      list = list.filter(ev => !gameFilter || gameFilter==="all" ? (ev.game===game || ev.game==="global" || !ev.game) : ev.game===gameFilter);
    } else {
      if(gameFilter!=="all") list = list.filter(ev=> ev.game===gameFilter || (gameFilter==="global" && ev.game==="global"));
    }
    // roster filter
    if(rosterFilter!=="all"){
      list = list.filter(ev=> ev.roster===rosterFilter || !ev.roster || ev.game==="global");
    } else {
      // no roster filter: for RL players, default to their own roster
      if(!isOfficial && roster){
        list = list.filter(ev=> !ev.roster || ev.roster===roster || ev.game==="global");
      } else if(!isOfficial){
        list = list.filter(ev=> !ev.roster || ev.game==="global");
      }
    }
    return list;
  }, [events, gameFilter, rosterFilter, game, roster, isOfficial]); // eslint-disable-line react-hooks/exhaustive-deps

  // events by day
  const eventsByDate = useMemo(()=>{
    const map = {};
    filteredEvents.forEach(ev=>{
      if(!ev.start) return;
      const d = new Date(ev.start);
      if(isNaN(d.getTime())) return;
      const key = toDateKey(d);
      if(!map[key]) map[key]=[];
      map[key].push(ev);
    });
    Object.values(map).forEach(arr=> arr.sort((a,b)=> new Date(a.start)-new Date(b.start)));
    return map;
  }, [filteredEvents]);

  // ---- subscriptions ----
  useEffect(()=>{
    const unsub = onSnapshot(collection(db,"events"), (snap)=>{
      const list = snap.docs.map(d=>({id:d.id, ...d.data()}));
      setEventsRaw(list);
    }, console.error);
    return unsub;
  }, []);

  const weekStart = useMemo(()=> startOfWeek(currentDate), [currentDate]);
  const weekEnd = useMemo(()=> addDays(weekStart,6), [weekStart]);
  const weekKeys = useMemo(()=> weekDays(weekStart).map(toDateKey), [weekStart]);

  useEffect(()=>{
    // fetch availabilities for current month + week visible
    // for simplicity, fetch all and filter client-side, small dataset
    const unsub = onSnapshot(collection(db,"availabilities"), (snap)=>{
      setAvailDocs(snap.docs.map(d=>({id:d.id, ...d.data()})));
    }, console.error);
    return unsub;
  }, []);

  const availForWeek = useMemo(()=>{
    const map = {}; // dateKey -> hour -> [{uid, name, game}]
    weekKeys.forEach(k=> map[k]={});
    availDocs.forEach(doc=>{
      if(!weekKeys.includes(doc.date)) return;
      (doc.hours||[]).forEach(h=>{
        if(!map[doc.date][h]) map[doc.date][h]=[];
        map[doc.date][h].push({uid: doc.uid, name: doc.displayName, game: doc.game});
      });
    });
    return map;
  }, [availDocs, weekKeys]);

  const myAvailForWeek = useMemo(()=>{
    const map = {}; // dateKey -> Set(hours)
    weekKeys.forEach(k=> map[k]= new Set());
    availDocs.filter(d=> d.uid===user?.uid).forEach(d=>{
      if(map[d.date]) map[d.date]= new Set(d.hours||[]);
    });
    return map;
  }, [availDocs, weekKeys, user]);

  // ---- event modal ----
  const openNew = (dateObj, hour=null)=>{
    if(!canManage && tab==="calendar") return;
    const d = dateObj ? new Date(dateObj) : new Date(currentDate);
    if(hour!==null) d.setHours(hour,0,0,0);
    else { /* keep time if in day/week view click */ }
    const end = new Date(d); end.setHours(end.getHours()+1);
    setForm({
      title:"",
      description:"",
      color: game==="Rocket League" || gameFilter==="Rocket League" ? "#F4511E" : "#D8CA82",
      game: gameFilter!=="all" ? gameFilter : (game || "EVA"),
      roster: rosterFilter!=="all" ? rosterFilter : (roster || null),
      start: toLocalInput(d),
      end: toLocalInput(end),
      allDay:false,
    });
    setSelectedEvent(null);
    setShowModal(true);
  };

  const openEdit = (ev)=>{
    setSelectedEvent(ev);
    const s = new Date(ev.start);
    const e = new Date(ev.end);
    setForm({
      title: ev.title||"",
      description: ev.description||"",
      color: ev.color||"#D8CA82",
      game: ev.game||"EVA",
      roster: ev.roster||null,
      start: !isNaN(s.getTime()) ? toLocalInput(s) : "",
      end: !isNaN(e.getTime()) ? toLocalInput(e) : "",
      allDay: !!ev.allDay,
    });
    setShowModal(true);
  };

  const closeModal = ()=>{ setShowModal(false); setSelectedEvent(null); };

  const saveEvent = async (e)=>{
    e.preventDefault();
    if(!form.title.trim()){ toast.error(t("planning.noTitle")); return; }
    if(form.game==="Rocket League" && !form.roster){ toast.error(t("planning.rosterRequired")); return; }
    const startDate = parseInput(form.start);
    const endDate = parseInput(form.end);
    if(!startDate || !endDate){ toast.error("Dates invalides"); return; }
    if(endDate <= startDate){ toast.error("Fin doit être après début"); return; }
    try{
      const payload = {
        title: form.title.trim(),
        description: form.description || "",
        color: form.color,
        game: form.game,
        roster: form.roster || null,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        allDay: !!form.allDay,
        updatedAt: serverTimestamp(),
      };
      if(selectedEvent){
        await updateDoc(doc(db,"events", selectedEvent.id), payload);
        logActivity({ game: payload.game, type:"event_updated", label: payload.title, byUid: user.uid, byName: displayName });
        toast.success(t("planning.eventUpdated"));
      } else {
        const docRef = await addDoc(collection(db,"events"), {
          ...payload,
          createdBy: user.uid,
          createdByName: displayName,
          createdAt: serverTimestamp(),
          attendance: {},
        });
        createNotification({ targetRoles:["player","manager","bureau"], targetGame: payload.game, type:"event_new", extra: payload.title, link:"/espace-joueur/planning"});
        logActivity({ game: payload.game, type:"event_created", label: payload.title, byUid: user.uid, byName: displayName });
        toast.success(t("planning.eventCreated"));
      }
      closeModal();
    }catch(err){ console.error(err); toast.error(t("common.error")); }
  };

  const deleteEvent = async ()=>{
    if(!selectedEvent) return;
    if(!window.confirm("Supprimer cet événement ?")) return;
    try{
      await deleteDoc(doc(db,"events", selectedEvent.id));
      logActivity({ game: selectedEvent.game, type:"event_deleted", label: selectedEvent.title, byUid: user.uid, byName: displayName });
      toast.success(t("planning.eventDeleted"));
      closeModal();
    }catch(e){ console.error(e); toast.error(t("common.error")); }
  };

  // ---- availability toggle ----
  const toggleAvailability = async (dateKey, hour, forceValue=null)=>{
    if(!user) return;
    const currentSet = myAvailForWeek[dateKey] || new Set();
    let newSet = new Set(currentSet);
    const shouldAdd = forceValue!==null ? forceValue : !newSet.has(hour);
    if(shouldAdd) newSet.add(hour); else newSet.delete(hour);
    // optimistic local? we rely on Firestore snapshot but also update map quickly by setAvailDocs optimistic?
    const docId = `${user.uid}_${dateKey}`;
    const docRef = doc(db,"availabilities", docId);
    try{
      // if doc doesn't exist, create
      const existing = availDocs.find(d=> d.id===docId);
      const payload = {
        uid: user.uid,
        displayName: displayName,
        game: game || "EVA",
        date: dateKey,
        hours: Array.from(newSet).sort((a,b)=>a-b),
        updatedAt: serverTimestamp(),
      };
      // upsert
      await setDoc(docRef, payload, { merge: true });
      // no toast each click to avoid spam
    }catch(err){ console.error(err); toast.error(t("common.error")); }
  };

  const handleMouseDownAvail = (dateKey, hour)=>{
    const current = myAvailForWeek[dateKey]?.has(hour);
    dragValueRef.current = !current;
    setIsDraggingAvail(true);
    toggleAvailability(dateKey, hour, dragValueRef.current);
  };
  const handleMouseEnterAvail = (dateKey, hour)=>{
    if(!isDraggingAvail) return;
    toggleAvailability(dateKey, hour, dragValueRef.current);
  };
  useEffect(()=>{
    const up = ()=> setIsDraggingAvail(false);
    window.addEventListener("mouseup", up);
    return ()=> window.removeEventListener("mouseup", up);
  }, []);

  const clearMyWeek = async ()=>{
    if(!user) return;
    try{
      for(const dateKey of weekKeys){
        const docId = `${user.uid}_${dateKey}`;
        const ref = doc(db,"availabilities", docId);
        await setDoc(ref, { uid: user.uid, displayName, game: game||"EVA", date: dateKey, hours: [] }, { merge:true });
      }
      toast.success(t("planning.avail.saved"));
    }catch(e){ console.error(e); toast.error(t("common.error")); }
  };

  // ---- rendering helpers ----
  const goPrev = ()=>{
    if(view==="month"){ setCurrentDate(d=> new Date(d.getFullYear(), d.getMonth()-1, 1)); }
    else if(view==="week"){ setCurrentDate(d=> addDays(d,-7)); }
    else { setCurrentDate(d=> addDays(d,-1)); }
  };
  const goNext = ()=>{
    if(view==="month"){ setCurrentDate(d=> new Date(d.getFullYear(), d.getMonth()+1, 1)); }
    else if(view==="week"){ setCurrentDate(d=> addDays(d,7)); }
    else { setCurrentDate(d=> addDays(d,1)); }
  };
  const goToday = ()=> setCurrentDate(new Date());

  const monthLabel = currentDate.toLocaleDateString(lang==="en"?"en-US":"fr-FR", { month:"long", year:"numeric" });
  const weekLabel = `${weekStart.toLocaleDateString(lang==="en"?"en-US":"fr-FR",{day:"numeric", month:"short"})} – ${weekEnd.toLocaleDateString(lang==="en"?"en-US":"fr-FR",{day:"numeric", month:"short", year:"numeric"})}`;
  const dayLabel = currentDate.toLocaleDateString(lang==="en"?"en-US":"fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" });

  // ---- Components ----
  const MiniMonth = ()=>{
    const grid = monthGrid(currentDate);
    return (
      <div className="border border-white/10 bg-[#141414] p-3">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-display uppercase tracking-[0.2em] text-[#f7f7f7]">{monthLabel}</p>
          <div className="flex gap-1">
            <button onClick={goPrev} className="w-6 h-6 flex items-center justify-center hover:bg-white/10 text-[#f7f7f7]/60"><ChevronLeft size={14}/></button>
            <button onClick={goNext} className="w-6 h-6 flex items-center justify-center hover:bg-white/10 text-[#f7f7f7]/60"><ChevronRight size={14}/></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-px">
          {["L","M","M","J","V","S","D"].map((l,i)=><div key={i} className="text-[10px] text-[#f7f7f7]/30 text-center py-1">{l}</div>)}
          {grid.slice(0,35).map((d,i)=>{
            const key = toDateKey(d);
            const isCurMonth = d.getMonth()===currentDate.getMonth();
            const today = isToday(d);
            const hasEv = (eventsByDate[key]?.length||0)>0;
            return (
              <button key={i} onClick={()=> setCurrentDate(d)}
                className={`aspect-square text-[11px] flex flex-col items-center justify-center relative ${isCurMonth?"text-[#f7f7f7]/80":"text-[#f7f7f7]/20"} ${isSameDay(d,currentDate)?"bg-[#D8CA82] text-[#111111] font-bold":"hover:bg-white/10"} ${today && !isSameDay(d,currentDate) ? "ring-1 ring-[#D8CA82]/60":""}`}>
                {d.getDate()}
                {hasEv && <span className="w-1 h-1 rounded-full bg-[#D8CA82] mt-0.5" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const EventPill = ({ev, compact=false})=>{
    const s = new Date(ev.start);
    const e = new Date(ev.end);
    const time = `${pad(s.getHours())}:${pad(s.getMinutes())}`;
    const c = COLORS.find(col=>col.id===ev.color) || COLORS[0];
    return (
      <div onClick={(e)=>{ e.stopPropagation(); openEdit(ev); }}
        className={`flex items-center gap-1.5 px-2 py-1 text-[11px] leading-none cursor-pointer border-l-2 truncate ${compact?"":"mb-1"} hover:brightness-110 transition-all`}
        style={{ backgroundColor: `${ev.color}22`, borderLeftColor: ev.color, color: ev.color===" #D8CA82"? "#D8CA82": ev.color }}
        title={`${ev.title}\n${time} – ${ev.description||""}`}>
        <span className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor: ev.color}} />
        {!compact && <span className="opacity-70 shrink-0">{time}</span>}
        <span className="truncate font-medium text-[#f7f7f7]">{ev.title}</span>
        {ev.roster && <span className="text-[8px] uppercase tracking-widest opacity-50 shrink-0 border border-white/15 px-1">{ev.roster}</span>}
        {ev.game && <span className="ml-auto text-[9px] uppercase tracking-widest opacity-50 shrink-0">{ev.game==="Rocket League"?"RL":ev.game}</span>}
      </div>
    );
  };

  const MonthView = ()=>{
    const grid = monthGrid(currentDate);
    const daysOfWeek = lang==="en" ? ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] : ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
    return (
      <div className="flex-1 flex flex-col bg-[#0e0e0e] border border-white/10 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-white/10 bg-[#141414]">
          {daysOfWeek.map(d=> <div key={d} className="text-[10px] uppercase tracking-[0.3em] text-[#f7f7f7]/40 px-3 py-2 border-r border-white/5 last:border-0">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 grid-rows-6 flex-1 auto-rows-fr">
          {grid.map((d,i)=>{
            const key = toDateKey(d);
            const isCurMonth = d.getMonth()===currentDate.getMonth();
            const today = isToday(d);
            const dayEvents = eventsByDate[key]||[];
            const weekend = [0,6].includes((d.getDay()+6)%7 ? 0:0); // placeholder
            return (
              <div key={i} onClick={()=> { setCurrentDate(d); if(canManage) openNew(d); }}
                className={`relative border-r border-b border-white/[0.07] p-1.5 flex flex-col min-h-[110px] cursor-pointer hover:bg-white/[0.02] transition-colors ${!isCurMonth?"bg-[#0c0c0c]/60":"bg-[#111111]"} ${today?"ring-1 ring-inset ring-[#D8CA82]/40":""}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${today?"bg-[#D8CA82] text-[#111111] font-bold": isCurMonth?"text-[#f7f7f7]/80":"text-[#f7f7f7]/25"}`}>{d.getDate()}</span>
                  {dayEvents.length>3 && <span className="text-[9px] text-[#f7f7f7]/30">+{dayEvents.length-3}</span>}
                </div>
                <div className="mt-1.5 space-y-1 overflow-hidden">
                  {dayEvents.slice(0,3).map(ev=> <EventPill key={ev.id} ev={ev} compact />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const WeekView = ()=>{
    const days = weekDays(weekStart);
    return (
      <div className="flex-1 flex flex-col bg-[#0e0e0e] border border-white/10 overflow-hidden">
        <div className="flex border-b border-white/10 bg-[#141414] shrink-0">
          <div className="w-14 shrink-0 border-r border-white/10" />
          {days.map(d=>{
            const key = toDateKey(d);
            const today = isToday(d);
            return (
              <div key={key} className={`flex-1 px-2 py-3 border-r border-white/5 last:border-0 text-center ${today?"bg-[#D8CA82]/10":""}`}>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#f7f7f7]/40">{d.toLocaleDateString(lang==="en"?"en-US":"fr-FR",{weekday:"short"})}</p>
                <p className={`text-sm font-display font-bold mt-1 w-7 h-7 mx-auto flex items-center justify-center rounded-full ${today?"bg-[#D8CA82] text-[#111111]":"text-[#f7f7f7]"}`}>{d.getDate()}</p>
              </div>
            );
          })}
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="flex">
            <div className="w-14 shrink-0">
              {HOURS.map(h=>(
                <div key={h} className="h-[60px] border-b border-white/[0.06] text-[10px] text-[#f7f7f7]/30 pr-2 text-right pt-1">{pad(h)}:00</div>
              ))}
            </div>
            <div className="flex-1 grid grid-cols-7">
              {days.map(d=>{
                const key = toDateKey(d);
                const dayEvents = eventsByDate[key]||[];
                return (
                  <div key={key} className="relative border-r border-white/5 last:border-0">
                    {HOURS.map(h=>(
                      <div key={h} onClick={()=> { setCurrentDate(d); openNew(d,h); }}
                        className="h-[60px] border-b border-white/[0.06] hover:bg-white/[0.02] cursor-pointer relative group">
                        <div className="absolute inset-x-0 top-1/2 h-px bg-white/[0.03] group-hover:bg-white/10" />
                      </div>
                    ))}
                    {/* events absolute */}
                    <div className="absolute inset-0 pointer-events-none">
                      {dayEvents.map(ev=>{
                        const s = new Date(ev.start);
                        const e = new Date(ev.end);
                        if(isNaN(s.getTime())|| isNaN(e.getTime())) return null;
                        const startHour = s.getHours() + s.getMinutes()/60;
                        const endHour = e.getHours() + e.getMinutes()/60;
                        const top = (startHour - HOURS[0]) * 60;
                        const height = Math.max(22, (endHour - startHour)*60);
                        if(top<0 || top> HOURS.length*60) return null;
                        return (
                          <div key={ev.id} onClick={(e_)=>{ e_.stopPropagation(); openEdit(ev); }}
                            className="absolute left-1 right-1 rounded-[2px] px-2 py-1 cursor-pointer pointer-events-auto overflow-hidden text-[11px] border-l-2 hover:brightness-110 transition-all shadow-sm"
                            style={{ top: `${top}px`, height: `${height}px`, backgroundColor: `${ev.color}26`, borderLeftColor: ev.color, color:"#f7f7f7" }}>
                            <p className="font-semibold truncate leading-tight" style={{color: ev.color}}>{ev.title}</p>
                            <p className="text-[10px] opacity-70 truncate">{pad(s.getHours())}:{pad(s.getMinutes())} – {pad(e.getHours())}:{pad(e.getMinutes())} · {ev.game==="Rocket League"?"RL":ev.game}</p>
                            {ev.description && height>40 && <p className="text-[10px] opacity-50 truncate mt-0.5">{ev.description}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const DayView = ()=>{
    const key = toDateKey(currentDate);
    const dayEvents = eventsByDate[key]||[];
    return (
      <div className="flex-1 flex bg-[#0e0e0e] border border-white/10 overflow-hidden">
        <div className="w-14 shrink-0 bg-[#141414] border-r border-white/10">
          {HOURS.map(h=>(
            <div key={h} className="h-[60px] border-b border-white/[0.06] text-[10px] text-[#f7f7f7]/30 pr-2 text-right pt-1">{pad(h)}:00</div>
          ))}
        </div>
        <div className="flex-1 relative overflow-y-auto">
          {HOURS.map(h=>(
            <div key={h} onClick={()=> openNew(currentDate,h)}
              className="h-[60px] border-b border-white/[0.06] hover:bg-white/[0.02] cursor-pointer" />
          ))}
          <div className="absolute inset-0 pointer-events-none">
            {dayEvents.map(ev=>{
              const s = new Date(ev.start);
              const e = new Date(ev.end);
              const startHour = s.getHours() + s.getMinutes()/60;
              const endHour = e.getHours() + e.getMinutes()/60;
              const top = (startHour - HOURS[0]) * 60;
              const height = Math.max(28, (endHour-startHour)*60);
              return (
                <div key={ev.id} onClick={(e_)=>{ e_.stopPropagation(); openEdit(ev); }}
                  className="absolute left-3 right-6 rounded px-3 py-2 cursor-pointer pointer-events-auto border-l-2"
                  style={{ top:`${top}px`, height:`${height}px`, backgroundColor:`${ev.color}26`, borderLeftColor: ev.color }}>
                  <p className="font-display font-bold text-sm" style={{color: ev.color}}>{ev.title}</p>
                  <p className="text-xs text-[#f7f7f7]/70">{pad(s.getHours())}:{pad(s.getMinutes())} – {pad(e.getHours())}:{pad(e.getMinutes())} · {ev.game} · {ev.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const AvailabilityView = ()=>{
    const days = weekDays(weekStart);
    return (
      <div className="flex-1 flex flex-col border border-white/10 bg-[#0e0e0e] overflow-hidden">
        <div className="p-4 border-b border-white/10 bg-[#141414] flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-[#f7f7f7]/60">
            <div className="w-3 h-3 bg-emerald-500/30 border border-emerald-400" /> {t("planning.avail.legends")}
            <span className="mx-2 text-white/10">|</span>
            <span>{t("planning.avail.hint")}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {canManage && (
              <div className="text-[11px] uppercase tracking-widest text-[#D8CA82] border border-[#D8CA82]/30 px-2.5 py-1">
                <Users size={12} className="inline mr-1" /> Manager • team view activée
              </div>
            )}
            <button onClick={clearMyWeek} className="text-[11px] uppercase tracking-widest border border-white/15 text-[#f7f7f7]/60 hover:text-[#f7f7f7] px-3 py-1.5 transition-colors">
              {t("planning.avail.clear")}
            </button>
          </div>
        </div>
        <div className="flex flex-col overflow-hidden">
          <div className="flex border-b border-white/10 bg-[#141414] shrink-0">
            <div className="w-14 shrink-0 border-r border-white/10" />
            {days.map(d=>{
              const key = toDateKey(d);
              const myCount = myAvailForWeek[key]?.size||0;
              const totalAvailableInDay = Object.values(availForWeek[key]||{}).reduce((acc, arr)=> acc + (arr?.length||0),0);
              const today = isToday(d);
              return (
                <div key={key} className={`flex-1 px-2 py-3 border-r border-white/5 last:border-0 text-center ${today?"bg-[#D8CA82]/10":""}`}>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#f7f7f7]/40">{d.toLocaleDateString(lang==="en"?"en-US":"fr-FR",{weekday:"short"})}</p>
                  <p className={`text-sm font-display font-bold mt-1 w-7 h-7 mx-auto flex items-center justify-center rounded-full ${today?"bg-[#D8CA82] text-[#111111]":"text-[#f7f7f7]"}`}>{d.getDate()}</p>
                  <p className="text-[10px] text-emerald-300 mt-1">{myCount}h dispo • {canManage ? `${totalAvailableInDay} tot`:""}</p>
                </div>
              );
            })}
          </div>
          <div className="flex-1 overflow-y-auto select-none">
            <div className="flex">
              <div className="w-14 shrink-0 bg-[#141414] border-r border-white/10">
                {HOURS.map(h=>(
                  <div key={h} className="h-[42px] border-b border-white/[0.06] text-[10px] text-[#f7f7f7]/30 pr-2 text-right pt-1">{pad(h)}:00</div>
                ))}
              </div>
              <div className="flex-1 grid grid-cols-7">
                {days.map(d=>{
                  const key = toDateKey(d);
                  return (
                    <div key={key} className="border-r border-white/5 last:border-0">
                      {HOURS.map(h=>{
                        const isMine = myAvailForWeek[key]?.has(h);
                        const teamList = availForWeek[key]?.[h] || [];
                        const teamCount = teamList.length;
                        return (
                          <div key={h}
                            onMouseDown={()=> handleMouseDownAvail(key,h)}
                            onMouseEnter={()=> handleMouseEnterAvail(key,h)}
                            className={`h-[42px] border-b border-white/[0.06] cursor-pointer relative group flex items-center justify-center transition-colors
                              ${isMine ? "bg-emerald-500/25 hover:bg-emerald-500/35 border-emerald-400/30" : "hover:bg-white/[0.04] bg-transparent"}`}>
                            {isMine && <Check size={12} className="text-emerald-300 absolute top-1 left-1" />}
                            {isMine && <span className="text-[10px] text-emerald-200/80 uppercase tracking-widest font-bold">Dispo</span>}
                            {canManage && teamCount>0 && (
                              <span className={`absolute bottom-0.5 right-1 text-[9px] px-1 rounded ${isMine ? "bg-emerald-900/60 text-emerald-200" : "bg-[#1A1A1A] text-[#f7f7f7]/50 border border-white/10"}`}>
                                {teamCount}
                              </span>
                            )}
                            {/* tooltip on hover for team */}
                            {canManage && teamCount>0 && (
                              <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-20 hidden group-hover:block bg-[#1A1A1A] border border-white/20 p-2 min-w-[160px] shadow-xl">
                                <p className="text-[10px] uppercase tracking-widest text-[#D8CA82] mb-1">{pad(h)}:00 – {pad(h+1)}:00 • {teamCount} dispo</p>
                                <div className="space-y-1">
                                  {teamList.slice(0,10).map(p=>(
                                    <div key={p.uid} className="text-xs text-[#f7f7f7]/80 flex items-center gap-1.5">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                      {p.name} <span className="text-[9px] opacity-50 ml-auto">{p.game==="Rocket League"?"RL":p.game}</span>
                                    </div>
                                  ))}
                                  {teamList.length>10 && <p className="text-[10px] text-[#f7f7f7]/40">+{teamList.length-10} autres</p>}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#111111] overflow-hidden" data-testid="planning-page">
      {/* top toolbar - google calendar style */}
      <div className="h-[64px] border-b border-white/10 bg-[#0c0c0c] flex items-center px-4 gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={goToday} data-testid="planning-today"
            className="border border-white/20 text-[#f7f7f7] text-xs uppercase tracking-[0.2em] px-4 py-2 hover:border-[#D8CA82] hover:text-[#D8CA82] transition-colors">
            {t("planning.today")}
          </button>
          <div className="flex border border-white/10">
            <button onClick={goPrev} className="w-8 h-8 flex items-center justify-center text-[#f7f7f7]/60 hover:text-[#f7f7f7] hover:bg-white/10 transition-colors"><ChevronLeft size={16}/></button>
            <button onClick={goNext} className="w-8 h-8 flex items-center justify-center text-[#f7f7f7]/60 hover:text-[#f7f7f7] hover:bg-white/10 transition-colors border-l border-white/10"><ChevronRight size={16}/></button>
          </div>
          <h2 className="font-display text-sm md:text-base uppercase tracking-[0.2em] text-[#f7f7f7] ml-3 min-w-[160px]">
            {view==="month" ? monthLabel : view==="week" ? weekLabel : dayLabel}
          </h2>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* tab switcher */}
          <div className="flex border border-white/10 bg-[#141414] p-1">
            <button onClick={()=> setTab("calendar")} data-testid="tab-calendar"
              className={`px-4 py-1.5 text-[11px] uppercase tracking-[0.25em] transition-colors ${tab==="calendar" ? "bg-[#D8CA82] text-[#111111] font-bold" : "text-[#f7f7f7]/50 hover:text-[#f7f7f7]"}`}>
              {t("planning.calendarTab")}
            </button>
            <button onClick={()=> setTab("availability")} data-testid="tab-availability"
              className={`px-4 py-1.5 text-[11px] uppercase tracking-[0.25em] transition-colors ${tab==="availability" ? "bg-[#D8CA82] text-[#111111] font-bold" : "text-[#f7f7f7]/50 hover:text-[#f7f7f7]"}`}>
              {t("planning.availabilityTab")}
            </button>
          </div>

          {/* game filter */}
          <select value={gameFilter} onChange={(e)=> { setGameFilter(e.target.value); setRosterFilter("all"); }} data-testid="planning-game-filter"
            className="bg-[#141414] border border-white/15 text-[#f7f7f7] text-xs px-2.5 py-2 focus:outline-none focus:border-[#D8CA82]">
            <option value="all">Tous les pôles</option>
            {GAMES.map(g=> <option key={g} value={g}>{g}</option>)}
            <option value="global">Global</option>
          </select>

          {/* roster filter - only when game is RL or all */}
          {(gameFilter==="all" || gameFilter==="Rocket League") && (
            <select value={rosterFilter} onChange={(e)=> setRosterFilter(e.target.value)} data-testid="planning-roster-filter"
              className="bg-[#141414] border border-white/15 text-[#f7f7f7] text-xs px-2.5 py-2 focus:outline-none focus:border-[#D8CA82]">
              <option value="all">{t("planning.roster.none")}</option>
              {(ROSTERS["Rocket League"]||[]).map(r=> <option key={r} value={r}>{t(`planning.roster.${r.toLowerCase()}`)}</option>)}
            </select>
          )}

          {/* view switcher - only for calendar tab */}
          {tab==="calendar" && (
            <div className="hidden md:flex border border-white/10 bg-[#141414] p-1">
              {[
                {id:"month", label:t("planning.month")},
                {id:"week", label:t("planning.week")},
                {id:"day", label:t("planning.day")},
              ].map(v=>(
                <button key={v.id} onClick={()=> setView(v.id)} data-testid={`view-${v.id}`}
                  className={`px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] transition-colors ${view===v.id ? "bg-white/10 text-[#f7f7f7]" : "text-[#f7f7f7]/40 hover:text-[#f7f7f7]"}`}>
                  {v.label}
                </button>
              ))}
            </div>
          )}

          {tab==="calendar" && canManage && (
            <button onClick={()=> openNew(currentDate)} data-testid="planning-new-event"
              className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-4 py-2.5 flex items-center gap-2 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow">
              <Plus size={14} /> {t("planning.new")}
            </button>
          )}
        </div>
      </div>

      {/* main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* left sidebar - mini calendar + legend */}
        <aside className="w-[260px] shrink-0 border-r border-white/10 bg-[#0c0c0c] p-4 space-y-4 overflow-y-auto hidden lg:block">
          <MiniMonth />

          {tab==="calendar" ? (
            <>
              <div className="border border-white/10 bg-[#141414] p-4">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#f7f7f7]/40 mb-3 flex items-center gap-2">
                  <CalendarDays size={12} className="text-[#D8CA82]" /> Mes calendriers
                </p>
                <div className="space-y-2">
                  {GAMES.map(g=>(
                    <label key={g} className="flex items-center gap-2 text-xs text-[#f7f7f7]/70 cursor-pointer">
                      <input type="checkbox" checked={gameFilter==="all" || gameFilter===g} onChange={()=> { setGameFilter(gameFilter===g?"all":g); setRosterFilter("all"); }} className="accent-[#D8CA82]" />
                      <span className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: g==="Rocket League"?"#F4511E":"#D8CA82"}} />
                      {g}
                    </label>
                  ))}
                  <label className="flex items-center gap-2 text-xs text-[#f7f7f7]/70 cursor-pointer">
                    <input type="checkbox" checked={gameFilter==="all" || gameFilter==="global"} onChange={()=> { setGameFilter(gameFilter==="global"?"all":"global"); setRosterFilter("all"); }} className="accent-[#D8CA82]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#4285F4]" /> Global
                  </label>
                  {/* roster sub-filters for RL */}
                  {(gameFilter==="all" || gameFilter==="Rocket League") && (
                    <div className="ml-4 mt-2 space-y-1.5 border-l border-white/10 pl-3">
                      <p className="text-[9px] uppercase tracking-[0.2em] text-[#f7f7f7]/30 mb-1">Rosters RL</p>
                      {(ROSTERS["Rocket League"]||[]).map(r=>(
                        <label key={r} className="flex items-center gap-2 text-[11px] text-[#f7f7f7]/60 cursor-pointer">
                          <input type="checkbox" checked={rosterFilter===r} onChange={()=> setRosterFilter(rosterFilter===r?"all":r)} className="accent-[#F4511E]" />
                          <span className="w-2 h-2 rounded-full bg-[#F4511E]/60" />
                          {r}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="border border-white/10 bg-[#141414] p-4">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#f7f7f7]/40 mb-3">Légende couleurs</p>
                <div className="grid grid-cols-2 gap-2">
                  {COLORS.map(c=>(
                    <div key={c.id} className="flex items-center gap-2 text-[11px] text-[#f7f7f7]/60">
                      <span className="w-3 h-3 rounded-sm" style={{backgroundColor:c.id}} /> {c.name}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-[#f7f7f7]/30 mt-4 leading-relaxed">
                  {t("planning.clickToAdd")}. {t("planning.freePlaceholder")}
                </p>
              </div>

              <div className="border border-[#D8CA82]/20 bg-[#D8CA82]/5 p-4">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#D8CA82] mb-2">Raccourci</p>
                <p className="text-xs text-[#f7f7f7]/60 leading-relaxed">
                  Pas de type prédéfini. Écris librement ton titre. Ex: <em className="text-[#D8CA82]">“Scrim RL vs VIT – 21h / Review EVA bind”</em> C’est toi qui décides.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="border border-white/10 bg-[#141414] p-4">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#D8CA82] mb-2">{t("planning.avail.title")}</p>
                <p className="text-xs text-[#f7f7f7]/60 leading-relaxed">{t("planning.avail.subtitle")}</p>
              </div>
              <div className="border border-white/10 bg-[#141414] p-4">
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#f7f7f7]/40 mb-3">{t("planning.avail.mySlots")}</p>
                <div className="space-y-1 text-xs">
                  {weekKeys.map(k=>{
                    const hours = Array.from(myAvailForWeek[k]||[]).sort((a,b)=>a-b);
                    if(hours.length===0) return null;
                    return (
                      <div key={k} className="flex justify-between text-[#f7f7f7]/60">
                        <span>{new Date(k).toLocaleDateString(lang==="en"?"en-US":"fr-FR",{weekday:"short"})}</span>
                        <span className="text-emerald-300">{hours.map(h=>`${pad(h)}h`).join(", ")}</span>
                      </div>
                    );
                  })}
                  {Object.values(myAvailForWeek).every(s=> s.size===0) && <p className="text-[#f7f7f7]/30 italic">Aucun créneau cette semaine</p>}
                </div>
              </div>
              {canManage && (
                <div className="border border-[#D8CA82]/20 bg-[#141414] p-4">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-[#D8CA82] mb-3">{t("planning.avail.teamView")}</p>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {weekKeys.map(k=>{
                      const perHour = availForWeek[k];
                      const total = Object.values(perHour).flat().length;
                      if(total===0) return null;
                      return (
                        <div key={k} className="text-xs">
                          <p className="text-[#f7f7f7]/50 mb-1">{new Date(k).toLocaleDateString(lang==="en"?"en-US":"fr-FR",{weekday:"long", day:"numeric"})}</p>
                          {Object.entries(perHour).sort((a,b)=> Number(a[0])-Number(b[0])).map(([h, list])=>(
                            <div key={h} className="flex justify-between ml-2">
                              <span className="text-[#f7f7f7]/40">{pad(h)}h</span>
                              <span className="text-[#D8CA82]">{list.length} dispo</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </aside>

        {/* center calendar */}
        <main className="flex-1 flex flex-col overflow-hidden p-2 lg:p-3 bg-[#111111]">
          {tab==="calendar" ? (
            <>
              {view==="month" && <MonthView />}
              {view==="week" && <WeekView />}
              {view==="day" && <DayView />}
            </>
          ) : (
            <AvailabilityView />
          )}
        </main>
      </div>

      {/* modal - free writing */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-[560px] bg-[#1A1A1A] border border-white/15 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-1 h-6" style={{backgroundColor: form.color}} />
                <h3 className="font-display text-sm uppercase tracking-[0.25em] text-[#f7f7f7]">{selectedEvent ? t("planning.edit") : t("planning.new")}</h3>
              </div>
              <button onClick={closeModal} className="w-8 h-8 flex items-center justify-center text-[#f7f7f7]/40 hover:text-[#f7f7f7] hover:bg-white/10 transition-colors"><X size={16}/></button>
            </div>

            <form onSubmit={saveEvent} className="p-6 space-y-5">
              <div>
                <label className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 mb-2 block">{t("planning.title")} *</label>
                <input value={form.title} onChange={e=> setForm(f=>({...f,title:e.target.value}))}
                  placeholder={t("planning.freePlaceholder")}
                  required
                  className="w-full bg-[#111111] border border-white/15 px-4 py-3 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82] placeholder:text-[#f7f7f7]/20" />
                <p className="text-[10px] text-[#f7f7f7]/30 mt-1.5">Écris ce que tu veux — pas de liste prédéfinie.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 mb-2 block">{t("planning.start")}</label>
                  <input type="datetime-local" value={form.start} onChange={e=> setForm(f=>({...f,start:e.target.value}))} required
                    className="w-full bg-[#111111] border border-white/15 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 mb-2 block">{t("planning.end")}</label>
                  <input type="datetime-local" value={form.end} onChange={e=> setForm(f=>({...f,end:e.target.value}))} required
                    className="w-full bg-[#111111] border border-white/15 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 mb-2 block">{t("planning.game")}</label>
                  <select value={form.game} onChange={e=> setForm(f=>({...f,game:e.target.value, roster: e.target.value==="Rocket League" ? (f.roster || roster) : null}))}
                    className="w-full bg-[#111111] border border-white/15 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]">
                    {GAMES.map(g=> <option key={g} value={g}>{g}</option>)}
                    <option value="global">Global</option>
                  </select>
                </div>
                {form.game==="Rocket League" && (
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 mb-2 block">{t("planning.roster")} *</label>
                    <select value={form.roster||""} onChange={e=> setForm(f=>({...f,roster: e.target.value||null}))}
                      className="w-full bg-[#111111] border border-white/15 px-3 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82]">
                      <option value="">— {t("planning.rosterRequired")} —</option>
                      {(ROSTERS["Rocket League"]||[]).map(r=> <option key={r} value={r}>{t(`planning.roster.${r.toLowerCase()}`)}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 mb-2 block">{t("planning.color")}</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {COLORS.map(c=>(
                      <button key={c.id} type="button" onClick={()=> setForm(f=>({...f,color:c.id}))}
                        className={`w-7 h-7 rounded-sm border-2 transition-all ${form.color===c.id ? "border-white scale-110" : "border-transparent opacity-70 hover:opacity-100"}`}
                        style={{backgroundColor:c.id}} title={c.name} />
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-[0.25em] text-[#f7f7f7]/40 mb-2 block">{t("planning.desc")}</label>
                <textarea value={form.description} onChange={e=> setForm(f=>({...f,description:e.target.value}))}
                  placeholder={t("planning.descPlaceholder")}
                  rows={3}
                  className="w-full bg-[#111111] border border-white/15 px-4 py-3 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82] placeholder:text-[#f7f7f7]/20 resize-none" />
              </div>

              <div className="flex items-center justify-between pt-2">
                {selectedEvent && canManage ? (
                  <button type="button" onClick={deleteEvent} data-testid="event-delete-btn"
                    className="flex items-center gap-2 border border-red-500/30 text-red-300 text-xs uppercase tracking-widest px-4 py-2.5 hover:bg-red-500/10 transition-colors">
                    <Trash2 size={14} /> {t("planning.delete")}
                  </button>
                ) : <div/>}
                <div className="flex gap-2">
                  <button type="button" onClick={closeModal}
                    className="border border-white/15 text-[#f7f7f7]/60 text-xs uppercase tracking-widest px-5 py-2.5 hover:text-[#f7f7f7] hover:border-white/30 transition-colors">
                    {t("common.cancel")}
                  </button>
                  <button type="submit" data-testid="planning-submit"
                    className="bg-[#D8CA82] text-[#111111] font-display font-bold uppercase tracking-widest text-xs px-6 py-2.5 hover:shadow-[0_0_16px_rgba(216,202,130,0.4)] transition-shadow flex items-center gap-2">
                    {selectedEvent ? <Edit2 size={14}/> : <Plus size={14}/>}
                    {selectedEvent ? t("planning.save") : t("planning.create")}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
