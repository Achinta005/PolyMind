"use client";

import { useState, useRef, useEffect, FC } from "react";
import {
  Send, FileText, User, Bot, Check, ChevronDown,
  Search, TrendingUp, AlertTriangle, BarChart2, BookOpen,
  Layout, Target, X, Plus, Minus, LucideIcon,
} from "lucide-react";
import { useAuth } from "@/app/contexts/AuthContext";

// ─── Domain types ─────────────────────────────────────────────────────────────
interface Citation {
  docName: string;
  page: number;
  chunk: string;
}

interface Doc {
  id: string;
  filename: string;
  size_bytes: number;
  status: string;
  created_at: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  selectedDocs?: Doc[];
  isStreaming?: boolean;
}

// ─── Parsed block types ───────────────────────────────────────────────────────
type SectionKey =
  | "summary" | "strength" | "weakness" | "content"
  | "format" | "relevance" | "score" | "default";

interface PlainBlock { type: "plain"; value: string }
interface OverallScoreBlock { type: "overall-score"; value: number }
interface SectionBlock { type: "section"; title: string; items: SectionItem[]; icon: SectionKey }
type ParsedBlock = PlainBlock | OverallScoreBlock | SectionBlock;

interface TextItem { type: "text"; value: string }
interface BulletItem { type: "bullet"; value: string }
interface NumberedItem { type: "numbered"; num: string; label: string; text: string }
interface ScoreItem { type: "score-item"; label: string; weight: number; value: number }
type SectionItem = TextItem | BulletItem | NumberedItem | ScoreItem;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function hexToRgb(hex: string): string {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r
    ? `${parseInt(r[1], 16)},${parseInt(r[2], 16)},${parseInt(r[3], 16)}`
    : "255,255,255";
}

// ─── SSE Content Parser ───────────────────────────────────────────────────────
function parseContent(text: string): ParsedBlock[] | null {
  if (!text) return null;
  const blocks: ParsedBlock[] = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    const overallScore = line.match(/overall.*?(\d+(\.\d+)?)\s*\/\s*10/i);
    if (overallScore) {
      blocks.push({ type: "overall-score", value: parseFloat(overallScore[1]) });
      i++; continue;
    }

    const sectionHeader = line.match(/^\*\*([^*]+)\*\*[:：]?\s*(.*)$/);
    if (sectionHeader && !line.match(/^\d+\.\s/)) {
      const title = sectionHeader[1].trim();
      const inline = sectionHeader[2].trim();
      const items: SectionItem[] = [];
      if (inline) items.push({ type: "text", value: inline });
      i++;

      while (i < lines.length) {
        const sub = lines[i].trim();
        if (!sub) { i++; continue; }
        if (sub.match(/^\*\*[^*]+\*\*[:：]?\s*$/)) break;

        const scoreMatch = sub.match(/\*\*(.+?)\s*\((\d+)%\)\*\*[:：]?\s*(\d+)\/10/);
        const numbered = sub.match(/^(\d+)\.\s+\*\*(.+?)\*\*[:：]?\s*(.*)$/);
        const bullet = sub.match(/^[-*•]\s+(.+)$/);

        if (scoreMatch) {
          items.push({ type: "score-item", label: scoreMatch[1], weight: parseInt(scoreMatch[2]), value: parseInt(scoreMatch[3]) });
        } else if (numbered) {
          items.push({ type: "numbered", num: numbered[1], label: numbered[2], text: numbered[3] });
        } else if (bullet) {
          items.push({ type: "bullet", value: bullet[1] });
        } else if (sub && !sub.match(/^\*\*[^*]+\*\*[:：]?\s*$/)) {
          items.push({ type: "text", value: sub });
        } else {
          break;
        }
        i++;
      }

      if (title || items.length > 0) {
        blocks.push({ type: "section", title, items, icon: iconForTitle(title) });
      }
      continue;
    }

    if (line) blocks.push({ type: "plain", value: line });
    i++;
  }

  return blocks.length > 1 ? blocks : null;
}

