import React, { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard, Key, ShieldCheck, Database, FileX2,
  Settings, LogOut, CheckCircle2, AlertCircle, Trash2,
  Plus, Upload, Download, BrainCircuit, Activity, XCircle, Sun, Moon, Loader2,
  CheckCircle2 as CheckCircle, AlertCircle as Alert, Download as Down, Upload as Up,
} from "lucide-react";

import { Sidebar } from "./components/Sidebar";
import { DashboardPanel } from "./components/DashboardPanel";
import { ModelsPanel } from "./components/ModelsPanel";
import { MappingsPanel } from "./components/MappingsPanel";
import { ExamStatsPanel } from "./components/ExamStatsPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { KeysPanel } from "./components/KeysPanel";
import { AutofillProposalsPanel } from "./components/AutofillProposalsPanel";

import { useToast } from "./hooks/useToast";
import { useAdminData } from "./hooks/useAdminData";
import { useAuth } from "./hooks/useAuth";

export function App() {
  // --- CUSTOM HOOKS ---
  const { toast, showToast } = useToast();
  const {
    stats, setStats,
    apiKeys, setApiKeys,
    access, setAccess,
    models, setModels,
    mappings, setMappings,
    failedPayloads, setFailedPayloads,
    datasetsDir, setDatasetsDir,
    autofillProposals, setAutofillProposals,
    examStats, setExamStats,
    cloudBackupConfigured, setCloudBackupConfigured,
    loading, setLoading,
    refresh: fetchBootstrap
  } = useAdminData(showToast);
  const { logout: handleLogout } = useAuth();

  // --- LOCAL UI STATE ---
  const [isDark, setIsDark] = useState(true);
  const [activePage, setActivePage] = useState("dashboard");
  const [createdKeyModal, setCreatedKeyModal] = useState({ open: false, keyId: null, keyValue: "" });
  const [rememberedKeys, setRememberedKeys] = useState({});
  const [editingModelId, setEditingModelId] = useState(null);
  const [editingModelDraft, setEditingModelDraft] = useState(null);
  const [editingMappingId, setEditingMappingId] = useState(null);
  const [editingMappingDraft, setEditingMappingDraft] = useState(null);
  const [assigningDomainDraft, setAssigningDomainDraft] = useState(null);
  const [selectedPayloads, setSelectedPayloads] = useState({});
  
  const [settingsKeyId, setSettingsKeyId] = useState("");
  const [settingsAllDomains, setSettingsAllDomains] = useState(true);
  const [settingsKeyRpm, setSettingsKeyRpm] = useState(60);
  const [settingsKeyBurst, setSettingsKeyBurst] = useState(10);
  const [settingsDomainSelections, setSettingsDomainSelections] = useState([]);
  const [settingsCustomDomain, setSettingsCustomDomain] = useState("");
  const [createKeyAllDomains, setCreateKeyAllDomains] = useState(true);
  const [createKeyDomainSelections, setCreateKeyDomainSelections] = useState([]);

  const roundedLatency = Math.max(0, Math.round(Number(stats.avg_processing_ms || 0)));
  const latencyValue = roundedLatency > 9999 ? "9999+" : String(roundedLatency);
  const keyMemoryStorageKey = "tata_admin_created_keys";
  const themeStorageKey = "tata_admin_theme";

  const mappingsByDomain = useMemo(() => {
    const grouped = {};
    for (const mapping of mappings) {
      const domain = String(mapping.domain || "-").trim() || "-";
      if (!grouped[domain]) grouped[domain] = [];
      grouped[domain].push(mapping);
    }
    return Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]));
  }, [mappings]);

  const allPayloadSelected = failedPayloads.length > 0 && failedPayloads.every((p) => selectedPayloads[p.name]);

  // --- PREMIUM GLASSMORPHISM THEME UTILS ---
  const t_bg = isDark ? "bg-[#020617] text-slate-200" : "bg-[#f1f5f9] text-slate-800";
  
  const glassPanel = isDark 
    ? "bg-white/[0.02] backdrop-blur-2xl border border-white/[0.05] shadow-[0_8px_32px_0_rgba(0,0,0,0.3)]" 
    : "bg-white/40 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)]";
  
  const glassNav = isDark
    ? "bg-[#020617]/40 backdrop-blur-3xl border-b border-white/[0.05]"
    : "bg-white/40 backdrop-blur-3xl border-b border-white/60 shadow-sm";
  
  const t_textHeading = isDark ? "text-white" : "text-slate-900";
  const t_textMuted = isDark ? "text-slate-400" : "text-slate-500";
  const t_rowHover = isDark ? "hover:bg-white/[0.03]" : "hover:bg-white/50";
  const t_borderLight = isDark ? "border-white/[0.05]" : "border-black/[0.05]";

  const glassInput = `w-full rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/50 focus:outline-none transition-all backdrop-blur-md ${
    isDark ? "bg-black/20 border border-white/10 text-white placeholder-slate-500 focus:bg-black/40 shadow-inner" 
           : "bg-white/50 border border-white/60 text-slate-900 placeholder-slate-400 focus:bg-white/80 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
  }`;

  const solidButton = `bg-indigo-500 hover:bg-indigo-400 text-white transition-all rounded-xl px-5 py-2.5 font-medium text-sm flex items-center justify-center gap-2 ${
    isDark ? "shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)]" 
           : "shadow-lg shadow-indigo-500/30"
  }`;
  
  const glassButton = `rounded-xl px-4 py-2 text-sm font-medium transition-all backdrop-blur-md flex items-center justify-center gap-2 ${
    isDark ? "bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-slate-300 hover:text-white" 
           : "bg-white/60 hover:bg-white border border-white/80 text-slate-700 hover:text-indigo-600 shadow-sm"
  }`;

  const dangerButton = `border rounded-lg px-3 py-1.5 text-xs font-medium transition-all backdrop-blur-md ${
    isDark ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/20" 
           : "bg-rose-100/50 hover:bg-rose-100 text-rose-600 border-rose-200"
  }`;

  const badgeSuccess = `px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wider font-semibold border backdrop-blur-md ${
    isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
           : "bg-emerald-100/50 text-emerald-700 border-emerald-200"
  }`;

  const badgeWarning = `px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wider font-semibold border backdrop-blur-md ${
    isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
           : "bg-amber-100/50 text-amber-700 border-amber-200"
  }`;

  const navClass = (name) => `text-sm font-medium transition-colors flex items-center gap-2 ${activePage === name ? t_textHeading : `${t_textMuted} hover:text-indigo-500`}`;

  // --- API HELPERS ---
  const postForm = async (url, payload) => {
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, value);
      }
    });
    const response = await fetch(url, {
      method: "POST",
      body: formData,
      credentials: "include"
    });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response;
  };

  // --- PERSISTENCE ---
  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem(themeStorageKey);
      if (savedTheme) setIsDark(savedTheme === "dark");
    } catch (_error) {}
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(keyMemoryStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") setRememberedKeys(parsed);
      }
    } catch (_error) {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(keyMemoryStorageKey, JSON.stringify(rememberedKeys));
    } catch (_error) {}
  }, [rememberedKeys]);

  useEffect(() => {
    try {
      window.localStorage.setItem(themeStorageKey, isDark ? "dark" : "light");
    } catch (_error) {}
  }, [isDark]);

  useEffect(() => {
    if (!apiKeys.length) return;
    const active = apiKeys.find((k) => k.enabled) || apiKeys[0];
    if (!active) return;
    if (!settingsKeyId || !apiKeys.some((k) => String(k.id) === String(settingsKeyId))) {
      setSettingsKeyId(String(active.id));
      const allowAll = active.all_domains !== undefined ? Boolean(active.all_domains) : true;
      setSettingsAllDomains(allowAll);
      setSettingsDomainSelections(active.allowed_domains || []);
      setSettingsKeyRpm(Number(active.rate_limit?.requests_per_minute || 60));
      setSettingsKeyBurst(Number(active.rate_limit?.burst || 10));
    }
  }, [apiKeys, settingsKeyId]);

  // --- EVENT HANDLERS ---
  const handleCreateKey = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    try {
      const response = await postForm("/admin/api/keys/create", {
        key_name: formData.get("key_name"),
        expiry_days: Number(formData.get("expiry_days") || 30),
        all_domains: createKeyAllDomains ? "on" : "",
        allowed_domains_csv: createKeyAllDomains ? "" : createKeyDomainSelections.join(","),
        requests_per_minute: Number(formData.get("requests_per_minute") || 0),
        burst: Number(formData.get("burst") || 0)
      });
      const payload = await response.json();
      await fetchBootstrap();
      if (payload.key_id && payload.api_key) {
        setRememberedKeys((prev) => ({ ...prev, [String(payload.key_id)]: payload.api_key }));
      }
      setCreatedKeyModal({
        open: true,
        keyId: payload.key_id ?? null,
        keyValue: payload.api_key || ""
      });
      e.target.reset();
      setCreateKeyAllDomains(true);
      setCreateKeyDomainSelections([]);
      showToast("API key created.");
    } catch { showToast("Failed to create key", "error"); }
  };

  const handleCopyKey = async (keyValue) => {
    if (!keyValue) {
      showToast("No key available to copy", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(keyValue);
      showToast("API key copied.");
    } catch (_error) {
      showToast("Clipboard copy failed", "error");
    }
  };

  const handleViewStoredKey = (keyId) => {
    const value = rememberedKeys[String(keyId)];
    if (!value) {
      showToast("This key cannot be shown. Only keys created from this dashboard browser can be viewed.", "error");
      return;
    }
    setCreatedKeyModal({ open: true, keyId, keyValue: value });
  };

  const handleRevokeKey = async (id) => {
    if (!window.confirm("Revoke this API Key? Client access will be cut immediately.")) return;
    try {
      await postForm("/admin/keys/revoke", { key_id: id });
      await fetchBootstrap();
      showToast(`Key #${id} revoked.`, "error");
    } catch { showToast("Failed to revoke key", "error"); }
  };

  const handleDeleteRevokedKey = async (id) => {
    if (!window.confirm("Delete this revoked key entry? This cannot be undone.")) return;
    try {
      await postForm("/admin/keys/delete", { key_id: id });
      setRememberedKeys((prev) => {
        const next = { ...prev };
        delete next[String(id)];
        return next;
      });
      await fetchBootstrap();
      showToast(`Key #${id} deleted.`, "error");
    } catch {
      showToast("Only revoked keys can be deleted", "error");
    }
  };

  const handleSettingsKeyChange = (nextId) => {
    setSettingsKeyId(String(nextId));
    const key = apiKeys.find((k) => String(k.id) === String(nextId));
    if (!key) return;
    const allowAll = key.all_domains !== undefined ? Boolean(key.all_domains) : true;
    setSettingsAllDomains(allowAll);
    setSettingsDomainSelections(key.allowed_domains || []);
    setSettingsKeyRpm(Number(key.rate_limit?.requests_per_minute || 60));
    setSettingsKeyBurst(Number(key.rate_limit?.burst || 10));
  };

  const handleSaveKeyAccessSettings = async (e) => {
    e.preventDefault();
    if (!settingsKeyId) return;
    try {
      await postForm("/admin/keys/access/update", {
        key_id: Number(settingsKeyId),
        all_domains: settingsAllDomains ? "on" : "",
        allowed_domains_csv: settingsAllDomains ? "" : settingsDomainSelections.join(",")
      });
      await fetchBootstrap();
      showToast("Key domain access updated.");
    } catch {
      showToast("Failed to update key access", "error");
    }
  };

  const handleSaveKeyRateLimitSettings = async (e) => {
    e.preventDefault();
    if (!settingsKeyId) return;
    try {
      await postForm("/admin/keys/rate-limit/update", {
        key_id: Number(settingsKeyId),
        requests_per_minute: Number(settingsKeyRpm),
        burst: Number(settingsKeyBurst)
      });
      await fetchBootstrap();
      showToast("Key rate limit updated.");
    } catch {
      showToast("Failed to update key rate limit", "error");
    }
  };

  const handleCreateBackupNow = async () => {
    try {
      await postForm("/admin/backups/create", {});
      showToast("Backup created.");
    } catch {
      showToast("Failed to create backup", "error");
    }
  };

  const handleCloudBackupPush = async () => {
    try {
      await postForm("/admin/backups/cloud/push", {});
      showToast("Cloud backup pushed.");
    } catch {
      showToast("Cloud backup push failed", "error");
    }
  };

  const handleCloudBackupPull = async () => {
    if (!window.confirm("Restore from cloud backup now?")) return;
    try {
      await postForm("/admin/backups/cloud/pull", {});
      await fetchBootstrap();
      showToast("Cloud backup restored.");
    } catch {
      showToast("Cloud backup restore failed", "error");
    }
  };

  const toggleCreateKeyDomain = (domain) => {
    setCreateKeyDomainSelections((prev) => (
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain]
    ));
  };

  const toggleSettingsDomainSelection = (domain) => {
    setSettingsDomainSelections((prev) => (
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain]
    ));
  };

  const handleAddSettingsCustomDomain = () => {
    const token = String(settingsCustomDomain || "").trim().toLowerCase();
    if (!token) return;
    if (!settingsDomainSelections.includes(token)) {
      setSettingsDomainSelections((prev) => [...prev, token]);
    }
    setSettingsCustomDomain("");
  };

  const handleRestoreLatestBackup = async () => {
    if (!window.confirm("Restore latest backup? This will overwrite current settings.")) return;
    try {
      await postForm("/admin/backups/restore-latest", {});
      await fetchBootstrap();
      showToast("Latest backup restored.");
    } catch {
      showToast("Failed to restore backup", "error");
    }
  };

  const handleAddDomain = async (e) => {
    e.preventDefault();
    const domain = new FormData(e.target).get("new_domain");
    if (domain) {
      try {
        await postForm("/admin/access", {
          global_access: access.global_access ? "on" : null,
          new_domain: domain
        });
        await fetchBootstrap();
        e.target.reset();
        showToast(`Domain ${domain} added.`);
      } catch { showToast("Failed to add domain", "error"); }
    }
  };

  const handleRemoveDomain = async (domain) => {
    if (!window.confirm(`Remove ${domain} from whitelist?`)) return;
    try {
      await postForm("/admin/access/remove", { domain });
      await fetchBootstrap();
      showToast(`Domain ${domain} removed.`, "error");
    } catch { showToast("Failed to remove domain", "error"); }
  };

  const handleRegisterModel = async (e) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    const fd = new FormData(formEl);
    const modelFile = fd.get("model_file");
    if (!modelFile || typeof modelFile === "string" || !modelFile.name) {
      showToast("Please choose an ONNX model file first", "error");
      return;
    }
    const upload = new FormData();
    upload.append("ai_model_name", fd.get("ai_model_name"));
    upload.append("version", fd.get("version"));
    upload.append("task_type", fd.get("task_type"));
    upload.append("runtime", fd.get("runtime"));

    let uploadBlob = modelFile;
    try {
      const fileBuffer = await modelFile.arrayBuffer();
      uploadBlob = new Blob([fileBuffer], { type: modelFile.type || "application/octet-stream" });
    } catch (_error) {
      showToast("Could not read selected file.", "error");
      return;
    }
    upload.append("ai_model_file", uploadBlob, modelFile.name);
    try {
      // Send x-admin-api: 1 so the backend returns JSON instead of a 303 redirect.
      // Without this header the endpoint returns a redirect to /admin/ (HTML),
      // and response.json() would throw a parse error on the HTML body.
      const response = await fetch("/admin/models/upload", {
        method: "POST",
        body: upload,
        credentials: "include",
        headers: { "x-admin-api": "1" }
      });
      let payload = {};
      try { payload = await response.json(); } catch (_) {}
      if (!response.ok || payload.ok !== true) {
        throw new Error(payload.message || `Upload failed (${response.status})`);
      }
      await fetchBootstrap();
      formEl.reset();
      showToast(`Model registered: ${payload.filename || "done"}`);
    } catch (error) {
      showToast(error.message || "Failed to register model", "error");
    }
  };

  const handleExportMasterSetup = () => {
    window.location.assign("/admin/export/master-setup.json");
  };

  const handleImportMasterSetup = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const setupFile = fd.get("setup_file");
    const payload = new FormData();
    payload.append("setup_file", setupFile);
    try {
      const response = await fetch("/admin/import/master-setup", {
        method: "POST",
        body: payload,
        credentials: "include"
      });
      const body = await response.json();
      if (!response.ok || body.ok === false) throw new Error(body.message || "Import failed");
      await fetchBootstrap();
      e.target.reset();
      showToast("Master setup imported.");
    } catch (error) {
      showToast(error.message || "Import failed", "error");
    }
  };

  const handleChangeModelState = async (id, state) => {
    try {
      await postForm("/admin/models/promote", { ai_model_id: id, lifecycle_state: state });
      await fetchBootstrap();
      showToast(`Model #${id} -> ${state}.`);
    } catch { showToast("Failed to change model state", "error"); }
  };

  const handleDeleteModel = async (id) => {
    if (!window.confirm("Delete this AI model? This will fail if any domain mappings still reference it.")) return;
    try {
      const fd = new FormData();
      fd.append("ai_model_id", String(id));
      const response = await fetch("/admin/models/remove", {
        method: "POST", body: fd, credentials: "include", headers: { "x-admin-api": "1" }
      });
      let payload = {};
      try { payload = await response.json(); } catch (_) {}
      if (!response.ok || payload.ok !== true) {
        throw new Error(payload.message || payload.detail || `Failed (${response.status})`);
      }
      await fetchBootstrap();
      showToast(`Model #${id} removed.`, "error");
    } catch (err) { showToast(err.message || "Failed to remove model", "error"); }
  };

  const beginEditModel = (model) => {
    setEditingModelId(model.id);
    setEditingModelDraft({
      ai_model_name: model.ai_model_name || "",
      version: model.version || "v1",
      task_type: model.task_type || "image",
      lifecycle_state: model.lifecycle_state || "candidate",
      notes: model.notes || ""
    });
  };

  const cancelEditModel = () => {
    setEditingModelId(null);
    setEditingModelDraft(null);
  };

  const handleSaveModelEdit = async (e, modelId) => {
    e.preventDefault();
    try {
      await postForm("/admin/models/update", {
        ai_model_id: modelId,
        ...editingModelDraft
      });
      await fetchBootstrap();
      showToast(`Model #${modelId} updated.`);
      cancelEditModel();
    } catch { showToast("Failed to update model", "error"); }
  };

  const handleSaveMapping = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await postForm("/admin/mappings/set", {
        domain: fd.get("domain"),
        source_data_type: "image",
        source_selector: fd.get("source_selector"),
        target_selector: fd.get("target_selector"),
        target_data_type: "text_input",
        ai_model_id: Number(fd.get("ai_model_id"))
      });
      await fetchBootstrap();
      e.target.reset();
      showToast("Field mapping created.");
    } catch { showToast("Failed to create mapping", "error"); }
  };

  const beginEditMapping = (mapping) => {
    setEditingMappingId(mapping.id);
    setEditingMappingDraft({
      domain: mapping.domain || "",
      source_data_type: mapping.source_data_type || "image",
      source_selector: mapping.source_selector || "",
      target_data_type: mapping.target_data_type || "text_input",
      target_selector: mapping.target_selector || "",
      ai_model_id: Number(mapping.ai_model_id)
    });
  };

  const cancelEditMapping = () => {
    setEditingMappingId(null);
    setEditingMappingDraft(null);
  };

  const handleSaveMappingEdit = async (e, mappingId) => {
    e.preventDefault();
    try {
      await postForm("/admin/mappings/update", {
        mapping_id: mappingId,
        ...editingMappingDraft
      });
      await fetchBootstrap();
      showToast("Mapping updated.");
      cancelEditMapping();
    } catch { showToast("Failed to update mapping", "error"); }
  };

  const beginAssignDomainModel = (domain, domainMappings, allModels) => {
    const firstMappedModel = domainMappings.find((m) => Number(m.ai_model_id));
    // Fall back to first model in registry so the select is never empty
    const firstAvailable = allModels && allModels.length > 0 ? allModels[0] : null;
    const defaultId = firstMappedModel
      ? Number(firstMappedModel.ai_model_id)
      : firstAvailable ? Number(firstAvailable.id) : "";
    setAssigningDomainDraft({ domain, ai_model_id: defaultId });
  };

  const cancelAssignDomainModel = () => {
    setAssigningDomainDraft(null);
  };

  const handleSaveDomainModelAssign = async (e) => {
    e.preventDefault();
    if (!assigningDomainDraft?.ai_model_id) {
      showToast("Please select a model first", "error");
      return;
    }
    try {
      const fd = new FormData();
      fd.append("domain", assigningDomainDraft.domain);
      fd.append("ai_model_id", String(assigningDomainDraft.ai_model_id));
      const response = await fetch("/admin/mappings/domain/assign-model", {
        method: "POST",
        body: fd,
        credentials: "include",
        headers: { "x-admin-api": "1" }
      });
      let payload = {};
      try { payload = await response.json(); } catch (_) {}
      if (!response.ok || payload.ok !== true) {
        throw new Error(payload.message || payload.detail || `Failed (${response.status})`);
      }
      await fetchBootstrap();
      showToast(`Model assigned to ${assigningDomainDraft.domain}.`);
      cancelAssignDomainModel();
    } catch (err) { showToast(err.message || "Failed to assign model", "error"); }
  };

  const handleRemoveMapping = async (id) => {
    if (!window.confirm("Delete this routing map?")) return;
    try {
      await postForm("/admin/mappings/remove", { mapping_id: id });
      await fetchBootstrap();
      showToast("Mapping removed.", "error");
    } catch { showToast("Failed to remove mapping", "error"); }
  };

  const handleTestMapping = async (mappingId, domain) => {
    try {
      await postForm("/admin/mappings/test", { mapping_id: mappingId });
      showToast(`Test triggered for ${domain}`);
    } catch { showToast("Failed to test mapping", "error"); }
  };

  const handleToggleGlobalAccess = async (checked) => {
    try {
      await postForm("/admin/access", {
        global_access: checked ? "on" : null,
        new_domain: ""
      });
      await fetchBootstrap();
      showToast(`Global access ${checked ? "enabled" : "disabled"}`);
    } catch { showToast("Failed to update access", "error"); }
  };

  const handleLabelPayload = async (filename, domain, aiGuess, e) => {
    e.preventDefault();
    const text = new FormData(e.target).get("corrected_text");
    try {
      await postForm("/admin/datasets/label", {
        filename, domain, ai_guess: aiGuess, corrected_text: text
      });
      await fetchBootstrap();
      showToast(`Labeled as "${text}".`);
    } catch { showToast("Failed to label payload", "error"); }
  };

  const handleIgnorePayload = async (filename) => {
    if (!window.confirm("Discard payload?")) return;
    try {
      await postForm("/admin/datasets/ignore", { filename });
      await fetchBootstrap();
      showToast("Payload ignored.");
    } catch { showToast("Failed to ignore payload", "error"); }
  };

  const togglePayload = (name) => {
    setSelectedPayloads((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const toggleAllPayloads = () => {
    if (allPayloadSelected) {
      setSelectedPayloads({});
      return;
    }
    const next = {};
    failedPayloads.forEach((p) => { next[p.name] = true; });
    setSelectedPayloads(next);
  };

  const handleBulkIgnorePayloads = async () => {
    const selected = failedPayloads.filter((p) => selectedPayloads[p.name]);
    try {
      for (const item of selected) {
        await postForm("/admin/datasets/ignore", { filename: item.name });
      }
      setSelectedPayloads({});
      await fetchBootstrap();
      showToast(`Ignored ${selected.length} payload(s).`);
    } catch { showToast("Bulk ignore failed", "error"); }
  };

  const handleBulkSavePayloads = async () => {
    const selected = failedPayloads.filter((p) => selectedPayloads[p.name]);
    try {
      for (const item of selected) {
        await postForm("/admin/datasets/label", {
          filename: item.name,
          domain: item.domain,
          ai_guess: item.ocr_guess,
          corrected_text: item.corrected_text || item.ocr_guess
        });
      }
      setSelectedPayloads({});
      await fetchBootstrap();
      showToast(`Saved ${selected.length} payload(s).`);
    } catch { showToast("Bulk save failed", "error"); }
  };

  const handleApproveAutofillProposal = async (id) => {
    try {
      const resp = await fetch(`/admin/api/autofill/proposals/${id}/approve`, { method: "POST", credentials: "include" });
      if (resp.ok) {
        showToast("Autofill rule approved.");
        fetchBootstrap();
      } else { throw new Error(); }
    } catch { showToast("Failed to approve autofill rule", "error"); }
  };

  const handleBulkApproveAutofillProposals = async (ids) => {
    try {
      const resp = await fetch("/admin/api/autofill/proposals/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal_ids: ids.map(Number) }),
        credentials: "include"
      });
      if (resp.ok) {
        showToast(`Approved ${ids.length} rules.`);
        fetchBootstrap();
      } else { throw new Error(); }
    } catch { showToast("Failed to bulk approve rules", "error"); }
  };

  const handleRejectAutofillProposal = async (id) => {
    if (!window.confirm("Reject proposal?")) return;
    try {
      const resp = await fetch(`/admin/api/autofill/proposals/${id}/reject`, { method: "POST", credentials: "include" });
      if (resp.ok) {
        showToast("Autofill rule rejected.", "error");
        fetchBootstrap();
      } else { throw new Error(); }
    } catch { showToast("Failed to reject autofill rule", "error"); }
  };

  const handleBulkRejectAutofillProposals = async (ids) => {
    try {
      const resp = await fetch("/admin/api/autofill/proposals/bulk-reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal_ids: ids.map(Number) }),
        credentials: "include"
      });
      if (resp.ok) {
        showToast(`Rejected ${ids.length} rules.`, "error");
        fetchBootstrap();
      } else { throw new Error(); }
    } catch { showToast("Failed to bulk reject rules", "error"); }
  };

  return (
    <div className={`min-h-screen font-sans selection:bg-indigo-500/30 relative overflow-x-hidden transition-colors duration-500 ${t_bg}`}>
      
      {/* VIBRANT AMBIENT BACKGROUND BLOBS */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className={`absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full mix-blend-multiply filter blur-[100px] opacity-60 animate-blob ${isDark ? 'bg-indigo-900 mix-blend-screen' : 'bg-indigo-200'}`} />
        <div className={`absolute top-[0%] right-[-10%] w-[40vw] h-[40vw] rounded-full mix-blend-multiply filter blur-[100px] opacity-60 animate-blob animation-delay-2000 ${isDark ? 'bg-purple-900 mix-blend-screen' : 'bg-purple-200'}`} />
        <div className={`absolute bottom-[-10%] left-[10%] w-[60vw] h-[60vw] rounded-full mix-blend-multiply filter blur-[100px] opacity-60 animate-blob animation-delay-4000 ${isDark ? 'bg-cyan-900 mix-blend-screen' : 'bg-cyan-200'}`} />
      </div>

      <Sidebar 
        activePage={activePage}
        setActivePage={setActivePage}
        isDark={isDark}
        setIsDark={setIsDark}
        handleLogout={handleLogout}
        navClass={navClass}
        t_textHeading={t_textHeading}
        t_textMuted={t_textMuted}
        glassNav={glassNav}
      />

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 relative z-10 space-y-8">
        {loading && (
          <div className="absolute inset-0 z-40 flex items-center justify-center">
            <div className={`${glassPanel} p-8 rounded-3xl flex flex-col items-center gap-4 animate-pulse`}>
              <Loader2 className="animate-spin text-indigo-500" size={32} />
              <p className={`text-sm font-medium ${t_textMuted}`}>Connecting to Tata Dashboard API...</p>
            </div>
          </div>
        )}

        {toast.message && (
          <div className="fixed bottom-6 right-6 z-50 animate-bounce">
            <div className={`backdrop-blur-2xl border rounded-2xl px-5 py-3 shadow-2xl flex items-center gap-3
              ${toast.type === 'error' ? 'bg-rose-500/10 border-rose-500/30 text-rose-500' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'}
              ${isDark ? '' : 'bg-white/80'}`}>
              {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
              <span className="text-sm font-medium drop-shadow-sm">{toast.message}</span>
            </div>
          </div>
        )}

        {createdKeyModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className={`${glassPanel} w-full max-w-xl rounded-2xl p-5`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-lg font-semibold ${t_textHeading}`}>API Key</h3>
                <button type="button" onClick={() => setCreatedKeyModal({ open: false, keyId: null, keyValue: "" })} className={`text-sm ${t_textMuted} hover:text-rose-500`}>Close</button>
              </div>
              <p className={`text-xs mb-3 ${t_textMuted}`}>Key ID: {createdKeyModal.keyId ?? "-"} | Save this key securely.</p>
              <div className={`rounded-xl px-3 py-3 border font-mono text-xs break-all ${isDark ? "bg-black/30 border-white/10 text-emerald-300" : "bg-white/80 border-white text-emerald-700"}`}>
                {createdKeyModal.keyValue || "(no key value)"}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => handleCopyKey(createdKeyModal.keyValue)} className={glassButton}>Copy Key</button>
                <button type="button" onClick={() => setCreatedKeyModal({ open: false, keyId: null, keyValue: "" })} className={solidButton}>Done</button>
              </div>
            </div>
          </div>
        )}

        {activePage === "dashboard" && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Requests', value: stats.total_requests?.toLocaleString() || "0", icon: <Activity size={24}/>, color: 'text-indigo-500' },
                { label: 'Success', value: stats.successful_requests?.toLocaleString() || "0", icon: <CheckCircle2 size={24}/>, color: 'text-emerald-500' },
                { label: 'Failed', value: stats.failed_requests?.toLocaleString() || "0", icon: <AlertCircle size={24}/>, color: 'text-rose-500' },
                { label: 'Avg Latency', value: `${latencyValue}ms`, icon: <Activity size={24}/>, color: 'text-cyan-500' }
              ].map((stat, i) => (
                <div key={i} className={`rounded-2xl transition-colors duration-500 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group ${glassPanel} ${t_rowHover}`}>
                  <div>
                    <p className={`text-sm font-medium mb-1 drop-shadow-sm ${t_textMuted}`}>{stat.label}</p>
                    <p className={`text-2xl sm:text-3xl font-bold tracking-tight drop-shadow-md ${t_textHeading}`}>{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-xl border group-hover:scale-110 transition-transform ${isDark ? 'bg-white/[0.05] border-white/5' : 'bg-white border-white/60 shadow-sm'} ${stat.color}`}>
                    {stat.icon}
                  </div>
                </div>
              ))}
            </div>

            <DashboardPanel 
              failedPayloads={failedPayloads}
              selectedPayloads={selectedPayloads}
              allPayloadSelected={allPayloadSelected}
              datasetsDir={datasetsDir}
              togglePayload={togglePayload}
              toggleAllPayloads={toggleAllPayloads}
              handleLabelPayload={handleLabelPayload}
              handleIgnorePayload={handleIgnorePayload}
              handleBulkSavePayloads={handleBulkSavePayloads}
              handleBulkIgnorePayloads={handleBulkIgnorePayloads}
              t_textHeading={t_textHeading}
              t_textMuted={t_textMuted}
              t_borderLight={t_borderLight}
              t_rowHover={t_rowHover}
              glassPanel={glassPanel}
              glassButton={glassButton}
              glassInput={glassInput}
              isDark={isDark}
            />

            <KeysPanel 
              apiKeys={apiKeys}
              access={access}
              createKeyAllDomains={createKeyAllDomains}
              setCreateKeyAllDomains={setCreateKeyAllDomains}
              createKeyDomainSelections={createKeyDomainSelections}
              toggleCreateKeyDomain={toggleCreateKeyDomain}
              handleCreateKey={handleCreateKey}
              handleRevokeKey={handleRevokeKey}
              handleDeleteRevokedKey={handleDeleteRevokedKey}
              handleViewStoredKey={handleViewStoredKey}
              handleToggleGlobalAccess={handleToggleGlobalAccess}
              handleRemoveDomain={handleRemoveDomain}
              handleAddDomain={handleAddDomain}
              t_textHeading={t_textHeading}
              t_textMuted={t_textMuted}
              t_borderLight={t_borderLight}
              glassPanel={glassPanel}
              glassButton={glassButton}
              glassInput={glassInput}
              badgeSuccess={badgeSuccess}
              badgeWarning={badgeWarning}
              dangerButton={dangerButton}
              isDark={isDark}
            />
          </div>
        )}

        {activePage === "models" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <ModelsPanel 
              models={models}
              editingModelId={editingModelId}
              editingModelDraft={editingModelDraft}
              setEditingModelDraft={setEditingModelDraft}
              handleRegisterModel={handleRegisterModel}
              handleChangeModelState={handleChangeModelState}
              beginEditModel={beginEditModel}
              cancelEditModel={cancelEditModel}
              handleSaveModelEdit={handleSaveModelEdit}
              handleDeleteModel={handleDeleteModel}
              t_textHeading={t_textHeading}
              t_textMuted={t_textMuted}
              t_borderLight={t_borderLight}
              glassPanel={glassPanel}
              glassButton={glassButton}
              glassInput={glassInput}
              solidButton={solidButton}
              badgeSuccess={badgeSuccess}
              badgeWarning={badgeWarning}
              isDark={isDark}
            />
            <MappingsPanel 
              mappingsByDomain={mappingsByDomain}
              models={models}
              editingMappingId={editingMappingId}
              editingMappingDraft={editingMappingDraft}
              setEditingMappingDraft={setEditingMappingDraft}
              assigningDomainDraft={assigningDomainDraft}
              setAssigningDomainDraft={setAssigningDomainDraft}
              handleSaveMapping={handleSaveMapping}
              handleRemoveMapping={handleRemoveMapping}
              handleTestMapping={handleTestMapping}
              beginEditMapping={beginEditMapping}
              cancelEditMapping={cancelEditMapping}
              handleSaveMappingEdit={handleSaveMappingEdit}
              beginAssignDomainModel={beginAssignDomainModel}
              cancelAssignDomainModel={cancelAssignDomainModel}
              handleSaveDomainModelAssign={handleSaveDomainModelAssign}
              t_textHeading={t_textHeading}
              t_textMuted={t_textMuted}
              t_borderLight={t_borderLight}
              t_rowHover={t_rowHover}
              glassPanel={glassPanel}
              glassButton={glassButton}
              glassInput={glassInput}
              solidButton={solidButton}
              isDark={isDark}
            />
          </div>
        )}

        {activePage === "autofill" && (
          <AutofillProposalsPanel 
            autofillProposals={autofillProposals}
            handleApproveAutofillProposal={handleApproveAutofillProposal}
            handleRejectAutofillProposal={handleRejectAutofillProposal}
            handleBulkApproveAutofillProposals={handleBulkApproveAutofillProposals}
            handleBulkRejectAutofillProposals={handleBulkRejectAutofillProposals}
            t_textHeading={t_textHeading}
            t_textMuted={t_textMuted}
            t_borderLight={t_borderLight}
            t_rowHover={t_rowHover}
            glassPanel={glassPanel}
            glassButton={glassButton}
            badgeSuccess={badgeSuccess}
            badgeWarning={badgeWarning}
          />
        )}

        {activePage === "exam" && (
          <ExamStatsPanel 
            examStats={examStats}
            t_textHeading={t_textHeading}
            t_textMuted={t_textMuted}
            t_borderLight={t_borderLight}
            glassPanel={glassPanel}
            glassInput={glassInput}
            solidButton={solidButton}
            isDark={isDark}
            showToast={showToast}
          />
        )}

        {activePage === "settings" && (
          <SettingsPanel 
            apiKeys={apiKeys}
            access={access}
            settingsKeyId={settingsKeyId}
            settingsAllDomains={settingsAllDomains}
            setSettingsAllDomains={setSettingsAllDomains}
            settingsDomainSelections={settingsDomainSelections}
            toggleSettingsDomainSelection={toggleSettingsDomainSelection}
            settingsKeyRpm={settingsKeyRpm}
            setSettingsKeyRpm={setSettingsKeyRpm}
            settingsKeyBurst={settingsKeyBurst}
            setSettingsKeyBurst={setSettingsKeyBurst}
            settingsCustomDomain={settingsCustomDomain}
            setSettingsCustomDomain={setSettingsCustomDomain}
            cloudBackupConfigured={cloudBackupConfigured}
            handleSettingsKeyChange={handleSettingsKeyChange}
            handleSaveKeyAccessSettings={handleSaveKeyAccessSettings}
            handleAddSettingsCustomDomain={handleAddSettingsCustomDomain}
            handleSaveKeyRateLimitSettings={handleSaveKeyRateLimitSettings}
            handleCreateBackupNow={handleCreateBackupNow}
            handleRestoreLatestBackup={handleRestoreLatestBackup}
            handleExportMasterSetup={handleExportMasterSetup}
            handleImportMasterSetup={handleImportMasterSetup}
            handleCloudBackupPush={handleCloudBackupPush}
            handleCloudBackupPull={handleCloudBackupPull}
            t_textHeading={t_textHeading}
            t_textMuted={t_textMuted}
            t_borderLight={t_borderLight}
            t_rowHover={t_rowHover}
            glassPanel={glassPanel}
            glassButton={glassButton}
            glassInput={glassInput}
            badgeSuccess={badgeSuccess}
            isDark={isDark}
          />
        )}
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob { animation: blob 15s infinite alternate; }
        .animation-delay-2000 { animation-delay: 2s; }
        .animation-delay-4000 { animation-delay: 4s; }
        
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(156, 163, 175, 0.3); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(156, 163, 175, 0.5); }
      `}} />
    </div>
  );
}

export default App;
