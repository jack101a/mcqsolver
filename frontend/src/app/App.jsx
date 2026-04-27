import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertCircle, Activity, Loader2 } from "lucide-react";

import { Sidebar }               from "./components/Sidebar";
import { DashboardPanel }         from "./components/DashboardPanel";
import { ModelsPanel }            from "./components/ModelsPanel";
import { MappingsPanel }          from "./components/MappingsPanel";
import { ExamStatsPanel }         from "./components/ExamStatsPanel";
import { SettingsPanel }          from "./components/SettingsPanel";
import { KeysPanel }              from "./components/KeysPanel";
import { AutofillProposalsPanel } from "./components/AutofillProposalsPanel";
import { CaptchaProposalsPanel }  from "./components/CaptchaProposalsPanel";

import { useToast }            from "./hooks/useToast";
import { useAdminData }        from "./hooks/useAdminData";
import { useAuth }             from "./hooks/useAuth";
import { useTheme }            from "./hooks/useTheme";
import { useKeyHandlers }      from "./hooks/useKeyHandlers";
import { useSettingsHandlers } from "./hooks/useSettingsHandlers";
import { useModelHandlers }    from "./hooks/useModelHandlers";
import { useProposalHandlers } from "./hooks/useProposalHandlers";

const THEME_KEY    = "tata_admin_theme";
const KEY_MEM_KEY  = "tata_admin_created_keys";