function iconForTitle(t: string): SectionKey {
  const l = t.toLowerCase();
  if (l.includes("summar")) return "summary";
  if (l.includes("strength")) return "strength";
  if (l.includes("weak")) return "weakness";
  if (l.includes("content")) return "content";
  if (l.includes("format")) return "format";
  if (l.includes("relevan")) return "relevance";
  if (l.includes("score") || l.includes("overall")) return "score";
  return "default";
}

interface SectionStyle {
  icon: LucideIcon;
  accent: string;
  bg: string;
  border: string;
}

const SECTION_STYLES: Record<SectionKey, SectionStyle> = {
  summary: { icon: BookOpen, accent: "#a78bfa", bg: "rgba(167,139,250,0.07)", border: "rgba(167,139,250,0.18)" },
  strength: { icon: TrendingUp, accent: "#4ade80", bg: "rgba(74,222,128,0.07)", border: "rgba(74,222,128,0.18)" },
  weakness: { icon: AlertTriangle, accent: "#fb923c", bg: "rgba(251,146,60,0.07)", border: "rgba(251,146,60,0.18)" },
  content: { icon: FileText, accent: "#38bdf8", bg: "rgba(56,189,248,0.07)", border: "rgba(56,189,248,0.18)" },
  format: { icon: Layout, accent: "#f472b6", bg: "rgba(244,114,182,0.07)", border: "rgba(244,114,182,0.18)" },
  relevance: { icon: Target, accent: "#facc15", bg: "rgba(250,204,21,0.07)", border: "rgba(250,204,21,0.18)" },
  score: { icon: BarChart2, accent: "#c8f04d", bg: "rgba(200,240,77,0.07)", border: "rgba(200,240,77,0.18)" },
  default: { icon: FileText, accent: "#94a3b8", bg: "rgba(148,163,184,0.07)", border: "rgba(148,163,184,0.18)" },
};

// ─── Score Ring ───────────────────────────────────────────────────────────────
interface ScoreRingProps { value: number; max?: number; size?: number; accent?: string }

const ScoreRing: FC<ScoreRingProps> = ({ value, max = 10, size = 72, accent = "#c8f04d" }) => {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (value / max) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={7} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={accent} strokeWidth={7}
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round" />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        fill="white" fontSize={size * 0.23} fontWeight="800" fontFamily="monospace"
        style={{ transform: "rotate(90deg)", transformOrigin: `${size / 2}px ${size / 2}px` }}>
        {value}
      </text>
    </svg>
  );
};

// ─── Score Bar ────────────────────────────────────────────────────────────────
interface ScoreBarProps { label: string; weight: number; value: number; accent: string }

const ScoreBar: FC<ScoreBarProps> = ({ label, weight, value, accent }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontFamily: "monospace" }}>
        {label} <span style={{ color: "rgba(255,255,255,0.25)" }}>({weight}%)</span>
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, color: accent, fontFamily: "monospace" }}>{value}/10</span>
    </div>
    <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
      <div style={{ height: "100%", borderRadius: 2, background: accent, width: `${(value / 10) * 100}%` }} />
    </div>
  </div>
);

// ─── Plain Message ────────────────────────────────────────────────────────────
const PlainMessage: FC<{ text: string }> = ({ text }) => (
  <p style={{ fontSize: 13, lineHeight: 1.75, color: "rgba(255,255,255,0.82)", margin: 0, whiteSpace: "pre-wrap" }}>
    {text}
  </p>
);

