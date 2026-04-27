/** useModelHandlers — model registry + field mapping + failed payload handlers. */
export function useModelHandlers({
  postForm, fetchBootstrap, showToast,
  setEditingModelId, setEditingModelDraft, editingModelDraft,
  setEditingMappingId, setEditingMappingDraft, editingMappingDraft,
  setAssigningDomainDraft, assigningDomainDraft,
  failedPayloads, selectedPayloads, setSelectedPayloads, allPayloadSelected,
}) {
  const handleRegisterModel = async (e) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    const fd = new FormData(formEl);
    const modelFile = fd.get("model_file");
    if (!modelFile || typeof modelFile === "string" || !modelFile.name) {
      showToast("Please choose an ONNX model file first", "error"); return;
    }
    const upload = new FormData();
    ["ai_model_name","version","task_type","runtime"].forEach(k => upload.append(k, fd.get(k)));
    let blob = modelFile;
    try { blob = new Blob([await modelFile.arrayBuffer()], { type: modelFile.type || "application/octet-stream" }); }
    catch { showToast("Could not read selected file.", "error"); return; }
    upload.append("ai_model_file", blob, modelFile.name);
    try {
      const resp = await fetch("/admin/models/upload", { method:"POST", body:upload, credentials:"include", headers:{"x-admin-api":"1"} });
      let p = {}; try { p = await resp.json(); } catch(_) {}
      if (!resp.ok || p.ok !== true) throw new Error(p.message || `Upload failed (${resp.status})`);
      await fetchBootstrap(); formEl.reset(); showToast(`Model registered: ${p.filename || "done"}`);
    } catch (err) { showToast(err.message || "Failed to register model", "error"); }
  };

  const handleChangeModelState = async (id, state) => {
    try { await postForm("/admin/models/promote", { ai_model_id: id, lifecycle_state: state }); await fetchBootstrap(); showToast(`Model #${id} → ${state}.`); }
    catch { showToast("Failed to change model state", "error"); }
  };

  const handleDeleteModel = async (id) => {
    if (!window.confirm("Delete this AI model? This will fail if mappings still reference it.")) return;
    try {
      const fd = new FormData(); fd.append("ai_model_id", String(id));
      const resp = await fetch("/admin/models/remove", { method:"POST", body:fd, credentials:"include", headers:{"x-admin-api":"1"} });
      let p = {}; try { p = await resp.json(); } catch(_) {}
      if (!resp.ok || p.ok !== true) throw new Error(p.message || p.detail || `Failed (${resp.status})`);
      await fetchBootstrap(); showToast(`Model #${id} removed.`, "error");
    } catch (err) { showToast(err.message || "Failed to remove model", "error"); }
  };

  const beginEditModel = (model) => {
    setEditingModelId(model.id);
    setEditingModelDraft({ ai_model_name: model.ai_model_name||"", version: model.version||"v1", task_type: model.task_type||"image", lifecycle_state: model.lifecycle_state||"candidate", notes: model.notes||"" });
  };
  const cancelEditModel = () => { setEditingModelId(null); setEditingModelDraft(null); };
  const handleSaveModelEdit = async (e, modelId) => {
    e.preventDefault();
    try { await postForm("/admin/models/update", { ai_model_id: modelId, ...editingModelDraft }); await fetchBootstrap(); showToast(`Model #${modelId} updated.`); cancelEditModel(); }
    catch { showToast("Failed to update model", "error"); }
  };

  const handleSaveMapping = async (e) => {
    e.preventDefault(); const fd = new FormData(e.target);
    try {
      await postForm("/admin/mappings/set", { domain: fd.get("domain"), source_data_type:"image", source_selector: fd.get("source_selector"), target_selector: fd.get("target_selector"), target_data_type:"text_input", ai_model_id: Number(fd.get("ai_model_id")) });
      await fetchBootstrap(); e.target.reset(); showToast("Field mapping created.");
    } catch { showToast("Failed to create mapping", "error"); }
  };

  const beginEditMapping = (mapping) => {
    setEditingMappingId(mapping.id);
    setEditingMappingDraft({ domain: mapping.domain||"", source_data_type: mapping.source_data_type||"image", source_selector: mapping.source_selector||"", target_data_type: mapping.target_data_type||"text_input", target_selector: mapping.target_selector||"", ai_model_id: Number(mapping.ai_model_id) });
  };
  const cancelEditMapping = () => { setEditingMappingId(null); setEditingMappingDraft(null); };
  const handleSaveMappingEdit = async (e, mappingId) => {
    e.preventDefault();
    try { await postForm("/admin/mappings/update", { mapping_id: mappingId, ...editingMappingDraft }); await fetchBootstrap(); showToast("Mapping updated."); cancelEditMapping(); }
    catch { showToast("Failed to update mapping", "error"); }
  };

  const beginAssignDomainModel = (domain, domainMappings, allModels) => {
    const fm = domainMappings.find(m => Number(m.ai_model_id));
    const fa = allModels?.length > 0 ? allModels[0] : null;
    setAssigningDomainDraft({ domain, ai_model_id: fm ? Number(fm.ai_model_id) : fa ? Number(fa.id) : "" });
  };
  const cancelAssignDomainModel = () => setAssigningDomainDraft(null);
  const handleSaveDomainModelAssign = async (e) => {
    e.preventDefault();
    if (!assigningDomainDraft?.ai_model_id) { showToast("Please select a model first", "error"); return; }
    try {
      const fd = new FormData(); fd.append("domain", assigningDomainDraft.domain); fd.append("ai_model_id", String(assigningDomainDraft.ai_model_id));
      const resp = await fetch("/admin/mappings/domain/assign-model", { method:"POST", body:fd, credentials:"include", headers:{"x-admin-api":"1"} });
      let p = {}; try { p = await resp.json(); } catch(_) {}
      if (!resp.ok || p.ok !== true) throw new Error(p.message || p.detail || `Failed (${resp.status})`);
      await fetchBootstrap(); showToast(`Model assigned to ${assigningDomainDraft.domain}.`); cancelAssignDomainModel();
    } catch (err) { showToast(err.message || "Failed to assign model", "error"); }
  };

  const handleRemoveMapping = async (id) => {
    if (!window.confirm("Delete this routing map?")) return;
    try { await postForm("/admin/mappings/remove", { mapping_id: id }); await fetchBootstrap(); showToast("Mapping removed.", "error"); }
    catch { showToast("Failed to remove mapping", "error"); }
  };
  const handleTestMapping = async (mappingId, domain) => {
    try { await postForm("/admin/mappings/test", { mapping_id: mappingId }); showToast(`Test triggered for ${domain}`); }
    catch { showToast("Failed to test mapping", "error"); }
  };

  const handleLabelPayload = async (filename, domain, aiGuess, e) => {
    e.preventDefault(); const text = new FormData(e.target).get("corrected_text");
    try { await postForm("/admin/datasets/label", { filename, domain, ai_guess: aiGuess, corrected_text: text }); await fetchBootstrap(); showToast(`Labeled as "${text}".`); }
    catch { showToast("Failed to label payload", "error"); }
  };
  const handleIgnorePayload = async (filename) => {
    if (!window.confirm("Discard payload?")) return;
    try { await postForm("/admin/datasets/ignore", { filename }); await fetchBootstrap(); showToast("Payload ignored."); }
    catch { showToast("Failed to ignore payload", "error"); }
  };
  const togglePayload = (name) => setSelectedPayloads(prev => ({ ...prev, [name]: !prev[name] }));
  const toggleAllPayloads = () => {
    if (allPayloadSelected) { setSelectedPayloads({}); return; }
    const next = {}; failedPayloads.forEach(p => { next[p.name] = true; }); setSelectedPayloads(next);
  };
  const handleBulkIgnorePayloads = async () => {
    const sel = failedPayloads.filter(p => selectedPayloads[p.name]);
    try { for (const item of sel) await postForm("/admin/datasets/ignore", { filename: item.name }); setSelectedPayloads({}); await fetchBootstrap(); showToast(`Ignored ${sel.length} payload(s).`); }
    catch { showToast("Bulk ignore failed", "error"); }
  };
  const handleBulkSavePayloads = async () => {
    const sel = failedPayloads.filter(p => selectedPayloads[p.name]);
    try {
      for (const item of sel) await postForm("/admin/datasets/label", { filename: item.name, domain: item.domain, ai_guess: item.ocr_guess, corrected_text: item.corrected_text || item.ocr_guess });
      setSelectedPayloads({}); await fetchBootstrap(); showToast(`Saved ${sel.length} payload(s).`);
    } catch { showToast("Bulk save failed", "error"); }
  };

  const handleQuickEditMapping = async (id, patch) => {
    try {
      await postForm("/admin/mappings/update", { mapping_id: id, ...patch });
      await fetchBootstrap();
      showToast("Mapping updated.");
      return true;
    } catch { showToast("Failed to update mapping", "error"); return false; }
  };

  return {
    handleRegisterModel, handleChangeModelState, handleDeleteModel,
    beginEditModel, cancelEditModel, handleSaveModelEdit,
    handleSaveMapping, beginEditMapping, cancelEditMapping, handleSaveMappingEdit,
    handleQuickEditMapping,
    beginAssignDomainModel, cancelAssignDomainModel, handleSaveDomainModelAssign,
    handleRemoveMapping, handleTestMapping,
    handleLabelPayload, handleIgnorePayload,
    togglePayload, toggleAllPayloads, handleBulkIgnorePayloads, handleBulkSavePayloads,
  };
}

