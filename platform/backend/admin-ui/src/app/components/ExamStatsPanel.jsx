import React, { useState, useEffect } from "react";
import { Activity, BrainCircuit, Loader2, Save } from "lucide-react";

export function ExamStatsPanel({
  examStats,
  t_textHeading,
  t_textMuted,
  t_borderLight,
  glassPanel,
  glassInput,
  solidButton,
  isDark,
  showToast
}) {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const resp = await fetch("/admin/api/settings", { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        const settingsMap = {};
        data.settings.forEach(s => {
          settingsMap[s.key] = s.value;
        });
        setSettings(settingsMap);
      }
    } catch (e) {
      console.error("Failed to fetch settings", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const examSettings = {};
      Object.keys(settings).forEach(key => {
        if (key.startsWith("exam.")) {
          examSettings[key] = settings[key];
        }
      });

      const resp = await fetch("/admin/api/settings/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: settings }),
        credentials: "include"
      });

      if (resp.ok) {
        showToast("Exam settings saved successfully");
      } else {
        showToast("Failed to save settings", "error");
      }
    } catch (e) {
      showToast("Error saving settings", "error");
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`rounded-2xl p-5 ${glassPanel}`}>
          <p className={`text-sm font-medium ${t_textMuted}`}>Total Exam Solves</p>
          <p className={`text-3xl font-bold ${t_textHeading}`}>{(examStats.total_exam_solves || 0).toLocaleString()}</p>
        </div>
        <div className={`rounded-2xl p-5 ${glassPanel}`}>
          <p className={`text-sm font-medium ${t_textMuted}`}>Successful Solves</p>
          <p className={`text-3xl font-bold text-emerald-500`}>{(examStats.exam_ok_count || 0).toLocaleString()}</p>
        </div>
        <div className={`rounded-2xl p-5 ${glassPanel}`}>
          <p className={`text-sm font-medium ${t_textMuted}`}>Accuracy Rate</p>
          <p className={`text-3xl font-bold text-indigo-500`}>{examStats.exam_ok_rate || 0}%</p>
        </div>
      </div>

      {/* Configuration Form */}
      <div className={`rounded-2xl p-6 ${glassPanel}`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-500 rounded-lg backdrop-blur-md">
              <BrainCircuit size={20}/>
            </div>
            <h3 className={`text-lg font-semibold ${t_textHeading}`}>MCQ Solver Configuration</h3>
          </div>
          <button 
            onClick={handleSave} 
            disabled={saving}
            className={solidButton}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Saving..." : "Save Config"}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* AI / LLM Settings */}
          <div className="space-y-4">
            <h4 className={`text-xs font-bold uppercase tracking-widest ${t_textMuted}`}>AI / LLM Settings (LiteLLM)</h4>
            
            <div className="space-y-3">
              <div>
                <label className={`text-xs block mb-1 ${t_textMuted}`}>LiteLLM Proxy Endpoint</label>
                <input 
                  className={glassInput} 
                  value={settings["exam.litellm_endpoint"] || ""} 
                  onChange={(e) => updateSetting("exam.litellm_endpoint", e.target.value)}
                  placeholder="https://litellm.example.com" 
                />
              </div>
              <div>
                <label className={`text-xs block mb-1 ${t_textMuted}`}>Model Name</label>
                <input 
                  className={glassInput} 
                  value={settings["exam.litellm_model"] || ""} 
                  onChange={(e) => updateSetting("exam.litellm_model", e.target.value)}
                  placeholder="gpt-4, anthropic/claude-3, etc." 
                />
              </div>
              <div>
                <label className={`text-xs block mb-1 ${t_textMuted}`}>API Key</label>
                <input 
                  type="password"
                  className={glassInput} 
                  value={settings["exam.litellm_api_key"] || ""} 
                  onChange={(e) => updateSetting("exam.litellm_api_key", e.target.value)}
                  placeholder="sk-..." 
                />
              </div>
            </div>
          </div>

          {/* OCR & Resources */}
          <div className="space-y-4">
            <h4 className={`text-xs font-bold uppercase tracking-widest ${t_textMuted}`}>OCR & Local Resources</h4>
            
            <div className="space-y-3">
              <div>
                <label className={`text-xs block mb-1 ${t_textMuted}`}>Tesseract Data Path (TESSDATA_PREFIX)</label>
                <input 
                  className={glassInput} 
                  value={settings["exam.tessdata_path"] || ""} 
                  onChange={(e) => updateSetting("exam.tessdata_path", e.target.value)}
                  placeholder="/usr/share/tesseract-ocr/4.00/tessdata" 
                />
              </div>
              <div>
                <label className={`text-xs block mb-1 ${t_textMuted}`}>OCR Languages</label>
                <input 
                  className={glassInput} 
                  value={settings["exam.ocr_lang"] || "eng+mar"} 
                  onChange={(e) => updateSetting("exam.ocr_lang", e.target.value)}
                  placeholder="eng+mar" 
                />
              </div>
              <div className="pt-2">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className={`text-xs block mb-1 ${t_textMuted}`}>Question Bank</label>
                    <div className={`p-3 rounded-xl border ${t_borderLight} text-xs ${t_textHeading}`}>
                      Status: Active
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className={`text-xs block mb-1 ${t_textMuted}`}>Sign Hashes</label>
                    <div className={`p-3 rounded-xl border ${t_borderLight} text-xs ${t_textHeading}`}>
                      Indexed: Yes
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