// ─── Structured Message Renderer ──────────────────────────────────────────────
const StructuredMessage: FC<{ text: string }> = ({ text }) => {
  const blocks = parseContent(text);
  if (!blocks) return <PlainMessage text={text} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {blocks.map((block, bi) => {
        if (block.type === "plain") {
          return (
            <p key={bi} style={{ fontSize: 13, lineHeight: 1.75, color: "rgba(255,255,255,0.78)", margin: 0 }}>
              {block.value}
            </p>
          );
        }

        if (block.type === "overall-score") {
          const label =
            block.value >= 9 ? "Exceptional" :
              block.value >= 8 ? "Strong Candidate" :
                block.value >= 6.5 ? "Above Average" :
                  block.value >= 5 ? "Moderate" : "Needs Work";
          return (
            <div key={bi} style={{ display: "flex", alignItems: "center", gap: 18, background: "rgba(200,240,77,0.06)", border: "1px solid rgba(200,240,77,0.2)", borderRadius: 14, padding: "14px 18px" }}>
              <ScoreRing value={block.value} accent="#c8f04d" size={70} />
              <div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 2 }}>OVERALL SCORE</div>
                <div style={{ fontSize: 30, fontWeight: 900, color: "#c8f04d", lineHeight: 1, fontFamily: "monospace" }}>
                  {block.value}<span style={{ fontSize: 14, color: "rgba(200,240,77,0.45)", fontWeight: 400 }}>/10</span>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 5 }}>{label}</div>
              </div>
            </div>
          );
        }

        if (block.type === "section") {
          const s = SECTION_STYLES[block.icon] ?? SECTION_STYLES.default;
          const IconComp = s.icon;
          const scoreItems = block.items.filter((it): it is ScoreItem => it.type === "score-item");
          const otherItems = block.items.filter((it): it is Exclude<SectionItem, ScoreItem> => it.type !== "score-item");

          return (
            <div key={bi} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 14px", borderBottom: `1px solid ${s.border}`, background: "rgba(0,0,0,0.12)" }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: `rgba(${hexToRgb(s.accent)},0.14)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <IconComp size={13} color={s.accent} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: s.accent, fontFamily: "monospace", letterSpacing: "0.06em" }}>
                  {block.title.toUpperCase()}
                </span>
              </div>

              <div style={{ padding: "12px 14px" }}>
                {scoreItems.length > 0 && (
                  <div style={{ marginBottom: otherItems.length > 0 ? 12 : 0 }}>
                    {scoreItems.map((it, ii) => (
                      <ScoreBar key={ii} label={it.label} weight={it.weight} value={it.value} accent={s.accent} />
                    ))}
                  </div>
                )}
                {otherItems.map((item, ii) => {
                  if (item.type === "text") {
                    return <p key={ii} style={{ fontSize: 13, lineHeight: 1.7, color: "rgba(255,255,255,0.72)", margin: "0 0 6px" }}>{item.value}</p>;
                  }
                  if (item.type === "numbered") {
                    return (
                      <div key={ii} style={{ display: "flex", gap: 10, marginBottom: 10, paddingBottom: 10, borderBottom: ii < otherItems.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: `rgba(${hexToRgb(s.accent)},0.14)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: s.accent, fontFamily: "monospace" }}>{item.num}</span>
                        </div>
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.88)" }}>{item.label}</span>
                          {item.text && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginLeft: 6 }}>{item.text}</span>}
                        </div>
                      </div>
                    );
                  }
                  if (item.type === "bullet") {
                    return (
                      <div key={ii} style={{ display: "flex", gap: 9, marginBottom: 7, alignItems: "flex-start" }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: s.accent, flexShrink: 0, marginTop: 7 }} />
                        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.65 }}>{item.value}</span>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
};

// ─── Document Selector ────────────────────────────────────────────────────────
interface DocSelectorProps {
  docs: Doc[];
  loading: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}

const DocSelector: FC<DocSelectorProps> = ({ docs, loading, selectedIds, onToggle }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const ready = docs.filter(d => d.status === "ready");
  const filtered = ready.filter(d => d.filename.toLowerCase().includes(search.toLowerCase()));
  const selected = ready.filter(d => selectedIds.has(d.id));

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: "#06090f" }}>
      {/* Trigger bar */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 18px", background: "transparent", border: "none", cursor: "pointer", transition: "background 0.15s", boxSizing: "border-box" }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
          {/* 5-slot indicators */}
          <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
            {Array.from({ length: 5 }).map((_, i) => {
              const doc = selected[i];
              return (
                <div key={i} title={doc?.filename} style={{ width: 22, height: 22, borderRadius: 6, background: doc ? "rgba(200,240,77,0.12)" : "rgba(255,255,255,0.04)", border: doc ? "1px solid rgba(200,240,77,0.32)" : "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
                  {doc
                    ? <FileText size={10} color="#c8f04d" />
                    : <span style={{ color: "rgba(255,255,255,0.12)", fontSize: 9, fontFamily: "monospace" }}>{i + 1}</span>
                  }
                </div>
              );
            })}
          </div>

          {selected.length === 0 ? (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", fontFamily: "monospace" }}>
              Select documents to search — required
            </span>
          ) : (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", minWidth: 0 }}>
              {selected.map(d => (
                <span key={d.id} style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(200,240,77,0.75)", background: "rgba(200,240,77,0.07)", border: "1px solid rgba(200,240,77,0.18)", borderRadius: 5, padding: "1px 7px", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.filename.replace(/\.pdf$/i, "")}
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 10 }}>
          {selected.length > 0 && (
            <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(200,240,77,0.55)", background: "rgba(200,240,77,0.08)", border: "1px solid rgba(200,240,77,0.15)", borderRadius: 100, padding: "1px 8px" }}>
              {selected.length}/5
            </span>
          )}
          <div style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.05)", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
            <ChevronDown size={12} color="rgba(255,255,255,0.3)" />
          </div>
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: "#080d17", padding: "14px 16px", maxHeight: 280, overflowY: "auto" }}>
          {/* Search bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 9, padding: "7px 11px", marginBottom: 10 }}>
            <Search size={12} color="rgba(255,255,255,0.22)" style={{ flexShrink: 0 }} />
            <input
              type="text" value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search documents…"
              style={{ background: "transparent", border: "none", outline: "none", fontSize: 12, color: "white", fontFamily: "monospace", flex: 1, caretColor: "#c8f04d" }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}>
                <X size={11} color="rgba(255,255,255,0.3)" />
              </button>
            )}
          </div>

          {/* Doc list */}
          {loading ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: "rgba(255,255,255,0.2)", fontSize: 12, fontFamily: "monospace" }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: "rgba(255,255,255,0.15)", fontSize: 12, fontFamily: "monospace" }}>
              {ready.length === 0 ? "No documents uploaded yet" : "No matches found"}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {filtered.map(doc => {
                const sel = selectedIds.has(doc.id);
                const maxed = selectedIds.size >= 5 && !sel;
                return (
                  <button
                    key={doc.id}
                    onClick={() => !maxed && onToggle(doc.id)}
                    disabled={maxed}
                    style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 11px", borderRadius: 9, border: "none", textAlign: "left", cursor: maxed ? "not-allowed" : "pointer", background: sel ? "rgba(200,240,77,0.06)" : "rgba(255,255,255,0.02)", outline: sel ? "1px solid rgba(200,240,77,0.22)" : "1px solid rgba(255,255,255,0.05)", opacity: maxed ? 0.3 : 1, transition: "all 0.14s", boxSizing: "border-box", width: "100%" }}
                    onMouseEnter={e => { if (!maxed && !sel) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                    onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                  >
                    <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, background: sel ? "#c8f04d" : "transparent", border: sel ? "none" : "1.5px solid rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.14s" }}>
                      {sel && <Check size={10} color="#050810" strokeWidth={3} />}
                    </div>
                    <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: sel ? "rgba(200,240,77,0.1)" : "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.14s" }}>
                      <FileText size={13} color={sel ? "#c8f04d" : "rgba(255,255,255,0.28)"} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: sel ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", transition: "color 0.14s" }}>
                        {doc.filename}
                      </div>
                      <div style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.2)", marginTop: 2 }}>
                        {formatBytes(doc.size_bytes)} · {formatDate(doc.created_at)}
                      </div>
                    </div>
                    <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, background: sel ? "rgba(200,240,77,0.12)" : "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {sel ? <Minus size={9} color="#c8f04d" /> : <Plus size={9} color="rgba(255,255,255,0.25)" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selectedIds.size >= 5 && (
            <p style={{ margin: "10px 0 0", textAlign: "center", fontSize: 10, fontFamily: "monospace", color: "rgba(200,240,77,0.4)" }}>
              Maximum 5 documents selected
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main Chat Page ───────────────────────────────────────────────────────────
export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docsLoading, setDocsLoading] = useState<boolean>(true);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { accessToken } = useAuth();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!accessToken) return;
    const fetchDocs = async () => {
      try {
        setDocsLoading(true);
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/documents`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data: unknown = await res.json();
        setDocs(Array.isArray(data) ? (data as Doc[]) : []);
      } catch {
        setDocs([]);
      } finally {
        setDocsLoading(false);
      }
    };
    fetchDocs();
  }, [accessToken]);

  const toggleDoc = (id: string): void => {
    setSelectedDocIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      return next;
    });
  };

  const selectedDocs = docs.filter(d => selectedDocIds.has(d.id));

  const sendMessage = async (): Promise<void> => {
    if (!input.trim() || loading) return;
    const content = input.trim();
    setInput("");

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      selectedDocs: [...selectedDocs],
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", citations: [], isStreaming: true },
    ]);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ question: content, document_ids: [...selectedDocIds] }),
      });

      if (!res.ok && !res.headers.get("content-type")?.includes("text/event-stream")) {
        const err = await res.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(
          (err as { detail?: string }).detail ??
          (err as { message?: string }).message ??
          "Request failed"
        );
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let citations: Citation[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        for (const line of decoder.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6)) as {
              token?: string;
              citations?: Citation[];
              error?: string;
              done?: boolean;
            };
            if (data.error) throw new Error(data.error);
            if (data.token) fullText += data.token;
            if (data.citations) citations = data.citations;
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: fullText, citations, isStreaming: !data.done }
                  : m
              )
            );
          } catch (e) {
            if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
          }
        }
      }

      setMessages(prev =>
        prev.map(m => (m.id === assistantId ? { ...m, isStreaming: false } : m))
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to get a response. Please try again.";
      setMessages(prev =>
        prev.map(m => (m.id === assistantId ? { ...m, content: msg, isStreaming: false } : m))
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#050810", color: "white", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.07);border-radius:2px}
        textarea::placeholder{color:rgba(255,255,255,0.18)}
        input::placeholder{color:rgba(255,255,255,0.2)}
      `}</style>

      {/* ── Header ── */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "13px 22px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <div style={{ width: 34, height: 34, background: "rgba(200,240,77,0.08)", border: "1px solid rgba(200,240,77,0.14)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Bot size={16} color="#c8f04d" />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em" }}>Research Chat</h1>
          <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,0.26)", fontFamily: "monospace" }}>Ask anything about your documents</p>
        </div>
      </div>

      {/* ── Messages ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "22px 18px", display: "flex", flexDirection: "column", gap: 18 }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "60px 0" }}>
            <div style={{ width: 54, height: 54, background: "rgba(200,240,77,0.05)", border: "1px solid rgba(200,240,77,0.1)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Bot size={22} color="rgba(200,240,77,0.3)" />
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 15 }}>Ask a question</p>
              <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.28)", maxWidth: 280 }}>Select up to 5 documents below, then type your question.</p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {["Summarize the main findings", "What methodology was used?", "Compare the two papers"].map(q => (
                <button key={q} onClick={() => setInput(q)}
                  style={{ border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.4)", fontSize: 12, padding: "6px 14px", borderRadius: 100, background: "transparent", cursor: "pointer", transition: "all 0.18s", fontFamily: "inherit" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(200,240,77,0.28)"; e.currentTarget.style.color = "white"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} style={{ display: "flex", gap: 10, flexDirection: msg.role === "user" ? "row-reverse" : "row", alignItems: "flex-start" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: msg.role === "user" ? "rgba(200,240,77,0.14)" : "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}>
              {msg.role === "user" ? <User size={12} color="#c8f04d" /> : <Bot size={12} color="rgba(255,255,255,0.45)" />}
            </div>

            <div style={{ maxWidth: "76%", display: "flex", flexDirection: "column", gap: 6, alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
              {msg.role === "user" && msg.selectedDocs && msg.selectedDocs.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>
                  {msg.selectedDocs.map(d => (
                    <span key={d.id} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(200,240,77,0.06)", border: "1px solid rgba(200,240,77,0.16)", borderRadius: 5, padding: "2px 7px", fontSize: 10, fontFamily: "monospace", color: "rgba(200,240,77,0.6)", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <FileText size={8} style={{ flexShrink: 0 }} />
                      {d.filename.replace(/\.pdf$/i, "")}
                    </span>
                  ))}
                </div>
              )}

              <div style={{ borderRadius: msg.role === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px", padding: "12px 15px", background: msg.role === "user" ? "rgba(200,240,77,0.07)" : "rgba(255,255,255,0.04)", border: msg.role === "user" ? "1px solid rgba(200,240,77,0.16)" : "1px solid rgba(255,255,255,0.07)" }}>
                {msg.role === "assistant" && msg.content
                  ? <StructuredMessage text={msg.content} />
                  : msg.isStreaming && !msg.content
                    ? (
                      <span style={{ display: "flex", gap: 5, alignItems: "center", padding: "4px 0" }}>
                        {[0, 1, 2].map(i => (
                          <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.28)", animation: "bounce 1s infinite", animationDelay: `${i * 0.15}s`, display: "inline-block" }} />
                        ))}
                      </span>
                    )
                    : <PlainMessage text={msg.content} />
                }
              </div>

              {msg.citations && msg.citations.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {msg.citations.map((cite, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(200,240,77,0.05)", border: "1px solid rgba(200,240,77,0.13)", borderRadius: 6, padding: "3px 8px" }}>
                      <FileText size={9} color="rgba(200,240,77,0.45)" />
                      <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(200,240,77,0.65)" }}>
                        {cite.docName} · p.{cite.page}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* ── Doc Selector ── */}
      <DocSelector docs={docs} loading={docsLoading} selectedIds={selectedDocIds} onToggle={toggleDoc} />

      {/* ── Input ── */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "11px 16px", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", maxWidth: 860, margin: "0 auto" }}>
          <div style={{ flex: 1, background: "#0c1120", border: selectedDocIds.size > 0 ? "1px solid rgba(200,240,77,0.18)" : "1px solid rgba(255,255,255,0.07)", borderRadius: 13, overflow: "hidden", transition: "border-color 0.2s", boxShadow: selectedDocIds.size > 0 ? "0 0 0 3px rgba(200,240,77,0.04)" : "none" }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selectedDocIds.size === 0 ? "Select documents above first…" : "Ask a question about your selected documents…"}
              rows={1}
              style={{ width: "100%", background: "transparent", padding: "11px 15px", fontSize: 13, color: "white", resize: "none", border: "none", outline: "none", fontFamily: "monospace", maxHeight: 120, lineHeight: 1.6, boxSizing: "border-box", caretColor: "#c8f04d" }}
            />
          </div>
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            style={{ width: 38, height: 38, borderRadius: 11, border: "none", cursor: "pointer", background: input.trim() && selectedDocIds.size > 0 ? "#c8f04d" : "rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.18s", opacity: !input.trim() || loading ? 0.38 : 1 }}
            onMouseEnter={e => { if (input.trim()) e.currentTarget.style.transform = "scale(1.07)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
          >
            <Send size={14} color={input.trim() && selectedDocIds.size > 0 ? "#050810" : "rgba(255,255,255,0.35)"} />
          </button>
        </div>
        <p style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.13)", fontFamily: "monospace", margin: "7px 0 0" }}>
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}