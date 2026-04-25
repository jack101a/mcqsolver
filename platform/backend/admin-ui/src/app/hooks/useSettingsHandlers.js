/** useSettingsHandlers — key settings, domain access, backups, global toggle. */
export function useSettingsHandlers({
  postForm, fetchBootstrap, showToast,
  apiKeys,
  settingsKeyId, setSettingsKeyId,
  settingsAllDomains, setSettingsAllDomains,
  settingsDomainSelections, setSettingsDomainSelections,
  settingsKeyRpm, setSettingsKeyRpm,
  settingsKeyBurst, setSettingsKeyBurst,
  settingsCustomDomain, setSettingsCustomDomain,
  access,
}) {
  const handleSettingsKeyChange = (nextId) => {
    setSettingsKeyId(String(nextId));
    const key = apiKeys.find(k => String(k.id) === String(nextId));
    if (!key) return;
    setSettingsAllDomains(key.all_domains !== undefined ? Boolean(key.all_domains) : true);
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
        allowed_domains_csv: settingsAllDomains ? "" : settingsDomainSelections.join(","),
      });
      await fetchBootstrap();
      showToast("Key domain access updated.");
    } catch { showToast("Failed to update key access", "error"); }
  };

  const handleSaveKeyRateLimitSettings = async (e) => {
    e.preventDefault();
    if (!settingsKeyId) return;
    try {
      await postForm("/admin/keys/rate-limit/update", {
        key_id: Number(settingsKeyId),
        requests_per_minute: Number(settingsKeyRpm),
        burst: Number(settingsKeyBurst),
      });
      await fetchBootstrap();
      showToast("Key rate limit updated.");
    } catch { showToast("Failed to update key rate limit", "error"); }
  };

  const toggleSettingsDomainSelection = (domain) => {
    setSettingsDomainSelections(prev =>
      prev.includes(domain) ? prev.filter(d => d !== domain) : [...prev, domain]
    );
  };

  const handleAddSettingsCustomDomain = () => {
    const token = String(settingsCustomDomain || "").trim().toLowerCase();
    if (!token) return;
    if (!settingsDomainSelections.includes(token)) {
      setSettingsDomainSelections(prev => [...prev, token]);
    }
    setSettingsCustomDomain("");
  };

  const handleToggleGlobalAccess = async (checked) => {
    try {
      await postForm("/admin/access", { global_access: checked ? "on" : null, new_domain: "" });
      await fetchBootstrap();
      showToast(`Global access ${checked ? "enabled" : "disabled"}`);
    } catch { showToast("Failed to update access", "error"); }
  };

  const handleAddDomain = async (e) => {
    e.preventDefault();
    const domain = new FormData(e.target).get("new_domain");
    if (!domain) return;
    try {
      await postForm("/admin/access", { global_access: access.global_access ? "on" : null, new_domain: domain });
      await fetchBootstrap();
      e.target.reset();
      showToast(`Domain ${domain} added.`);
    } catch { showToast("Failed to add domain", "error"); }
  };

  const handleRemoveDomain = async (domain) => {
    if (!window.confirm(`Remove ${domain} from whitelist?`)) return;
    try {
      await postForm("/admin/access/remove", { domain });
      await fetchBootstrap();
      showToast(`Domain ${domain} removed.`, "error");
    } catch { showToast("Failed to remove domain", "error"); }
  };

  const handleCreateBackupNow = async () => {
    try { await postForm("/admin/backups/create", {}); showToast("Backup created."); }
    catch { showToast("Failed to create backup", "error"); }
  };

  const handleCloudBackupPush = async () => {
    try { await postForm("/admin/backups/cloud/push", {}); showToast("Cloud backup pushed."); }
    catch { showToast("Cloud backup push failed", "error"); }
  };

  const handleCloudBackupPull = async () => {
    if (!window.confirm("Restore from cloud backup now?")) return;
    try {
      await postForm("/admin/backups/cloud/pull", {});
      await fetchBootstrap();
      showToast("Cloud backup restored.");
    } catch { showToast("Cloud backup restore failed", "error"); }
  };

  const handleRestoreLatestBackup = async () => {
    if (!window.confirm("Restore latest backup? This will overwrite current settings.")) return;
    try {
      await postForm("/admin/backups/restore-latest", {});
      await fetchBootstrap();
      showToast("Latest backup restored.");
    } catch { showToast("Failed to restore backup", "error"); }
  };

  const handleExportMasterSetup = () => window.location.assign("/admin/export/master-setup.json");

  const handleImportMasterSetup = async (e) => {
    e.preventDefault();
    const payload = new FormData();
    payload.append("setup_file", new FormData(e.target).get("setup_file"));
    try {
      const response = await fetch("/admin/import/master-setup", {
        method: "POST", body: payload, credentials: "include"
      });
      const body = await response.json();
      if (!response.ok || body.ok === false) throw new Error(body.message || "Import failed");
      await fetchBootstrap();
      e.target.reset();
      showToast("Master setup imported.");
    } catch (error) { showToast(error.message || "Import failed", "error"); }
  };

  return {
    handleSettingsKeyChange, handleSaveKeyAccessSettings, handleSaveKeyRateLimitSettings,
    toggleSettingsDomainSelection, handleAddSettingsCustomDomain,
    handleToggleGlobalAccess, handleAddDomain, handleRemoveDomain,
    handleCreateBackupNow, handleCloudBackupPush, handleCloudBackupPull,
    handleRestoreLatestBackup, handleExportMasterSetup, handleImportMasterSetup,
  };
}
