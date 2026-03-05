"use client";

import { useAuth } from "../contexts/AuthContext";
import { FileText, MessageSquare, Search, TrendingUp, Upload, ArrowRight } from "lucide-react";
import Link from "next/link";

const stats = [
  { label: "Documents", value: "0", icon: FileText, hint: "Uploaded" },
  { label: "Queries", value: "0", icon: Search, hint: "This week" },
  { label: "Chats", value: "0", icon: MessageSquare, hint: "Sessions" },
  { label: "Insights", value: "0", icon: TrendingUp, hint: "Extracted" },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-10">
        <p className="text-[#c8f04d]/60 font-mono text-xs uppercase tracking-widest mb-1">{greeting}</p>
        <h1 className="text-4xl font-black">{user?.name?.split(" ")[0]} 👋</h1>
        <p className="text-white/40 mt-1">Here's your research workspace.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {stats.map((s) => (
          <div key={s.label} className="pm-card p-4">
            <div className="flex items-center justify-between mb-3">
              <s.icon size={16} className="text-[#c8f04d]/60" />
              <span className="text-white/20 text-xs font-mono">{s.hint}</span>
            </div>
            <p className="text-3xl font-black">{s.value}</p>
            <p className="text-white/40 text-sm mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-4 mb-10">
        <Link href="/dashboard/documents"
          className="pm-card p-6 flex items-center gap-4 hover:border-[#c8f04d]/20 hover:bg-[#c8f04d]/5 transition-all group">
          <div className="w-12 h-12 bg-[#c8f04d]/10 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-[#c8f04d]/20 transition-colors">
            <Upload size={20} className="text-[#c8f04d]" />
          </div>
          <div className="flex-1">
            <p className="font-bold">Upload Documents</p>
            <p className="text-white/40 text-sm">Add PDFs, DOCX, or TXT files</p>
          </div>
          <ArrowRight size={16} className="text-white/20 group-hover:text-[#c8f04d] transition-colors" />
        </Link>

        <Link href="/dashboard/chat"
          className="pm-card p-6 flex items-center gap-4 hover:border-[#c8f04d]/20 hover:bg-[#c8f04d]/5 transition-all group">
          <div className="w-12 h-12 bg-[#c8f04d]/10 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-[#c8f04d]/20 transition-colors">
            <MessageSquare size={20} className="text-[#c8f04d]" />
          </div>
          <div className="flex-1">
            <p className="font-bold">Start Chatting</p>
            <p className="text-white/40 text-sm">Ask questions about your docs</p>
          </div>
          <ArrowRight size={16} className="text-white/20 group-hover:text-[#c8f04d] transition-colors" />
        </Link>
      </div>

      {/* Empty state */}
      <div className="pm-card p-10 text-center">
        <div className="w-16 h-16 bg-[#c8f04d]/5 border border-[#c8f04d]/15 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <FileText size={28} className="text-[#c8f04d]/40" />
        </div>
        <p className="font-bold text-lg mb-1">No documents yet</p>
        <p className="text-white/30 text-sm max-w-xs mx-auto mb-5">
          Upload your first document to start asking questions and getting cited answers.
        </p>
        <Link href="/dashboard/documents"
          className="inline-flex items-center gap-2 bg-[#c8f04d] text-[#050810] font-bold text-sm px-5 py-2.5 rounded-lg hover:bg-[#d4f86e] transition-colors">
          <Upload size={14} /> Upload First Document
        </Link>
      </div>
    </div>
  );
}