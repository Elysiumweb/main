import { useEffect, useRef, useState, useCallback } from "react";
import { MousePointer2, Type, Square, Pencil, Image as ImageIcon, Crosshair, Trash2, ArrowLeft } from "lucide-react";
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

  const addItem = (item) => { setItems((arr) => [...arr, item]); setSelected(item.id); };

  const onBgPointerDown = (e) => {
    if (e.target.dataset?.canvasbg !== "1") return;
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
    setSelected(it.id);
    const w = toWorld(e);
    dragRef.current = { mode: "item", id: it.id, ix: it.x, iy: it.y, wx: w.x, wy: w.y };
  };

  const updateText = (id, text) => setItems((arr) => arr.map((it) => it.id === id ? { ...it, text } : it));
  const deleteSelected = () => { if (selected) { setItems((arr) => arr.filter((it) => it.id !== selected)); setSelected(null); } };

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
        <span className={`text-[9px] uppercase tracking-widest border px-1.5 py-0.5 ${status === "draft" ? "text-orange-300 border-orange-300/40" : "text-emerald-300 border-emerald-300/40"}`} data-testid="canvas-status">
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
        <p className="absolute bottom-2 left-3 text-[10px] text-[#f7f7f7]/25 pointer-events-none z-10">{t("canvas.hint")}</p>
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
            <div key={it.id} onPointerDown={(e) => onItemPointerDown(e, it)} onDoubleClick={() => it.type !== "image" && setEditing(it.id)}
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
                  {it.text || <span className="text-[#f7f7f7]/30 italic">Double-clic...</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
