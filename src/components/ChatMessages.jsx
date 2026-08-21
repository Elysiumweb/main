import { useEffect, useRef, useState, useMemo } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, limit, onSnapshot, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { Send, ImageIcon, Pencil, Trash2, X, Check, AtSign, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { db, storage } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../lib/i18n";
import { createNotification, logAdminAction } from "../lib/notify";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

/* Petite compression d'image (JPEG) avant envoi — limite la taille du storage. */
const compressImage = (file, maxWidth = 1280) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read-error"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode-error"));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("canvas-error")); return; }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode-error"))), "image/jpeg", 0.82);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

/* Rendu d'un texte avec mentions @pseudo surlignées. */
const renderText = (text, members) => {
  if (!text) return null;
  const parts = text.split(/(@\S+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@") && part.length > 1) {
      const pseudo = part.slice(1);
      const found = members.find((m) => (m.displayName || "").toLowerCase() === pseudo.toLowerCase());
      return (
        <span key={i} className="text-[#D8CA82] font-medium bg-[#D8CA82]/10 px-0.5 rounded-sm" data-testid={`mention-${i}`}>
          {part}{found ? "" : ""}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
};

export const ChatMessages = ({ path, channelId = "", testId = "chat", onSent = null }) => {
  const { user, displayName, role, game, roster, isOfficial } = useAuth();
  const { t, lang } = useLang();
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [text, setText] = useState("");
  const [pendingImage, setPendingImage] = useState(null); // data URL preview avant envoi
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [mentionQuery, setMentionQuery] = useState(null); // {start, query} | null
  const [mentionIndex, setMentionIndex] = useState(0);
  const [messageToDelete, setMessageToDelete] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    const q = query(collection(db, ...path.split("/")), orderBy("createdAt", "asc"), limit(200));
    const unsub = onSnapshot(q, (snap) => setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => console.error("chat", e));
    return unsub;
  }, [path]);

  // Annuaire privé des joueurs : alimente l'autocomplétion @ et la résolution des mentions.
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "profiles"), (snap) =>
      setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.id !== user?.uid)),
    console.error);
    return unsub;
  }, [user?.uid]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const memberNames = useMemo(() => members.map((m) => m.displayName || "").filter(Boolean), [members]);
  const effectiveChannel = channelId || path.split("/")[1] || "";
  const canModerateChannel = isOfficial
    || role === "bureau"
    || (role === "manager" && ((game && effectiveChannel === `game_${game}`) || (roster && effectiveChannel === `roster_${roster}`)));

  const matchedMentions = useMemo(() => {
    if (!mentionQuery) return [];
    const q = mentionQuery.query.toLowerCase();
    return members
      .filter((m) => (m.displayName || "").toLowerCase().includes(q))
      .slice(0, 6);
  }, [mentionQuery, members]);

  // Détection d'une mention en cours de frappe (@pseudo)
  const onTextChange = (e) => {
    const val = e.target.value;
    setText(val);
    const caret = e.target.selectionStart;
    const before = val.slice(0, caret);
    const match = before.match(/@([^\s@]*)$/);
    if (match) setMentionQuery({ start: caret - match[0].length, query: match[1] });
    else setMentionQuery(null);
    setMentionIndex(0);
  };

  const insertMention = (m) => {
    const name = m.displayName || "";
    const before = text.slice(0, mentionQuery.start);
    const after = text.slice(mentionQuery.start + mentionQuery.query.length + 1);
    const next = `${before}@${name} ${after}`;
    setText(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      const pos = (before + `@${name} `).length;
      inputRef.current?.setSelectionRange(pos, pos);
    });
  };

  const onTextKeyDown = (e) => {
    if (mentionQuery && matchedMentions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % matchedMentions.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => (i - 1 + matchedMentions.length) % matchedMentions.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(matchedMentions[mentionIndex]); return; }
      if (e.key === "Escape") { setMentionQuery(null); return; }
    }
  };

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error(t("upload.invalidType")); return; }
    try {
      const blob = await compressImage(file);
      const reader = new FileReader();
      reader.onload = () => setPendingImage(reader.result);
      reader.readAsDataURL(blob);
    } catch (err) { console.error(err); toast.error(t("upload.error")); }
  };

  const uploadImage = () =>
    new Promise((resolve, reject) => {
      if (!pendingImage) { resolve(null); return; }
      setUploading(true);
      fetch(pendingImage)
        .then((r) => r.blob())
        .then((blob) => {
          const path = `chat/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
          const task = uploadBytesResumable(ref(storage, path), blob, { contentType: "image/jpeg" });
          task.on("state_changed", null,
            (err) => { setUploading(false); reject(err); },
            async () => { const url = await getDownloadURL(task.snapshot.ref); setUploading(false); resolve(url); });
        })
        .catch((err) => { setUploading(false); reject(err); });
    });

  const send = async (e) => {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed && !pendingImage) return;
    let imageUrl = null;
    try { imageUrl = await uploadImage(); }
    catch (err) { console.error(err); toast.error(t("upload.error")); return; }
    setText("");
    setPendingImage(null);
    setMentionQuery(null);

    // Résolution des mentions @pseudo -> uid (notification ciblée)
    const tokens = trimmed.match(/@([^\s@]+)/g) || [];
    const mentionedUids = [];
    tokens.forEach((tok) => {
      const pseudo = tok.slice(1).toLowerCase();
      const m = members.find((mm) => (mm.displayName || "").toLowerCase() === pseudo);
      if (m && !mentionedUids.includes(m.id)) mentionedUids.push(m.id);
    });

    await addDoc(collection(db, ...path.split("/")), {
      uid: user.uid, name: displayName, role, text: trimmed, createdAt: serverTimestamp(),
      ...(imageUrl ? { image: imageUrl } : {}),
      ...(mentionedUids.length ? { mentions: mentionedUids } : {}),
    });

    mentionedUids.forEach((targetUid) =>
      createNotification({ targetUid, type: "chat_mention", extra: `${displayName}: ${trimmed.slice(0, 80)}`, link: "/espace-joueur/chat" }),
    );
    if (onSent) onSent(trimmed);
  };

  const startEdit = (m) => { setEditingId(m.id); setEditText(m.text || ""); };
  const cancelEdit = () => { setEditingId(null); setEditText(""); };
  const saveEdit = async (id) => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    try {
      await updateDoc(doc(db, ...path.split("/"), id), { text: trimmed, editedAt: serverTimestamp() });
      setEditingId(null); setEditText("");
    } catch (err) { console.error(err); toast.error(t("common.error")); }
  };
  const remove = async (m) => {
    try {
      await deleteDoc(doc(db, ...path.split("/"), m.id));
      if (m.uid !== user?.uid) {
        await logAdminAction({
          action: "chat_message_deleted",
          label: `${effectiveChannel} · ${m.name || m.uid}: ${(m.text || "[image]").slice(0, 120)}`,
          actor: { uid: user?.uid, name: displayName, email: user?.email },
          target: { collection: `chats/${effectiveChannel}/messages`, id: m.id },
          details: { messageUid: m.uid, messageAuthor: m.name || "", channel: effectiveChannel },
        });
      }
      toast.success(t("common.saved"));
    }
    catch (err) { console.error(err); toast.error(t("common.error")); }
  };

  const fmtDate = (ts) => ts?.toDate
    ? ts.toDate().toLocaleString(lang === "en" ? "en-US" : "fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0" data-testid={`${testId}-messages`}>
        {messages.length === 0 && (
          <p className="text-sm text-[#c8c8c8] tracking-wide" data-testid={`${testId}-empty`}>{t("chat.empty")}</p>
        )}
        {messages.map((m) => {
          const mine = m.uid === user?.uid;
          const canDeleteMessage = mine || canModerateChannel;
          const isEditing = editingId === m.id;
          return (
            <div key={m.id} className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] px-3 py-2 border relative ${mine ? "bg-[#D8CA82]/10 border-[#D8CA82]/40" : "bg-[#1A1A1A] border-white/10"}`}>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-display font-bold text-[#D8CA82]">{m.name}</span>
                  {m.createdAt && <span className="text-xs text-[#c8c8c8]">{fmtDate(m.createdAt)}</span>}
                  {m.editedAt && <span className="text-xs italic text-[#c8c8c8]">({t("chat.edited")})</span>}
                  {/* Actions : édition personnelle + suppression personnelle/modération */}
                  {canDeleteMessage && !isEditing && (
                    <span className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`msg-actions-${m.id}`}>
                      {mine && <button onClick={() => startEdit(m)} title={t("chat.edit")} data-testid={`msg-edit-${m.id}`} className="text-[#c8c8c8] hover:text-[#D8CA82]"><Pencil size={11} /></button>}
                      <button onClick={() => setMessageToDelete(m)} title={mine ? t("chat.delete") : "Modérer"} data-testid={`msg-delete-${m.id}`} className="text-[#c8c8c8] hover:text-red-400"><Trash2 size={11} /></button>
                    </span>
                  )}
                </div>
                {isEditing ? (
                  <div className="mt-1" data-testid={`msg-edit-form-${m.id}`}>
                    <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} autoFocus
                      className="w-full bg-[#111111] border border-white/20 px-2 py-1.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#D8CA82] resize-none" />
                    <div className="flex justify-end gap-2 mt-1.5">
                      <button onClick={cancelEdit} className="text-xs uppercase tracking-widest text-[#f7f7f7]/50 hover:text-[#f7f7f7] px-2 py-1">{t("chat.cancel")}</button>
                      <button onClick={() => saveEdit(m.id)} className="text-xs uppercase tracking-widest bg-[#D8CA82] text-[#111111] px-2 py-1 font-bold flex items-center gap-1"><Check size={11} /> {t("chat.save")}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {m.text && <p className="text-sm text-[#f7f7f7]/90 whitespace-pre-wrap break-words">{renderText(m.text, members)}</p>}
                    {m.image && (
                      <a href={m.image} target="_blank" rel="noopener noreferrer" className="block mt-1" data-testid={`msg-image-${m.id}`}>
                        <img src={m.image} alt="" className="max-h-60 max-w-full border border-white/10" />
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Aperçu image avant envoi */}
      {pendingImage && (
        <div className="px-3 py-2 border-t border-white/10 bg-[#141414] flex items-center gap-3" data-testid={`${testId}-image-preview`}>
          <img src={pendingImage} alt="" className="h-16 border border-white/10" />
          <button onClick={() => setPendingImage(null)} className="text-[#f7f7f7]/50 hover:text-red-400" aria-label={t("common.delete")}><X size={16} /></button>
        </div>
      )}

      {/* Liste d'autocomplétion @mention */}
      {mentionQuery && matchedMentions.length > 0 && (
        <div className="mx-3 mb-1 border border-white/15 bg-[#161616] shadow-lg" data-testid={`${testId}-mention-list`}>
          {matchedMentions.map((m, i) => (
            <button key={m.id} type="button" onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
              onMouseEnter={() => setMentionIndex(i)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left ${i === mentionIndex ? "bg-[#D8CA82]/10 text-[#D8CA82]" : "text-[#f7f7f7]/80 hover:bg-white/5"}`}>
              <AtSign size={12} className="opacity-50" /> {m.displayName}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={send} className="border-t border-white/10 p-3 flex gap-2 shrink-0 items-center">
        <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} className="sr-only" data-testid={`${testId}-file-input`} />
        <button type="button" onClick={() => fileRef.current?.click()} title={t("chat.attach")} data-testid={`${testId}-attach-btn`}
          className="p-2 text-[#f7f7f7]/50 hover:text-[#D8CA82] border border-white/15 hover:border-[#D8CA82]/50 transition-colors shrink-0">
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
        </button>
        <input ref={inputRef} value={text} onChange={onTextChange} onKeyDown={onTextKeyDown} placeholder={t("chat.placeholder")}
          data-testid={`${testId}-input`}
          className="flex-1 bg-[#1A1A1A] border border-white/20 px-3 py-2 text-sm text-[#f7f7f7] placeholder:text-[#c8c8c8] focus:outline-none focus:border-[#D8CA82]" />
        <button type="submit" disabled={uploading} data-testid={`${testId}-send-btn`}
          className="bg-[#D8CA82] text-[#111111] px-4 hover:shadow-[0_0_12px_rgba(216,202,130,0.4)] transition-shadow disabled:opacity-50">
          <Send size={16} />
        </button>
      </form>

      <AlertDialog open={!!messageToDelete} onOpenChange={(open) => !open && setMessageToDelete(null)}>
        <AlertDialogContent className="bg-[#1A1A1A] border border-[#D8CA82]/30 rounded-none text-[#f7f7f7] shadow-[0_0_40px_rgba(0,0,0,0.65)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display uppercase tracking-[0.25em] text-[#D8CA82] text-base">
              {messageToDelete?.uid === user?.uid ? t("chat.deleteConfirm") : "Modérer ce message ?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#f7f7f7]/60 leading-relaxed">
              {messageToDelete?.uid === user?.uid
                ? "Ton message sera supprimé définitivement."
                : `Le message de ${messageToDelete?.name || "ce membre"} sera supprimé et l'action sera inscrite au journal d'audit.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <AlertDialogCancel className="bg-transparent border border-white/20 text-[#f7f7f7]/70 hover:bg-white/5 hover:text-[#f7f7f7] uppercase tracking-widest text-xs px-5 py-2.5 rounded-none mt-0">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { const target = messageToDelete; setMessageToDelete(null); remove(target); }}
              className="bg-red-500/15 border border-red-400/50 text-red-200 hover:bg-red-500/25 hover:text-red-100 font-display font-bold uppercase tracking-widest text-xs px-5 py-2.5 rounded-none"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
