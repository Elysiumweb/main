import { useEffect, useRef, useState } from "react";
import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp } from "firebase/firestore";
import { Send } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";

export const ChatMessages = ({ path, testId = "chat", onSent = null }) => {
  const { user, displayName, role } = useAuth();
  const { t } = useLang();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    const q = query(collection(db, ...path.split("/")), orderBy("createdAt", "asc"), limit(200));
    const unsub = onSnapshot(q, (snap) => setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => console.error("chat", e));
    return unsub;
  }, [path]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    await addDoc(collection(db, ...path.split("/")), {
      uid: user.uid, name: displayName, role, text: trimmed, createdAt: serverTimestamp(),
    });
    if (onSent) onSent(trimmed);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0" data-testid={`${testId}-messages`}>
        {messages.length === 0 && (
          <p className="text-sm text-[#f7f7f7]/40 tracking-wide" data-testid={`${testId}-empty`}>{t("chat.empty")}</p>
        )}
        {messages.map((m) => {
          const mine = m.uid === user?.uid;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] px-3 py-2 border ${mine ? "bg-[#D8CA82]/10 border-[#D8CA82]/40" : "bg-[#1A1A1A] border-white/10"}`}>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-display font-bold text-[#D8CA82]">{m.name}</span>
                  {m.createdAt?.toDate && (
                    <span className="text-[10px] text-[#f7f7f7]/30">
                      {m.createdAt.toDate().toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
                <p className="text-sm text-[#f7f7f7]/90 whitespace-pre-wrap break-words">{m.text}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="border-t border-white/10 p-3 flex gap-2 shrink-0">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("chat.placeholder")}
          data-testid={`${testId}-input`}
          className="flex-1 bg-[#1A1A1A] border border-white/20 px-3 py-2 text-sm text-[#f7f7f7] placeholder:text-[#f7f7f7]/30 focus:outline-none focus:border-[#D8CA82]" />
        <button type="submit" data-testid={`${testId}-send-btn`}
          className="bg-[#D8CA82] text-[#111111] px-4 hover:shadow-[0_0_12px_rgba(216,202,130,0.4)] transition-shadow">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
};
