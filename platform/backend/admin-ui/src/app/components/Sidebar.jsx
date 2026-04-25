import React from "react";
import { 
  LayoutDashboard, Database, Activity, BrainCircuit, Settings, 
  Sun, Moon, LogOut, MapPin
} from "lucide-react";

export function Sidebar({
  activePage,
  setActivePage,
  isDark,
  setIsDark,
  handleLogout,
  navClass,
  t_textHeading,
  t_textMuted,
  glassNav
}) {
  return (
    <nav className={`sticky top-0 z-50 transition-colors duration-500 ${glassNav}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <BrainCircuit size={18} className="text-white" />
            </div>
            <span className={`text-xl font-bold tracking-tight ${t_textHeading}`}>
              tata<span className="text-indigo-500">captcha</span>
            </span>
          </div>
          
          <div className="hidden md:flex items-center gap-6">
            <button type="button" onClick={() => setActivePage("dashboard")} className={navClass("dashboard")}><LayoutDashboard size={16}/> Dashboard</button>
            <button type="button" onClick={() => setActivePage("models")} className={navClass("models")}><Database size={16}/> Models</button>
            <button type="button" onClick={() => setActivePage("autofill")} className={navClass("autofill")}><Activity size={16}/> Autofill Rules</button>
            <button type="button" onClick={() => setActivePage("captcha")} className={navClass("captcha")}><MapPin size={16}/> Captcha Routes</button>
            <button type="button" onClick={() => setActivePage("exam")} className={navClass("exam")}><BrainCircuit size={16}/> MCQ/Exam</button>
            <button type="button" onClick={() => setActivePage("settings")} className={navClass("settings")}><Settings size={16}/> Settings</button>
          </div>

          <div className="md:hidden">
            <select
              value={activePage}
              onChange={(e) => setActivePage(e.target.value)}
              className={`text-xs rounded-lg px-2 py-1 border ${isDark ? "bg-black/30 border-white/10 text-slate-200" : "bg-white/80 border-slate-200 text-slate-700"}`}
            >
              <option value="dashboard">Dashboard</option>
              <option value="models">Models</option>
              <option value="autofill">Autofill Rules</option>
              <option value="captcha">Captcha Routes</option>
              <option value="exam">MCQ/Exam</option>
              <option value="settings">Settings</option>
            </select>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <button onClick={() => setIsDark(!isDark)} className={`p-2 rounded-lg transition-colors backdrop-blur-md ${isDark ? 'hover:bg-white/10 text-amber-400' : 'hover:bg-black/5 text-slate-700'}`} title="Toggle Theme">
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button onClick={handleLogout} className={`p-2 rounded-lg hover:text-rose-500 transition-colors ${t_textMuted}`} title="Logout"><LogOut size={20} /></button>
          </div>
        </div>
      </div>
    </nav>
  );
}
