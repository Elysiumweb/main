import { useEffect, useRef, useState, useCallback } from "react";
import { MousePointer2, Type, Square, Pencil, Image as ImageIcon, Crosshair, Trash2, ArrowLeft, Undo2, Redo2, Download } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "../lib/i18n";

const genId = () => Math.random().toString(36).slice(2, 10);
const COLORS = ["#D8CA82", "#f7f7f7", "#e05252", "#5aa9e6"];

export const InfiniteCanvas = ({ initialItems, onSave, saving, title, status, onBack }) => {
  const { t } = useLang();
  const containerRef = useRef(null);
  const [items, setItems] = useState(initialItems || []);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const [tool, setTool] = useState("select");
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [imgUrl, setImgUrl] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [tempStroke, setTempStroke] = useState(null);
  const dragRef = useRef(null);

  // ---- Historique pour annuler / rétablir (undo / redo) ----
  const [history, setHistory] = useState({ past: [], future: [] });

  // Clavier : déplacement de l'élément sélectionné via flèches (D-07)
  useEffect(() => {
    const handleKey = (e) => {
      if (!selected || editing) return;
      const step = e.shiftKey ? 10 : 1;
      let dx = 0, dy = 0;
      if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      else if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "Delete" || e.key === "Backspace") {
        setElements(prev => prev.filter(el => el.id !== selected));
        setSelected(null);
        return;
      } else if (e.key === "Enter") {
        const el = elements.find(ee => ee.id === selected);
        if (el) setEditing(el.id);
        return;
      } else return;
      e.preventDefault();
      setElements(prev => prev.map(el => el.id === selected ? { ...el, x: (el.x||0)+dx, y: (el.y||0)+dy } : el));
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selected, editing, elements]);
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  // Snapshot de l'état courant AVANT une mutation utilisateur.
  const pushHistory = useCallback(() => {
    setHistory((h) => ({ past: [...h.past, itemsRef.current].slice(-50), future: [] }));
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.past.length === 0) return h;
      const prev = h.past[h.past.length - 1];
      const past = h.past.slice(0, -1);
      setItems(prev);
      setSelected(null);
      return { past, future: [itemsRef.current, ...h.future].slice(0, 50) };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => {
      if (h.future.length === 0) return h;
      const next = h.future[0];
      const future = h.future.slice(1);
      setItems(next);
      setSelected(null);
      return { past: [...h.past, itemsRef.current].slice(-50), future };
    });
  }, []);

  // Raccourcis clavier Ctrl+Z / Ctrl+Maj+Z / Ctrl+Y
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((key === "z" && e.shiftKey) || key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ---- Export PNG (rendu du canvas hors écran) ----
  const exportPNG = async () => {
    const all = itemsRef.current;
    if (all.length === 0) { toast.error(t("canvas.empty")); return; }
    const ctx0 = document.createElement("canvas").getContext("2d");
    ctx0.font = "14px sans-serif";
    const lineH = 20;
    const measureBox = (it) => {
      const txt = it.text || "";
      const maxW = it.w || 220;
      const wrapped = [];
      txt.split("\n").forEach((line) => {
        if (!line) { wrapped.push(""); return; }
        let cur = "";
        for (const ch of line) {
          if (ctx0.measureText(cur + ch).width > maxW - 16) { wrapped.push(cur); cur = ch; }
          else cur += ch;
        }
        wrapped.push(cur);
      });
      const h = Math.max(36, wrapped.length * lineH + 16);
      return { w: it.w || 220, h };
    };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const expand = (x, y) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
    const measured = all.map((it) => {
      if (it.type === "draw") {
        it.points.forEach((p) => expand(p.x, p.y));
        return { ...it };
      }
      if (it.type === "image") {
        const w = it.w || 280; const h = it._h || (w * 0.66);
        expand(it.x, it.y); expand(it.x + w, it.y + h);
        return { ...it, _w: w, _h: h };
      }
      const m = measureBox(it);
      expand(it.x, it.y); expand(it.x + m.w, it.y + m.h);
      return { ...it, _w: m.w, _h: m.h };
    });
    if (minX === Infinity) { toast.error(t("canvas.empty")); return; }
    const pad = 48;
    const scale = 2; // rendu haute résolution
    const W = Math.max(1, (maxX - minX) + pad * 2);
    const H = Math.max(1, (maxY - minY) + pad * 2);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    // fond + grille de points
    ctx.fillStyle = "#0d0d0d"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let x = 0; x < W; x += 24) for (let y = 0; y < H; y += 24) ctx.fillRect(x, y, 1, 1);
    const ox = pad - minX, oy = pad - minY; // décalage pour inclure tout
    // préchargement des images
    const imgs = await Promise.all(measured.filter((it) => it.type === "image").map((it) => new Promise((res) => {
      const img = new Image(); img.crossOrigin = "anonymous";
      img.onload = () => res({ id: it.id, img });
      img.onerror = () => res({ id: it.id, img: null });
      img.src = it.url;
    })));
    const imgMap = new Map(imgs.map((o) => [o.id, o.img]));
    // tracés libres d'abord (arrière-plan)
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 3;
    measured.filter((it) => it.type === "draw").forEach((it) => {
      if (it.points.length < 2) return;
      ctx.strokeStyle = it.color || "#D8CA82";
      ctx.beginPath(); ctx.moveTo(it.points[0].x + ox, it.points[0].y + oy);
      it.points.forEach((p) => ctx.lineTo(p.x + ox, p.y + oy));
      ctx.stroke();
    });
    // puis boîtes / texte / images
    measured.filter((it) => it.type !== "draw").forEach((it) => {
      const x = it.x + ox, y = it.y + oy;
      if (it.type === "image") {
        const img = imgMap.get(it.id);
        if (img) { const w = it._w; const h = img.height ? (w * img.height / img.width) : it._h; ctx.drawImage(img, x, y, w, h); }
        else { ctx.strokeStyle = "#ffffff33"; ctx.strokeRect(x, y, it._w, it._h); }
        return;
      }
      ctx.font = "14px sans-serif"; ctx.textBaseline = "top";
      if (it.type === "box") {
        ctx.fillStyle = "rgba(216,202,130,0.05)"; ctx.fillRect(x, y, it._w, it._h);
        ctx.strokeStyle = "rgba(216,202,130,0.6)"; ctx.lineWidth = 1; ctx.strokeRect(x, y, it._w, it._h);
      }
      ctx.fillStyle = "#ededed";
      const maxW = it._w - 16;
      let cy = y + 8;
      (it.text || "").split("\n").forEach((line) => {
        let cur = "";
        for (const ch of line) {
          if (ctx.measureText(cur + ch).width > maxW) { ctx.fillText(cur, x + 8, cy); cy += lineH; cur = ch; }
          else cur += ch;
        }
        ctx.fillText(cur, x + 8, cy); cy += lineH;
      });
    });
    try {
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${(title || "elysium-tableau").replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.png`;
      a.click();
      toast.success(t("canvas.exported"));
    } catch (e) { console.error(e); toast.error(t("common.error")); }
  };

  const center = useCallback(() => {
    const el = containerRef.current;
    if (el) setView({ x: el.clientWidth / 2, y: el.clientHeight / 2, scale: 1 });
  }, []);

  useEffect(() => { center(); }, [center]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      setView((v) => {
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        const scale = Math.min(4, Math.max(0.15, v.scale * factor));
        const k = scale / v.scale;
        return { scale, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const toWorld = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    return { x: (e.clientX - rect.left - view.x) / view.scale, y: (e.clientY - rect.top - view.y) / view.scale };
  };

  const addItem = (item) => { pushHistory(); setItems((arr) => [...arr, item]); setSelected(item.id); };

  const onBgPointerDown = (e) => {
    if (e.target.closest('[data-canvas-item="1"]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const w = toWorld(e);
    if (tool === "select") {
      setSelected(null); setEditing(null);
      dragRef.current = { mode: "pan", sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
    } else if (tool === "draw") {
      dragRef.current = { mode: "draw" };
      setTempStroke({ points: [{ x: Math.round(w.x), y: Math.round(w.y) }], color });
    } else if (tool === "text") {
      const id = genId();
      addItem({ id, type: "text", x: Math.round(w.x), y: Math.round(w.y), w: 220, text: "" });
      setEditing(id); setTool("select");
    } else if (tool === "box") {
      const id = genId();
      addItem({ id, type: "box", x: Math.round(w.x), y: Math.round(w.y), w: 260, text: "" });
      setEditing(id); setTool("select");
    } else if (tool === "image") {
      if (!imgUrl.trim()) { toast.error(t("canvas.imageUrl")); return; }
      addItem({ id: genId(), type: "image", x: Math.round(w.x), y: Math.round(w.y), w: 280, url: imgUrl.trim() });
      setImgUrl(""); setTool("select");
    }
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === "pan") {
      setView((v) => ({ ...v, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }));
    } else if (d.mode === "draw") {
      const w = toWorld(e);
      setTempStroke((s) => s ? { ...s, points: [...s.points, { x: Math.round(w.x), y: Math.round(w.y) }] } : s);
    } else if (d.mode === "item") {
      const w = toWorld(e);
      setItems((arr) => arr.map((it) => it.id === d.id ? { ...it, x: Math.round(d.ix + w.x - d.wx), y: Math.round(d.iy + w.y - d.wy) } : it));
    }
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    if (d?.mode === "draw" && tempStroke && tempStroke.points.length > 1) {
      addItem({ id: genId(), type: "draw", points: tempStroke.points, color: tempStroke.color });
    }
    setTempStroke(null);
    dragRef.current = null;
  };

  const onItemPointerDown = (e, it) => {
    if (tool !== "select" || editing === it.id) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pushHistory();
    setSelected(it.id);
    const w = toWorld(e);
    dragRef.current = { mode: "item", id: it.id, ix: it.x, iy: it.y, wx: w.x, wy: w.y };
  };

  const updateText = (id, text) => setItems((arr) => arr.map((it) => it.id === id ? { ...it, text } : it));
  const deleteSelected = () => { if (selected) { pushHistory(); setItems((arr) => arr.filter((it) => it.id !== selected)); setSelected(null); } };

  const tools = [
    ["select", MousePointer2, t("canvas.tool.select")],
    ["text", Type, t("canvas.tool.text")],
    ["box", Square, t("canvas.tool.box")],
    ["draw", Pencil, t("canvas.tool.draw")],
    ["image", ImageIcon, t("canvas.tool.image")],
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-white/10 bg-[#141414] px-3 py-2 flex items-center gap-2 flex-wrap shrink-0" data-testid="canvas-toolbar">
        <button onClick={onBack} className="text-[#f7f7f7]/60 hover:text-[#D8CA82] transition-colors mr-1" data-testid="canvas-back-btn"><ArrowLeft size={17} /></button>
        <span className="font-display text-sm text-[#D8CA82] uppercase tracking-wider mr-2 truncate max-w-[140px]" data-testid="canvas-title">{title}</span>
        <span className={`text-xs uppercase tracking-widest border px-1.5 py-0.5 ${status === "draft" ? "text-orange-300 border-orange-300/40" : "text-emerald-300 border-emerald-300/40"}`} data-testid="canvas-status">
          {status === "draft" ? t("canvas.draft") : t("common.saved")}
        </span>
        <div className="h-5 w-px bg-white/10 mx-1" />
        {tools.map(([k, Icon, label]) => (
          <button key={k} onClick={() => setTool(k)} title={label} data-testid={`canvas-tool-${k}`}
            className={`p-2 border transition-colors ${tool === k ? "border-[#D8CA82] text-[#D8CA82] bg-[#D8CA82]/10" : "border-white/15 text-[#f7f7f7]/60 hover:text-[#f7f7f7]"}`}>
            <Icon size={15} />
          </button>
        ))}
        {tool === "image" && (
          <input value={imgUrl} onChange={(e) => setImgUrl(e.target.value)} placeholder={t("canvas.imageUrl")} data-testid="canvas-image-url-input"
            className="bg-[#111111] border border-white/20 px-2 py-1.5 text-xs text-[#f7f7f7] w-48 focus:outline-none focus:border-[#D8CA82]" />
        )}
        {tool === "draw" && COLORS.map((c) => (
          <button key={c} onClick={() => setColor(c)} data-testid={`canvas-color-${c.slice(1)}`}
            className={`w-5 h-5 border ${color === c ? "border-white scale-110" : "border-white/20"} transition-transform`} style={{ background: c }} />
        ))}
        <div className="h-5 w-px bg-white/10 mx-1" />
        <button onClick={center} title={t("canvas.center")} data-testid="canvas-center-btn"
          className="p-2 border border-white/15 text-[#f7f7f7]/60 hover:text-[#D8CA82] transition-colors"><Crosshair size={15} /></button>
        {selected && (
          <button onClick={deleteSelected} title={t("canvas.delete")} data-testid="canvas-delete-btn"
            className="p-2 border border-red-400/40 text-red-400 hover:bg-red-400/10 transition-colors"><Trash2 size={15} /></button>
        )}
        <button onClick={exportPNG} title={t("canvas.export")} data-testid="canvas-export-btn"
          className="p-2 border border-white/15 text-[#f7f7f7]/60 hover:text-[#D8CA82] transition-colors"><Download size={15} /></button>
        <div className="flex border border-white/15">
          <button onClick={undo} disabled={history.past.length === 0} title={t("canvas.undo")} data-testid="canvas-undo-btn"
            className="p-2 text-[#f7f7f7]/60 hover:text-[#D8CA82] transition-colors disabled:opacity-30 disabled:hover:text-[#f7f7f7]/60"><Undo2 size={15} /></button>
          <button onClick={redo} disabled={history.future.length === 0} title={t("canvas.redo")} data-testid="canvas-redo-btn"
            className="p-2 text-[#f7f7f7]/60 hover:text-[#D8CA82] transition-colors border-l border-white/10 disabled:opacity-30 disabled:hover:text-[#f7f7f7]/60"><Redo2 size={15} /></button>
        </div>
        <div className="flex-1" />
        <button onClick={() => onSave(items, "draft")} disabled={saving} data-testid="canvas-save-draft-btn"
          className="border border-white/25 text-[#f7f7f7]/70 text-xs uppercase tracking-widest px-3 py-2 hover:border-[#D8CA82] hover:text-[#D8CA82] transition-colors disabled:opacity-50">
          {t("canvas.draft")}
        </button>
        <button onClick={() => onSave(items, "saved")} disabled={saving} data-testid="canvas-save-btn"
          className="bg-[#D8CA82] text-[#111111] text-xs font-bold uppercase tracking-widest px-4 py-2 hover:shadow-[0_0_12px_rgba(216,202,130,0.4)] transition-shadow disabled:opacity-50">
          {t("canvas.save")}
        </button>
      </div>
      <div ref={containerRef} data-canvasbg="1" data-testid="canvas-area"
        className={`flex-1 relative overflow-hidden canvas-dots bg-[#0d0d0d] touch-none ${tool === "draw" ? "cursor-crosshair" : tool === "select" ? "cursor-grab" : "cursor-copy"}`}
        onPointerDown={onBgPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        <p className="absolute bottom-2 left-3 text-xs text-[#c8c8c8] pointer-events-none z-10">{t("canvas.hint")}</p>
      {/* Alternative structurée au canvas : liste des éléments, édition clavier, déplacement via commandes — D-07 */}
      <div className="absolute top-2 right-2 z-20 max-w-[280px] max-h-[40vh] overflow-auto border border-white/10 bg-[#111111]/90 backdrop-blur p-2 hidden lg:block" data-testid="canvas-elements-list">
        <p className="text-xs uppercase tracking-widest text-[#c8c8c8] mb-2">Éléments ({elements.length})</p>
        {elements.length===0 ? <p className="text-xs text-[#c8c8c8]">Aucun élément</p> : elements.map((el,i)=> (
          <div key={el.id} className="flex items-center gap-2 text-xs border-b border-white/5 py-1">
            <span className="text-[#D8CA82]">{i+1}. {el.type}</span>
            <span className="truncate text-[#c8c8c8]">{(el.text||"").slice(0,20) || el.id.slice(0,6)}</span>
            <button onClick={()=> setElements(prev=> prev.filter(e=> e.id!==el.id))} className="ml-auto text-red-300 hover:text-red-200" aria-label="Supprimer l&apos;élément">✕</button>
          </div>
        ))}
        <p className="text-xs text-[#c8c8c8]/60 mt-2">Déplacement clavier : flèches + Maj pour 10px, Entrée pour éditer.</p>
      </div>
        <div className="absolute" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: "0 0" }}>
          <div className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ left: 0, top: 0 }}>
            <img src="/brand/logo-icon-gold.png" alt="" className="w-10 opacity-20" />
          </div>
          <svg className="absolute overflow-visible pointer-events-none" style={{ left: 0, top: 0, width: 1, height: 1 }}>
            {items.filter((i) => i.type === "draw").map((i) => (
              <polyline key={i.id} points={i.points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none"
                stroke={i.color || "#D8CA82"} strokeWidth={2 / view.scale < 1 ? 2 : 2} strokeLinecap="round" strokeLinejoin="round"
                style={{ pointerEvents: "stroke", cursor: "pointer" }}
                onPointerDown={(e) => { if (tool === "select") { e.stopPropagation(); setSelected(i.id); } }}
                opacity={selected === i.id ? 0.6 : 1} />
            ))}
            {tempStroke && (
              <polyline points={tempStroke.points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none"
                stroke={tempStroke.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
          {items.filter((i) => i.type !== "draw").map((it) => (
            <div key={it.id} data-canvas-item="1" onPointerDown={(e) => onItemPointerDown(e, it)} onDoubleClick={() => { if (it.type !== "image") { pushHistory(); setEditing(it.id); } }}
              data-testid={`canvas-item-${it.id}`}
              className={`absolute select-none ${selected === it.id ? "ring-1 ring-[#D8CA82]" : ""} ${tool === "select" ? "cursor-move" : ""}`}
              style={{ left: it.x, top: it.y, width: it.w }}>
              {it.type === "image" ? (
                <img src={it.url} alt="" draggable={false} className="w-full border border-white/10" />
              ) : editing === it.id ? (
                <textarea autoFocus value={it.text} onChange={(e) => updateText(it.id, e.target.value)} onBlur={() => setEditing(null)}
                  onPointerDown={(e) => e.stopPropagation()} data-testid={`canvas-item-edit-${it.id}`}
                  className={`w-full min-h-[60px] bg-[#161616] text-sm text-[#f7f7f7] p-2 resize focus:outline-none border ${it.type === "box" ? "border-[#D8CA82]/60" : "border-white/20"}`} />
              ) : (
                <div className={`min-h-[36px] p-2 text-sm text-[#f7f7f7]/90 whitespace-pre-wrap break-words ${it.type === "box" ? "border border-[#D8CA82]/60 bg-[#D8CA82]/5" : ""}`}>
                  {it.text || <span className="text-[#c8c8c8] italic">Double-clic...</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