export function App() {
  // ── Data & auth hooks ──────────────────────────────────
  const { toast, showToast } = useToast();
  const {
    stats, apiKeys, access, models, mappings,
    failedPayloads, datasetsDir,
    autofillProposals, captchaProposals, examStats,
    cloudBackupConfigured, loading, masterKeyInfo,
    refresh: fetchBootstrap,
  } = useAdminData(showToast);
  const { logout: handleLogout } = useAuth();

  // ── UI state ───────────────────────────────────────────
  const [isDark,       setIsDark]       = useState(true);
  const [activePage,   setActivePage]   = useState("dashboard");
  const [rememberedKeys,    setRememberedKeys]    = useState({});
  const [createdKeyModal,   setCreatedKeyModal]   = useState({ open: false, keyId: null, keyValue: "" });
  const [editingModelId,    setEditingModelId]    = useState(null);
  const [editingModelDraft, setEditingModelDraft] = useState(null);
  const [editingMappingId,    setEditingMappingId]    = useState(null);
  const [editingMappingDraft, setEditingMappingDraft] = useState(null);
  const [assigningDomainDraft, setAssigningDomainDraft] = useState(null);
  const [selectedPayloads,     setSelectedPayloads]     = useState({});
  const [settingsKeyId,          setSettingsKeyId]          = useState("");
  const [settingsAllDomains,     setSettingsAllDomains]     = useState(true);
  const [settingsKeyRpm,         setSettingsKeyRpm]         = useState(60);
  const [settingsKeyBurst,       setSettingsKeyBurst]       = useState(10);
  const [settingsDomainSelections, setSettingsDomainSelections] = useState([]);
  const [settingsCustomDomain,     setSettingsCustomDomain]     = useState("");
  const [createKeyAllDomains,       setCreateKeyAllDomains]       = useState(true);
  const [createKeyDomainSelections, setCreateKeyDomainSelections] = useState([]);

  // ── Derived values ─────────────────────────────────────
  const latencyValue = useMemo(() => {
    const v = Math.max(0, Math.round(Number(stats.avg_processing_ms || 0)));
    return v > 9999 ? "9999+" : String(v);
  }, [stats.avg_processing_ms]);

  const mappingsByDomain = useMemo(() => {
    const grouped = {};
    for (const m of mappings) {
      const d = String(m.domain || "-").trim() || "-";
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push(m);
    }
    return Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]));
  }, [mappings]);

  const allPayloadSelected = failedPayloads.length > 0 && failedPayloads.every(p => selectedPayloads[p.name]);

  // ── Theme ──────────────────────────────────────────────
  const theme = useTheme(isDark);
  const { t_bg, t_textHeading, t_textMuted, t_borderLight, t_rowHover,
          glassPanel, glassNav, glassInput, glassButton, solidButton,
          dangerButton, badgeSuccess, badgeWarning } = theme;

  const navClass = (name) =>
    `text-sm font-medium transition-colors flex items-center gap-2 ${activePage === name ? t_textHeading : `${t_textMuted} hover:text-indigo-500`}`;

  // ── Shared form helper ─────────────────────────────────
  const postForm = async (url, payload) => {
    const fd = new FormData();
    Object.entries(payload).forEach(([k, v]) => { if (v !== undefined && v !== null) fd.append(k, v); });
    const resp = await fetch(url, { method: "POST", body: fd, credentials: "include" });
    if (!resp.ok) throw new Error(`Request failed (${resp.status})`);
    return resp;
  };

  // ── Persistence ────────────────────────────────────────
  useEffect(() => {
    try { const s = localStorage.getItem(THEME_KEY); if (s) setIsDark(s === "dark"); } catch(_) {}
  }, []);
  useEffect(() => {
    try { const r = localStorage.getItem(KEY_MEM_KEY); if (r) { const p = JSON.parse(r); if (p && typeof p === "object") setRememberedKeys(p); } } catch(_) {}
  }, []);
  useEffect(() => { try { localStorage.setItem(KEY_MEM_KEY, JSON.stringify(rememberedKeys)); } catch(_) {} }, [rememberedKeys]);
  useEffect(() => { try { localStorage.setItem(THEME_KEY, isDark ? "dark" : "light"); } catch(_) {} }, [isDark]);
  useEffect(() => {
    if (!apiKeys.length) return;
    const active = apiKeys.find(k => k.enabled) || apiKeys[0];
    if (!active) return;
    if (!settingsKeyId || !apiKeys.some(k => String(k.id) === String(settingsKeyId))) {
      setSettingsKeyId(String(active.id));
      setSettingsAllDomains(active.all_domains !== undefined ? Boolean(active.all_domains) : true);
      setSettingsDomainSelections(active.allowed_domains || []);
      setSettingsKeyRpm(Number(active.rate_limit?.requests_per_minute || 60));
      setSettingsKeyBurst(Number(active.rate_limit?.burst || 10));
    }
  }, [apiKeys, settingsKeyId]);

  // ── Handler hooks ──────────────────────────────────────
  const keyHandlers = useKeyHandlers({
    postForm, fetchBootstrap, showToast,
    rememberedKeys, setRememberedKeys,
    setCreatedKeyModal,
    createKeyAllDomains, setCreateKeyAllDomains,
    createKeyDomainSelections, setCreateKeyDomainSelections,
  });

  const settingsHandlers = useSettingsHandlers({
    postForm, fetchBootstrap, showToast, apiKeys, access,
    settingsKeyId, setSettingsKeyId,
    settingsAllDomains, setSettingsAllDomains,
    settingsDomainSelections, setSettingsDomainSelections,
    settingsKeyRpm, setSettingsKeyRpm,
    settingsKeyBurst, setSettingsKeyBurst,
    settingsCustomDomain, setSettingsCustomDomain,
  });

  const modelHandlers = useModelHandlers({
    postForm, fetchBootstrap, showToast,
    setEditingModelId, setEditingModelDraft, editingModelDraft,
    setEditingMappingId, setEditingMappingDraft, editingMappingDraft,
    setAssigningDomainDraft, assigningDomainDraft,
    failedPayloads, selectedPayloads, setSelectedPayloads, allPayloadSelected,
  });

  const proposalHandlers = useProposalHandlers({ fetchBootstrap, showToast });

  // ── Render ─────────────────────────────────────────────
  return (
    <div className={`min-h-screen font-sans selection:bg-indigo-500/30 relative overflow-x-hidden transition-colors duration-500 ${t_bg}`}>

      {/* Ambient background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className={`absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full filter blur-[100px] opacity-60 animate-blob ${isDark ? "bg-indigo-900 mix-blend-screen" : "bg-indigo-200 mix-blend-multiply"}`} />
        <div className={`absolute top-[0%] right-[-10%] w-[40vw] h-[40vw] rounded-full filter blur-[100px] opacity-60 animate-blob animation-delay-2000 ${isDark ? "bg-purple-900 mix-blend-screen" : "bg-purple-200 mix-blend-multiply"}`} />
        <div className={`absolute bottom-[-10%] left-[10%] w-[60vw] h-[60vw] rounded-full filter blur-[100px] opacity-60 animate-blob animation-delay-4000 ${isDark ? "bg-cyan-900 mix-blend-screen" : "bg-cyan-200 mix-blend-multiply"}`} />
      </div>

      <Sidebar activePage={activePage} setActivePage={setActivePage} isDark={isDark} setIsDark={setIsDark}
        handleLogout={handleLogout} navClass={navClass} t_textHeading={t_textHeading} t_textMuted={t_textMuted} glassNav={glassNav} />

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 relative z-10 space-y-8">

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 z-40 flex items-center justify-center">
            <div className={`${glassPanel} p-8 rounded-3xl flex flex-col items-center gap-4 animate-pulse`}>
              <Loader2 className="animate-spin text-indigo-500" size={32} />
              <p className={`text-sm font-medium ${t_textMuted}`}>Connecting to Tata Dashboard API...</p>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast.message && (
          <div className="fixed bottom-6 right-6 z-50 animate-bounce">
            <div className={`backdrop-blur-2xl border rounded-2xl px-5 py-3 shadow-2xl flex items-center gap-3
              ${toast.type === "error" ? "bg-rose-500/10 border-rose-500/30 text-rose-500" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"}
              ${isDark ? "" : "bg-white/80"}`}>
              {toast.type === "error" ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
              <span className="text-sm font-medium drop-shadow-sm">{toast.message}</span>
            </div>
          </div>
        )}

        {/* Key reveal modal */}
        {createdKeyModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className={`${glassPanel} w-full max-w-xl rounded-2xl p-5`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-lg font-semibold ${t_textHeading}`}>API Key</h3>
                <button onClick={() => setCreatedKeyModal({ open: false, keyId: null, keyValue: "" })} className={`text-sm ${t_textMuted} hover:text-rose-500`}>Close</button>
              </div>
              <p className={`text-xs mb-3 ${t_textMuted}`}>Key ID: {createdKeyModal.keyId ?? "–"} | Save this key securely — it won't be shown again.</p>
              <div className={`rounded-xl px-3 py-3 border font-mono text-xs break-all ${isDark ? "bg-black/30 border-white/10 text-emerald-300" : "bg-white/80 border-white text-emerald-700"}`}>
                {createdKeyModal.keyValue || "(no key value)"}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => keyHandlers.handleCopyKey(createdKeyModal.keyValue)} className={glassButton}>Copy Key</button>
                <button onClick={() => setCreatedKeyModal({ open: false, keyId: null, keyValue: "" })} className={solidButton}>Done</button>
              </div>
            </div>
          </div>
        )}

        {/* Dashboard page */}
        {activePage === "dashboard" && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Total Requests", value: stats.total_requests?.toLocaleString() || "0", color: "text-indigo-500" },
                { label: "Success",        value: stats.successful_requests?.toLocaleString() || "0", color: "text-emerald-500" },
                { label: "Failed",         value: stats.failed_requests?.toLocaleString() || "0", color: "text-rose-500" },
                { label: "Avg Latency",    value: `${latencyValue}ms`, color: "text-cyan-500" },
              ].map((s, i) => (
                <div key={i} className={`rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group ${glassPanel} ${t_rowHover}`}>
                  <div>
                    <p className={`text-sm font-medium mb-1 ${t_textMuted}`}>{s.label}</p>
                    <p className={`text-2xl sm:text-3xl font-bold tracking-tight ${t_textHeading}`}>{s.value}</p>
                  </div>
                  <div className={`p-3 rounded-xl border group-hover:scale-110 transition-transform ${isDark ? "bg-white/[0.05] border-white/5" : "bg-white border-white/60 shadow-sm"} ${s.color}`}>
                    <Activity size={24} />
                  </div>
                </div>
              ))}
            </div>

            <DashboardPanel
              failedPayloads={failedPayloads} selectedPayloads={selectedPayloads}
              allPayloadSelected={allPayloadSelected} datasetsDir={datasetsDir}
              {...modelHandlers}
              t_textHeading={t_textHeading} t_textMuted={t_textMuted}
              t_borderLight={t_borderLight} t_rowHover={t_rowHover}
              glassPanel={glassPanel} glassButton={glassButton} glassInput={glassInput} isDark={isDark}
            />

            <KeysPanel
              apiKeys={apiKeys} access={access} masterKeyInfo={masterKeyInfo}
              createKeyAllDomains={createKeyAllDomains} setCreateKeyAllDomains={setCreateKeyAllDomains}
              createKeyDomainSelections={createKeyDomainSelections}
              {...keyHandlers} {...settingsHandlers}
              t_textHeading={t_textHeading} t_textMuted={t_textMuted} t_borderLight={t_borderLight}
              glassPanel={glassPanel} glassButton={glassButton} glassInput={glassInput}
              badgeSuccess={badgeSuccess} badgeWarning={badgeWarning} dangerButton={dangerButton} isDark={isDark}
            />
          </div>
        )}

        {activePage === "models" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <ModelsPanel
              models={models} editingModelId={editingModelId}
              editingModelDraft={editingModelDraft} setEditingModelDraft={setEditingModelDraft}
              {...modelHandlers}
              t_textHeading={t_textHeading} t_textMuted={t_textMuted} t_borderLight={t_borderLight}
              glassPanel={glassPanel} glassButton={glassButton} glassInput={glassInput}
              solidButton={solidButton} badgeSuccess={badgeSuccess} badgeWarning={badgeWarning} isDark={isDark}
            />
            <MappingsPanel
              mappingsByDomain={mappingsByDomain} models={models}
              editingMappingId={editingMappingId} editingMappingDraft={editingMappingDraft}
              setEditingMappingDraft={setEditingMappingDraft}
              assigningDomainDraft={assigningDomainDraft} setAssigningDomainDraft={setAssigningDomainDraft}
              {...modelHandlers}
              t_textHeading={t_textHeading} t_textMuted={t_textMuted} t_borderLight={t_borderLight}
              t_rowHover={t_rowHover} glassPanel={glassPanel} glassButton={glassButton}
              glassInput={glassInput} solidButton={solidButton} isDark={isDark}
            />
          </div>
        )}

        {activePage === "autofill" && (
          <AutofillProposalsPanel
            autofillProposals={autofillProposals} {...proposalHandlers}
            t_textHeading={t_textHeading} t_textMuted={t_textMuted}
            t_borderLight={t_borderLight} t_rowHover={t_rowHover}
            glassPanel={glassPanel} glassButton={glassButton}
            badgeSuccess={badgeSuccess} badgeWarning={badgeWarning}
          />
        )}

        {activePage === "captcha" && (
          <CaptchaProposalsPanel
            mappings={mappings}
            handleRemoveMapping={modelHandlers.handleRemoveMapping}
            handleQuickEditMapping={modelHandlers.handleQuickEditMapping}
            captchaProposals={captchaProposals} models={models} {...proposalHandlers}
            t_textHeading={t_textHeading} t_textMuted={t_textMuted}
            t_borderLight={t_borderLight} t_rowHover={t_rowHover}
            glassPanel={glassPanel} glassButton={glassButton} glassInput={glassInput}
            badgeSuccess={badgeSuccess} badgeWarning={badgeWarning} isDark={isDark}
          />
        )}

        {activePage === "exam" && (
          <ExamStatsPanel
            examStats={examStats}
            t_textHeading={t_textHeading} t_textMuted={t_textMuted}
            t_borderLight={t_borderLight} glassPanel={glassPanel}
            glassInput={glassInput} solidButton={solidButton} isDark={isDark} showToast={showToast}
          />
        )}

        {activePage === "settings" && (
          <SettingsPanel
            apiKeys={apiKeys} access={access}
            settingsKeyId={settingsKeyId} settingsAllDomains={settingsAllDomains}
            setSettingsAllDomains={setSettingsAllDomains}
            settingsDomainSelections={settingsDomainSelections}
            settingsKeyRpm={settingsKeyRpm} setSettingsKeyRpm={setSettingsKeyRpm}
            settingsKeyBurst={settingsKeyBurst} setSettingsKeyBurst={setSettingsKeyBurst}
            settingsCustomDomain={settingsCustomDomain} setSettingsCustomDomain={setSettingsCustomDomain}
            cloudBackupConfigured={cloudBackupConfigured}
            {...settingsHandlers}
            t_textHeading={t_textHeading} t_textMuted={t_textMuted}
            t_borderLight={t_borderLight} t_rowHover={t_rowHover}
            glassPanel={glassPanel} glassButton={glassButton} glassInput={glassInput}
            badgeSuccess={badgeSuccess} isDark={isDark}
          />
        )}
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes blob { 0%{transform:translate(0,0) scale(1)} 33%{transform:translate(30px,-50px) scale(1.1)} 66%{transform:translate(-20px,20px) scale(0.9)} 100%{transform:translate(0,0) scale(1)} }
        .animate-blob{animation:blob 15s infinite alternate}
        .animation-delay-2000{animation-delay:2s}
        .animation-delay-4000{animation-delay:4s}
        .custom-scrollbar::-webkit-scrollbar{width:6px;height:6px}
        .custom-scrollbar::-webkit-scrollbar-track{background:transparent}
        .custom-scrollbar::-webkit-scrollbar-thumb{background:rgba(156,163,175,.3);border-radius:10px}
        .custom-scrollbar::-webkit-scrollbar-thumb:hover{background:rgba(156,163,175,.5)}
      ` }} />
    </div>
  );
}

export default App;
