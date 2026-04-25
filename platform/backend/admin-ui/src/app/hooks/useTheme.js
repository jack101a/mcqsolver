/** useTheme — all glassmorphism CSS class strings derived from isDark flag. */
export function useTheme(isDark) {
  return {
    t_bg:          isDark ? "bg-[#020617] text-slate-200" : "bg-[#f1f5f9] text-slate-800",
    t_textHeading: isDark ? "text-white"      : "text-slate-900",
    t_textMuted:   isDark ? "text-slate-400"  : "text-slate-500",
    t_rowHover:    isDark ? "hover:bg-white/[0.03]" : "hover:bg-white/50",
    t_borderLight: isDark ? "border-white/[0.05]"   : "border-black/[0.05]",
    glassPanel:  isDark
      ? "bg-white/[0.02] backdrop-blur-2xl border border-white/[0.05] shadow-[0_8px_32px_0_rgba(0,0,0,0.3)]"
      : "bg-white/40 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)]",
    glassNav: isDark
      ? "bg-[#020617]/40 backdrop-blur-3xl border-b border-white/[0.05]"
      : "bg-white/40 backdrop-blur-3xl border-b border-white/60 shadow-sm",
    glassInput: [
      "w-full rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/50 focus:outline-none transition-all backdrop-blur-md",
      isDark
        ? "bg-black/20 border border-white/10 text-white placeholder-slate-500 focus:bg-black/40 shadow-inner"
        : "bg-white/50 border border-white/60 text-slate-900 placeholder-slate-400 focus:bg-white/80 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
    ].join(" "),
    glassButton: [
      "rounded-xl px-4 py-2 text-sm font-medium transition-all backdrop-blur-md flex items-center justify-center gap-2",
      isDark
        ? "bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-slate-300 hover:text-white"
        : "bg-white/60 hover:bg-white border border-white/80 text-slate-700 hover:text-indigo-600 shadow-sm"
    ].join(" "),
    solidButton: [
      "bg-indigo-500 hover:bg-indigo-400 text-white transition-all rounded-xl px-5 py-2.5 font-medium text-sm flex items-center justify-center gap-2",
      isDark
        ? "shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)]"
        : "shadow-lg shadow-indigo-500/30"
    ].join(" "),
    dangerButton: [
      "border rounded-lg px-3 py-1.5 text-xs font-medium transition-all backdrop-blur-md",
      isDark ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/20"
             : "bg-rose-100/50 hover:bg-rose-100 text-rose-600 border-rose-200"
    ].join(" "),
    badgeSuccess: [
      "px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wider font-semibold border backdrop-blur-md",
      isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
             : "bg-emerald-100/50 text-emerald-700 border-emerald-200"
    ].join(" "),
    badgeWarning: [
      "px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wider font-semibold border backdrop-blur-md",
      isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
             : "bg-amber-100/50 text-amber-700 border-amber-200"
    ].join(" "),
  };
}
