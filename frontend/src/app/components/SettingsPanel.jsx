import React, { useState, useEffect } from "react";
import { Download, Upload, Save, Bell, Globe, Shield, Database, Loader2 } from "lucide-react";

export function SettingsPanel({
  apiKeys,
  access,
  settingsKeyId,
  settingsAllDomains,
  setSettingsAllDomains,
  settingsDomainSelections,
  toggleSettingsDomainSelection,
  settingsKeyRpm,
  setSettingsKeyRpm,
  settingsKeyBurst,
  setSettingsKeyBurst,
  settingsCustomDomain,
  setSettingsCustomDomain,
  cloudBackupConfigured,
  handleSettingsKeyChange,
  handleSaveKeyAccessSettings,
  handleAddSettingsCustomDomain,
  handleSaveKeyRateLimitSettings,
  handleCreateBackupNow,
  handleRestoreLatestBackup,
  handleExportMasterSetup,
  handleImportMasterSetup,
  handleExportAutofill,
  handleImportAutofill,
  handleExportCaptcha,
  handleImportCaptcha,
  handleExportFullBackup,
  handleImportFullBackup,
  handleCloudBackupPush,
  handleCloudBackupPull,
  t_textHeading,
  t_textMuted,
  t_borderLight,
  t_rowHover,
  glassPanel,
  glassButton,
  glassInput,
  badgeSuccess,
  isDark,
  showToast
}) {
  const [globalSettings, setGlobalSettings] = useState({});
  const [loadingGlobal, setLoadingGlobal] = useState(true);
  const [savingGlobal, setSavingGlobal] = useState(false);

  useEffect(() => {
    fetchGlobalSettings();
  }, []);

  const fetchGlobalSettings = async () => {
    try {
      const resp = await fetch("/admin/api/settings", { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        const map = {};
        data.settings.forEach(s => {
          map[s.key] = s.value;
        });
        setGlobalSettings(map);
      }
    } catch (e) {
      console.error("Failed to fetch global settings", e);
    } finally {
      setLoadingGlobal(false);
    }
  };

  const handleSaveGlobal = async (e) => {
    e.preventDefault();
    setSavingGlobal(true);
    try {
      const resp = await fetch("/admin/api/settings/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: globalSettings }),
        credentials: "include"
      });
      if (resp.ok) {
        showToast("System settings updated.");
      } else {
        showToast("Failed to save settings", "error");
      }
    } catch (e) {
      showToast("Error saving settings", "error");
    } finally {
      setSavingGlobal(false);
    }
  };

  const updateGlobal = (key, value) => {
    setGlobalSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      {/* GLOBAL SYSTEM SETTINGS SECTION */}
      <div className={`rounded-2xl p-6 ${glassPanel}`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-500 rounded-lg backdrop-blur-md">
              <Globe size={20}/>
            </div>
            <div>
              <h2 className={`text-lg font-semibold ${t_textHeading}`}>Global System Settings</h2>
              <p className={`text-xs ${t_textMuted}`}>Configure platform-wide behavior and identity.</p>
            </div>
          </div>
          <button 
            onClick={handleSaveGlobal} 
            disabled={savingGlobal || loadingGlobal}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-all backdrop-blur-md flex items-center justify-center gap-2 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/40`}
          >
            {savingGlobal ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {savingGlobal ? "Saving..." : "Save System Config"}
          </button>
        </div>

        {loadingGlobal ? (
          <div className="flex justify-center p-8"><Loader2 className="animate-spin text-indigo-500" /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h4 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${t_textMuted}`}>
                <Shield size={14} /> Identity & Branding
              </h4>
              <div>
                <label className={`text-xs block mb-1 ${t_textMuted}`}>Platform Name</label>
                <input 
                  className={glassInput} 
                  value={globalSettings["platform.name"] || ""} 
                  onChange={(e) => updateGlobal("platform.name", e.target.value)}
                  placeholder="Unified Platform" 
                />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${t_textMuted}`}>
                <Bell size={14} /> Admin WhatsApp Alerts
              </h4>
              <div className="space-y-3">
                <label className={`flex items-center gap-2 text-xs ${t_textMuted}`}>
                  <input 
                    type="checkbox" 
                    checked={globalSettings["alerts.whatsapp_enabled"] === "true"} 
                    onChange={(e) => updateGlobal("alerts.whatsapp_enabled", e.target.checked ? "true" : "false")} 
                  />
                  Enable WhatsApp Alerts (New Key, Critical Errors)
                </label>
                <div>
                  <label className={`text-xs block mb-1 ${t_textMuted}`}>CallMeBot Phone (+91...)</label>
                  <input 
                    className={glassInput} 
                    value={globalSettings["alerts.callmebot_phone"] || ""} 
                    onChange={(e) => updateGlobal("alerts.callmebot_phone", e.target.value)}
                    placeholder="+919876543210" 
                  />
                </div>
                <div>
                  <label className={`text-xs block mb-1 ${t_textMuted}`}>CallMeBot API Key</label>
                  <input 
                    type="password"
                    className={glassInput} 
                    value={globalSettings["alerts.callmebot_apikey"] || ""} 
                    onChange={(e) => updateGlobal("alerts.callmebot_apikey", e.target.value)}
                    placeholder="xxxxxx" 
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* IMPORT/EXPORT HERO PANEL */}
      <div id="settings-section" className={`rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 transition-colors duration-500 ${glassPanel}`}>
        <div>
          <h2 className={`text-base font-semibold tracking-wide ${t_textHeading}`}>Master Configuration</h2>
          <p className={`text-[12px] mt-1 ${t_textMuted}`}>Export or import the entire database setup (JSON).</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <button onClick={handleExportMasterSetup} className={glassButton}>
            <Download size={16} className={isDark ? "text-indigo-400" : "text-indigo-600"}/> 
            Export
          </button>
          <form onSubmit={handleImportMasterSetup} className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto items-stretch sm:items-center">
            <input type="file" name="setup_file" accept=".json,application/json" required className={`min-w-0 flex-1 sm:w-48 text-xs file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-500/10 file:text-indigo-500 hover:file:bg-indigo-500/20 file:transition-colors ${t_textMuted}`} />
            <button type="submit" className={`w-full sm:w-auto ${glassButton}`}>
              <Upload size={16} className={isDark ? "text-cyan-400" : "text-cyan-600"}/>
              Import
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Key Domain Access */}
        <div className={`rounded-2xl p-6 transition-colors duration-500 ${glassPanel}`}>
          <h3 className={`text-base font-semibold mb-4 ${t_textHeading}`}>Key Domain Access</h3>
          <form onSubmit={handleSaveKeyAccessSettings} className="space-y-4">
            <div>
              <label className={`text-xs block mb-1 ${t_textMuted}`}>Select API Key</label>
              <select className={glassInput} value={settingsKeyId} onChange={(e) => handleSettingsKeyChange(e.target.value)}>
                <option value="" disabled>Select API key</option>
                {apiKeys.map((k) => <option key={k.id} value={k.id}>{k.name} (#{k.id})</option>)}
              </select>
            </div>
            <label className={`flex items-center gap-2 text-xs ${t_textMuted} font-medium`}>
              <input type="checkbox" checked={settingsAllDomains} onChange={(e) => setSettingsAllDomains(e.target.checked)} />
              Allow access to all domains
            </label>
            <div className={`max-h-32 overflow-auto rounded-xl border p-3 ${t_borderLight} ${settingsAllDomains ? "opacity-50 pointer-events-none" : ""}`}>
              {access.allowed_domains.map((domain) => (
                <label key={domain} className={`flex items-center gap-2 text-xs py-1 ${t_textMuted} hover:text-white transition-colors cursor-pointer`}>
                  <input type="checkbox" checked={settingsDomainSelections.includes(domain)} onChange={() => toggleSettingsDomainSelection(domain)} />
                  {domain}
                </label>
              ))}
              {access.allowed_domains.length === 0 && <p className="text-[10px] text-center italic py-2 opacity-50">No domains in system whitelist.</p>}
            </div>
            <div className={`flex gap-2 ${settingsAllDomains ? "opacity-50 pointer-events-none" : ""}`}>
              <input className={glassInput} value={settingsCustomDomain} onChange={(e) => setSettingsCustomDomain(e.target.value)} placeholder="Add custom domain" />
              <button type="button" onClick={handleAddSettingsCustomDomain} className={glassButton}>Add</button>
            </div>
            <button type="submit" className={glassButton}>Update Domain Access</button>
          </form>
        </div>

        {/* Key Rate Limit */}
        <div className={`rounded-2xl p-6 transition-colors duration-500 ${glassPanel}`}>
          <h3 className={`text-base font-semibold mb-4 ${t_textHeading}`}>Key Rate Limit</h3>
          <form onSubmit={handleSaveKeyRateLimitSettings} className="space-y-4">
            <div>
              <label className={`text-xs block mb-1 ${t_textMuted}`}>Select API Key</label>
              <select className={glassInput} value={settingsKeyId} onChange={(e) => handleSettingsKeyChange(e.target.value)}>
                <option value="" disabled>Select API key</option>
                {apiKeys.map((k) => <option key={k.id} value={k.id}>{k.name} (#{k.id})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`text-xs block mb-1 ${t_textMuted}`}>RPM Limit</label>
                <input type="number" min="1" className={glassInput} value={settingsKeyRpm} onChange={(e) => setSettingsKeyRpm(Number(e.target.value))} placeholder="60" />
              </div>
              <div>
                <label className={`text-xs block mb-1 ${t_textMuted}`}>Burst Allowance</label>
                <input type="number" min="0" className={glassInput} value={settingsKeyBurst} onChange={(e) => setSettingsKeyBurst(Number(e.target.value))} placeholder="10" />
              </div>
            </div>
            <button type="submit" className={glassButton}>Update Rate Limit</button>
          </form>
        </div>
      </div>

      {/* Backups Section */}
      <div className={`rounded-2xl p-6 transition-colors duration-500 ${glassPanel}`}>
        <h3 className={`text-base font-semibold mb-4 ${t_textHeading}`}>Data Resilience</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button type="button" onClick={handleCreateBackupNow} className={glassButton}>Create DB Snap</button>
          <button type="button" onClick={handleRestoreLatestBackup} className={glassButton}>Restore Latest</button>
          <button type="button" onClick={handleExportFullBackup} className={glassButton}>ZIP Master (+Models)</button>
          <form onSubmit={handleImportFullBackup} className="flex gap-2">
            <input type="file" name="backup_file" accept=".zip" required className="hidden" id="full-zip-input" onChange={(e) => e.target.form.requestSubmit()} />
            <label htmlFor="full-zip-input" className={`cursor-pointer ${glassButton} w-full`}>Import Master ZIP</label>
          </form>
          <button type="button" onClick={handleExportAutofill} className={glassButton}>Export Autofill</button>
          <form onSubmit={handleImportAutofill} className="flex gap-2">
            <input type="file" name="rules_file" accept=".json" required className="hidden" id="autofill-json-input" onChange={(e) => e.target.form.requestSubmit()} />
            <label htmlFor="autofill-json-input" className={`cursor-pointer ${glassButton} w-full`}>Import Autofill</label>
          </form>
          <button type="button" onClick={handleExportCaptcha} className={glassButton}>Export Captcha</button>
          <form onSubmit={handleImportCaptcha} className="flex gap-2">
            <input type="file" name="captcha_file" accept=".json" required className="hidden" id="captcha-json-input" onChange={(e) => e.target.form.requestSubmit()} />
            <label htmlFor="captcha-json-input" className={`cursor-pointer ${glassButton} w-full`}>Import Captcha</label>
          </form>
          <button type="button" disabled={!cloudBackupConfigured} onClick={handleCloudBackupPush} className={`${glassButton} ${!cloudBackupConfigured ? "opacity-40" : ""}`}>Push Cloud</button>
          <button type="button" disabled={!cloudBackupConfigured} onClick={handleCloudBackupPull} className={`${glassButton} ${!cloudBackupConfigured ? "opacity-40" : ""}`}>Pull Cloud</button>
        </div>
        {!cloudBackupConfigured && <p className={`text-[10px] mt-3 italic text-center ${t_textMuted}`}>Cloud providers (AWS/S3) not detected in environment.</p>}
      </div>

      {/* Overview Table */}
      <div className={`rounded-2xl p-6 transition-colors duration-500 ${glassPanel}`}>
        <h3 className={`text-base font-semibold mb-4 ${t_textHeading}`}>API Credentials Audit</h3>
        <div className="overflow-auto max-h-80 custom-scrollbar">
          <table className="w-full text-sm text-left min-w-[780px]">
            <thead>
              <tr className={`border-b ${t_textMuted} ${t_borderLight}`}>
                <th className="pb-3 font-medium">Key Identity</th>
                <th className="pb-3 font-medium">Domain Scope</th>
                <th className="pb-3 font-medium">Rate Limit</th>
                <th className="pb-3 font-medium text-right">Device Lock</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${t_borderLight}`}>
              {apiKeys.map((k) => (
                <tr key={`settings-key-${k.id}`} className={t_rowHover}>
                  <td className="py-4">
                    <div className={`font-semibold ${t_textHeading}`}>{k.name}</div>
                    <div className={`text-[10px] font-mono opacity-60 ${t_textMuted}`}>#{k.id}</div>
                  </td>
                  <td className="py-4 text-xs">
                    {k.all_domains ? (
                      <span className={badgeSuccess}>GLOBAL</span>
                    ) : (
                      <div className={`max-w-[280px] font-mono text-[10px] break-all leading-relaxed ${t_textMuted}`}>
                        {(k.allowed_domains || []).join(", ") || "No specific domains"}
                      </div>
                    )}
                  </td>
                  <td className="py-4 text-xs">
                    <div className={t_textHeading}>{(k.rate_limit?.requests_per_minute || 60)} RPM</div>
                    <div className={`text-[10px] ${t_textMuted}`}>Burst: {(k.rate_limit?.burst || 10)}</div>
                  </td>
                  <td className="py-4 text-xs text-right">
                    {k.device_binding?.device_id ? (
                      <span className="font-mono text-emerald-500/80 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20">{k.device_binding.device_id.slice(0,12)}...</span>
                    ) : (
                      <span className={`opacity-40 italic ${t_textMuted}`}>Unbound</span>
                    )}
                  </td>
                </tr>
              ))}
              {apiKeys.length === 0 && <tr><td colSpan="4" className="py-8 text-center opacity-40">No API keys registered.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
