import { useState, useEffect, useCallback } from 'react';

export function useAdminData(showToast) {
  const [stats, setStats] = useState({
    total_requests: 0,
    successful_requests: 0,
    failed_requests: 0,
    avg_processing_ms: 0
  });
  const [apiKeys, setApiKeys] = useState([]);
  const [access, setAccess] = useState({ global_access: false, allowed_domains: [] });
  const [models, setModels] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [failedPayloads, setFailedPayloads] = useState([]);
  const [datasetsDir, setDatasetsDir] = useState("");
  const [autofillProposals, setAutofillProposals] = useState([]);
  const [captchaProposals, setCaptchaProposals] = useState([]);
  const [examStats, setExamStats] = useState({ total_exam_solves: 0, exam_ok_count: 0, exam_ok_rate: 0 });
  const [cloudBackupConfigured, setCloudBackupConfigured] = useState(false);
  const [masterKeyInfo, setMasterKeyInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchBootstrap = useCallback(async () => {
    try {
      const response = await fetch("/admin/api/bootstrap", {
        credentials: "include",
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error(`Failed bootstrap (${response.status})`);
      
      const data = await response.json();
      setStats(data.usage || {});
      setApiKeys(data.api_keys || []);
      setAccess({
        global_access: !!data.global_access,
        allowed_domains: data.allowed_domains || []
      });
      setModels(data.model_registry || []);
      setMappings(data.field_mappings || []);
      setFailedPayloads(data.datasets_files || []);
      setCloudBackupConfigured(Boolean(data.cloud_backup_configured));
      setMasterKeyInfo(data.master_key_info || null);
      if(data.datasets_dir) setDatasetsDir(data.datasets_dir);

      // Fetch extra sections in parallel
      const [afResp, cpResp, exResp] = await Promise.allSettled([
        fetch("/admin/api/autofill/proposals?status=all", { credentials: "include" }),
        fetch("/admin/api/captcha/proposals?status=all", { credentials: "include" }),
        fetch("/admin/api/exam/stats", { credentials: "include" }),
      ]);

      if (afResp.status === "fulfilled" && afResp.value.ok)
        setAutofillProposals(await afResp.value.json());
      if (cpResp.status === "fulfilled" && cpResp.value.ok)
        setCaptchaProposals(await cpResp.value.json());
      if (exResp.status === "fulfilled" && exResp.value.ok)
        setExamStats(await exResp.value.json());

    } catch (e) {
      console.error("Bootstrap fetch failed", e);
      if (showToast) showToast("Failed to fetch dashboard data", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchBootstrap();
  }, [fetchBootstrap]);

  return {
    stats, setStats,
    apiKeys, setApiKeys,
    access, setAccess,
    models, setModels,
    mappings, setMappings,
    failedPayloads, setFailedPayloads,
    datasetsDir, setDatasetsDir,
    autofillProposals, setAutofillProposals,
    captchaProposals, setCaptchaProposals,
    examStats, setExamStats,
    cloudBackupConfigured, setCloudBackupConfigured,
    masterKeyInfo, setMasterKeyInfo,
    loading, setLoading,
    refresh: fetchBootstrap
  };
}
