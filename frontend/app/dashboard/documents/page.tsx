"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, FileText, Trash2, RefreshCw, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { apiFetch } from "../../lib/auth";
import { useAuth } from "@/app/contexts/AuthContext";

interface Document {
  id: string;
  name: string;
  size: number;
  status: "pending" | "processing" | "ready" | "error";
  pages?: number;
  uploadedAt: string;
  tags?: string[];
}

const statusConfig = {
  pending: { icon: Clock, color: "text-yellow-400", bg: "bg-yellow-400/10", label: "Pending" },
  processing: { icon: RefreshCw, color: "text-blue-400", bg: "bg-blue-400/10", label: "Processing" },
  ready: { icon: CheckCircle2, color: "text-[#c8f04d]", bg: "bg-[#c8f04d]/10", label: "Ready" },
  error: { icon: AlertCircle, color: "text-red-400", bg: "bg-red-400/10", label: "Error" },
};

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const { accessToken } = useAuth();

  // ── Fetch all documents on mount ──────────
  useEffect(() => {
    if (!accessToken) return;

    const fetchDocuments = async () => {
      setLoadingDocs(true);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/documents`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) throw new Error("Failed to fetch documents");
        const data = await res.json();
        const mapped: Document[] = data.map((d: any) => ({
          id: d.id,
          name: d.filename,
          size: d.size_bytes ?? 0,
          status: d.status,
          uploadedAt: d.created_at,
        }));

        setDocs(mapped);
      } catch (e) {
        console.error("Failed to load documents:", e);
      } finally {
        setLoadingDocs(false);
      }
    };

    fetchDocuments();
  }, [accessToken]);

  const pollStatus = (docId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/documents/${docId}/status`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const data = await res.json();

        setDocs(prev => prev.map(d =>
          d.id === docId ? { ...d, status: data.status } : d
        ));

        if (data.status === "ready" || data.status === "error") {
          clearInterval(interval);
        }
      } catch {
        clearInterval(interval);
      }
    }, 3000);

    setTimeout(() => clearInterval(interval), 120_000);
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ingest`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      const doc: Document = {
        id: data.doc_id,
        name: data.filename,
        size: data.size_bytes,
        status: data.status,
        uploadedAt: new Date().toISOString(),
      };

      setDocs(prev => [doc, ...prev]);
      pollStatus(data.doc_id);
    } catch (e: any) {
      alert(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    Array.from(e.dataTransfer.files).forEach(uploadFile);
  }, [accessToken]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/documents/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.message || "Failed to delete document");
      }

      // remove from UI only after success
      setDocs(prev => prev.filter(d => d.id !== id));

    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete document");
    }
  };

  const formatSize = (bytes: number) => bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-black mb-1">Documents</h1>
        <p className="text-white/40 text-sm">Manage your uploaded files and their ingestion status</p>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 mb-8 ${dragging
          ? "border-[#c8f04d]/60 bg-[#c8f04d]/5"
          : "border-white/10 hover:border-[#c8f04d]/30 hover:bg-[#c8f04d]/5"
          }`}>
        <input ref={inputRef} type="file" multiple accept=".pdf,.txt,.docx"
          className="hidden" onChange={(e) => Array.from(e.target.files || []).forEach(uploadFile)} />

        <div className="w-14 h-14 bg-[#c8f04d]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          {uploading
            ? <RefreshCw size={24} className="text-[#c8f04d] animate-spin" />
            : <Upload size={24} className="text-[#c8f04d]" />}
        </div>

        <p className="font-bold text-lg mb-1">
          {dragging ? "Drop to upload" : uploading ? "Uploading..." : "Drop files here or click to browse"}
        </p>
        <p className="text-white/30 text-sm font-mono">PDF · TXT · DOCX</p>
      </div>

      {/* Doc list */}
      {loadingDocs ? (
        <div className="pm-card p-8 text-center">
          <RefreshCw size={24} className="text-white/20 animate-spin mx-auto mb-3" />
          <p className="text-white/30 text-sm">Loading documents...</p>
        </div>
      ) : docs.length === 0 ? (
        <div className="pm-card p-8 text-center">
          <FileText size={32} className="text-white/10 mx-auto mb-3" />
          <p className="text-white/30 text-sm">No documents uploaded yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map((doc) => {
            const cfg = statusConfig[doc.status];
            return (
              <div key={doc.id} className="pm-card p-4 flex items-center gap-4">
                <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center shrink-0">
                  <FileText size={18} className="text-white/40" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{doc.name}</p>
                  <p className="text-white/30 text-xs font-mono mt-0.5">
                    {formatSize(doc.size)} {doc.pages ? `· ${doc.pages} pages` : ""}
                  </p>
                </div>

                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${cfg.bg}`}>
                  <cfg.icon size={11} className={`${cfg.color} ${doc.status === "processing" ? "animate-spin" : ""}`} />
                  <span className={`text-xs font-mono ${cfg.color}`}>{cfg.label}</span>
                </div>

                <button onClick={() => handleDelete(doc.id)}
                  className="text-white/20 hover:text-red-400 transition-colors p-1">
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}