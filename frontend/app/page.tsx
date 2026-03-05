import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#050810] relative overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: "linear-gradient(#c8f04d 1px, transparent 1px), linear-gradient(90deg, #c8f04d 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

      {/* Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#c8f04d]/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#c8f04d] rounded-lg flex items-center justify-center">
            <span className="text-[#050810] font-black text-sm">PM</span>
          </div>
          <span className="font-black text-xl tracking-tight">PolyMind</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-white/60 hover:text-white text-sm transition-colors">Sign in</Link>
          <Link href="/register" className="bg-[#c8f04d] text-[#050810] font-bold text-sm px-4 py-2 rounded-lg hover:bg-[#d4f86e] transition-colors">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-7xl mx-auto px-8 pt-24 pb-32 text-center">
        <div className="inline-flex items-center gap-2 border border-[#c8f04d]/20 bg-[#c8f04d]/5 rounded-full px-4 py-1.5 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-[#c8f04d] animate-pulse" />
          <span className="text-[#c8f04d] text-xs font-mono tracking-widest uppercase">RAG-Powered Research</span>
        </div>

        <h1 className="text-6xl md:text-8xl font-black tracking-tight leading-none mb-6">
          Ask anything.<br />
          <span className="text-[#c8f04d]">Across all</span> your<br />
          documents.
        </h1>

        <p className="text-white/50 text-lg max-w-xl mx-auto mb-10 leading-relaxed">
          Upload PDFs, research papers, and reports. PolyMind uses semantic search and LLMs
          to surface exact answers with cited sources.
        </p>

        <div className="flex items-center justify-center gap-4">
          <Link href="/register" className="bg-[#c8f04d] text-[#050810] font-black px-8 py-4 rounded-xl hover:bg-[#d4f86e] transition-colors text-sm uppercase tracking-wide">
            Start for Free
          </Link>
          <Link href="/login" className="border border-white/15 text-white/70 px-8 py-4 rounded-xl hover:border-white/30 hover:text-white transition-colors text-sm">
            Sign In →
          </Link>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-16">
          {["Semantic Search", "Cited Answers", "Document Comparison", "Topic Clusters", "Auto-Summarization"].map((f) => (
            <span key={f} className="border border-white/10 text-white/40 text-xs px-3 py-1.5 rounded-full font-mono">
              {f}
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}