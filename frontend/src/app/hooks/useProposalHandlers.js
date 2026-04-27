/** useProposalHandlers — autofill + captcha proposal handlers (approve/reject/bulk/edit/delete). */
export function useProposalHandlers({ fetchBootstrap, showToast }) {
  const jsonPost = (url, body) =>
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "include" });

  // ── Autofill ─────────────────────────────────────────────
  const handleApproveAutofillProposal = async (id) => {
    try {
      const resp = await jsonPost(`/admin/api/autofill/proposals/${id}/approve`, {});
      if (resp.ok) { showToast("Autofill rule approved."); fetchBootstrap(); }
      else throw new Error();
    } catch { showToast("Failed to approve autofill rule", "error"); }
  };

  const handleRejectAutofillProposal = async (id) => {
    if (!window.confirm("Reject proposal?")) return;
    try {
      const resp = await jsonPost(`/admin/api/autofill/proposals/${id}/reject`, {});
      if (resp.ok) { showToast("Autofill rule rejected.", "error"); fetchBootstrap(); }
      else throw new Error();
    } catch { showToast("Failed to reject autofill rule", "error"); }
  };

  const handleBulkApproveAutofillProposals = async (ids) => {
    try {
      const resp = await jsonPost("/admin/api/autofill/proposals/bulk-approve", { proposal_ids: ids.map(Number) });
      if (resp.ok) { showToast(`Approved ${ids.length} rules.`); fetchBootstrap(); }
      else throw new Error();
    } catch { showToast("Failed to bulk approve rules", "error"); }
  };

  const handleBulkRejectAutofillProposals = async (ids) => {
    try {
      const resp = await jsonPost("/admin/api/autofill/proposals/bulk-reject", { proposal_ids: ids.map(Number) });
      if (resp.ok) { showToast(`Rejected ${ids.length} rules.`, "error"); fetchBootstrap(); }
      else throw new Error();
    } catch { showToast("Failed to bulk reject rules", "error"); }
  };

  const handleEditAutofillProposal = async (id, patch) => {
    try {
      const resp = await fetch(`/admin/api/autofill/proposals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
        credentials: "include"
      });
      if (resp.ok) { showToast("Autofill proposal updated."); fetchBootstrap(); return true; }
      const d = await resp.json().catch(() => ({}));
      throw new Error(d.detail || "Failed");
    } catch (e) { showToast(e.message || "Failed to update", "error"); return false; }
  };

  const handleDeleteAutofillProposal = async (id) => {
    if (!window.confirm("Permanently delete this autofill proposal?")) return;
    try {
      const resp = await fetch(`/admin/api/autofill/proposals/${id}`, { method: "DELETE", credentials: "include" });
      if (resp.ok) { showToast("Autofill proposal deleted.", "error"); fetchBootstrap(); }
      else throw new Error();
    } catch { showToast("Failed to delete proposal", "error"); }
  };

  // ── Captcha (admin must explicitly supply model_id) ───────
  const handleApproveCaptchaProposal = async (id, model_id) => {
    try {
      const resp = await jsonPost(`/admin/api/captcha/proposals/${id}/approve`, { model_id: Number(model_id) });
      if (resp.ok) { showToast("Captcha route approved and mapped."); fetchBootstrap(); }
      else { const d = await resp.json().catch(() => ({})); throw new Error(d.detail || d.error || "Failed"); }
    } catch (e) { showToast(e.message || "Failed to approve", "error"); }
  };

  const handleRejectCaptchaProposal = async (id) => {
    if (!window.confirm("Reject this captcha route proposal?")) return;
    try {
      const resp = await jsonPost(`/admin/api/captcha/proposals/${id}/reject`, {});
      if (resp.ok) { showToast("Captcha route rejected.", "error"); fetchBootstrap(); }
      else throw new Error();
    } catch { showToast("Failed to reject", "error"); }
  };

  const handleBulkApproveCaptchaProposals = async (ids, model_id) => {
    try {
      const resp = await jsonPost("/admin/api/captcha/proposals/bulk-approve", { proposal_ids: ids.map(Number), model_id: Number(model_id) });
      if (resp.ok) {
        const d = await resp.json();
        showToast(`Approved ${d.count} captcha route(s).`);
        if (d.errors?.length) showToast(`${d.errors.length} failed`, "error");
        fetchBootstrap();
      } else { const d = await resp.json().catch(() => ({})); throw new Error(d.detail || d.error || "Failed"); }
    } catch (e) { showToast(e.message || "Failed to bulk approve", "error"); }
  };

  const handleBulkRejectCaptchaProposals = async (ids) => {
    try {
      const resp = await jsonPost("/admin/api/captcha/proposals/bulk-reject", { proposal_ids: ids.map(Number) });
      if (resp.ok) { showToast(`Rejected ${ids.length} captcha routes.`, "error"); fetchBootstrap(); }
      else throw new Error();
    } catch { showToast("Failed to bulk reject", "error"); }
  };

  const handleEditCaptchaProposal = async (id, patch) => {
    try {
      const resp = await fetch(`/admin/api/captcha/proposals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
        credentials: "include"
      });
      if (resp.ok) { showToast("Captcha proposal updated."); fetchBootstrap(); return true; }
      const d = await resp.json().catch(() => ({}));
      throw new Error(d.detail || "Failed");
    } catch (e) { showToast(e.message || "Failed to update", "error"); return false; }
  };

  const handleDeleteCaptchaProposal = async (id) => {
    if (!window.confirm("Permanently delete this captcha proposal?")) return;
    try {
      const resp = await fetch(`/admin/api/captcha/proposals/${id}`, { method: "DELETE", credentials: "include" });
      if (resp.ok) { showToast("Captcha proposal deleted.", "error"); fetchBootstrap(); }
      else throw new Error();
    } catch { showToast("Failed to delete proposal", "error"); }
  };

  return {
    handleApproveAutofillProposal, handleRejectAutofillProposal,
    handleBulkApproveAutofillProposals, handleBulkRejectAutofillProposals,
    handleEditAutofillProposal, handleDeleteAutofillProposal,
    handleApproveCaptchaProposal, handleRejectCaptchaProposal,
    handleBulkApproveCaptchaProposals, handleBulkRejectCaptchaProposals,
    handleEditCaptchaProposal, handleDeleteCaptchaProposal,
  };
}
