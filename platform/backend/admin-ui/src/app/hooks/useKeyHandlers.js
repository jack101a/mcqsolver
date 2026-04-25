/** useKeyHandlers — API key CRUD operations. */
export function useKeyHandlers({
  postForm, fetchBootstrap, showToast,
  rememberedKeys, setRememberedKeys,
  setCreatedKeyModal,
  createKeyAllDomains, setCreateKeyAllDomains,
  createKeyDomainSelections, setCreateKeyDomainSelections,
}) {
  const handleCreateKey = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const response = await postForm("/admin/api/keys/create", {
        key_name: fd.get("key_name"),
        expiry_days: Number(fd.get("expiry_days") || 30),
        all_domains: createKeyAllDomains ? "on" : "",
        allowed_domains_csv: createKeyAllDomains ? "" : createKeyDomainSelections.join(","),
        requests_per_minute: Number(fd.get("requests_per_minute") || 0),
        burst: Number(fd.get("burst") || 0),
      });
      const payload = await response.json();
      await fetchBootstrap();
      if (payload.key_id && payload.api_key) {
        setRememberedKeys(prev => ({ ...prev, [String(payload.key_id)]: payload.api_key }));
      }
      setCreatedKeyModal({ open: true, keyId: payload.key_id ?? null, keyValue: payload.api_key || "" });
      e.target.reset();
      setCreateKeyAllDomains(true);
      setCreateKeyDomainSelections([]);
      showToast("API key created.");
    } catch { showToast("Failed to create key", "error"); }
  };

  const handleCopyKey = async (keyValue) => {
    if (!keyValue) { showToast("No key available to copy", "error"); return; }
    try {
      await navigator.clipboard.writeText(keyValue);
      showToast("API key copied.");
    } catch { showToast("Clipboard copy failed", "error"); }
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
      setRememberedKeys(prev => { const next = { ...prev }; delete next[String(id)]; return next; });
      await fetchBootstrap();
      showToast(`Key #${id} deleted.`, "error");
    } catch { showToast("Only revoked keys can be deleted", "error"); }
  };

  const toggleCreateKeyDomain = (domain) => {
    setCreateKeyDomainSelections(prev =>
      prev.includes(domain) ? prev.filter(d => d !== domain) : [...prev, domain]
    );
  };

  return {
    handleCreateKey, handleCopyKey, handleViewStoredKey,
    handleRevokeKey, handleDeleteRevokedKey, toggleCreateKeyDomain,
  };
}
