import React, { useState, useMemo } from "react";
import { Activity, CheckSquare, Square, CheckCircle2, XCircle } from "lucide-react";

export function AutofillProposalsPanel({
  autofillProposals,
  handleApproveAutofillProposal,
  handleRejectAutofillProposal,
  handleBulkApproveAutofillProposals,
  handleBulkRejectAutofillProposals,
  t_textHeading,
  t_textMuted,
  t_borderLight,
  t_rowHover,
  glassPanel,
  glassButton,
  badgeSuccess,
  badgeWarning
}) {
  const [selectedIds, setSelectedIds] = useState({});
  const [domainFilter, setDomainFilter] = useState("All");

  const allDomains = useMemo(() => {
    const domains = new Set();
    autofillProposals.forEach(p => {
      const rule = JSON.parse(p.rule_json || "{}");
      let domain = rule.site?.pattern || "Unknown";
      try {
        domain = new URL(domain.startsWith('http') ? domain : `https://${domain}`).hostname;
      } catch (e) {}
      domains.add(domain);
    });
    return ["All", ...Array.from(domains)].sort();
  }, [autofillProposals]);

  const groupedProposals = useMemo(() => {
    const groups = {};
    autofillProposals.forEach(p => {
      const rule = JSON.parse(p.rule_json || "{}");
      let domain = rule.site?.pattern || "Unknown";
      try {
        domain = new URL(domain.startsWith('http') ? domain : `https://${domain}`).hostname;
      } catch (e) {}

      if (domainFilter !== "All" && domain !== domainFilter) return;

      if (!groups[domain]) groups[domain] = [];
      groups[domain].push({ ...p, rule });
    });
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [autofillProposals, domainFilter]);

  const toggleSelect = (id) => {
    setSelectedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedCount = Object.values(selectedIds).filter(Boolean).length;

  const handleBulkApprove = async () => {
    const ids = Object.keys(selectedIds).filter(id => selectedIds[id]);
    if (ids.length === 0) return;
    await handleBulkApproveAutofillProposals(ids);
    setSelectedIds({});
  };

  const handleBulkReject = async () => {
    const ids = Object.keys(selectedIds).filter(id => selectedIds[id]);
    if (ids.length === 0) return;
    if (!window.confirm(`Reject ${ids.length} selected proposals?`)) return;
    await handleBulkRejectAutofillProposals(ids);
    setSelectedIds({});
  };

  const toggleAll = () => {
    if (selectedCount === autofillProposals.length) {
      setSelectedIds({});
    } else {
      const next = {};
      autofillProposals.forEach(p => { next[p.id] = true; });
      setSelectedIds(next);
    }
  };

  return (
    <div className={`rounded-2xl transition-colors duration-500 overflow-hidden ${glassPanel}`}>
      <div className={`p-5 border-b flex items-center justify-between ${t_borderLight}`}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/20 text-indigo-500 rounded-lg backdrop-blur-md">
            <Activity size={20}/>
          </div>
          <div>
            <h2 className={`text-lg font-semibold tracking-wide drop-shadow-sm ${t_textHeading}`}>
              Autofill Rules & Proposals
            </h2>
            <p className={`text-[11px] ${t_textMuted}`}>Review recorded rules from extension (V26 Engine)</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <select 
            value={domainFilter} 
            onChange={e => setDomainFilter(e.target.value)}
            className={`text-xs px-3 py-1.5 rounded-lg outline-none cursor-pointer ${glassButton}`}
          >
            {allDomains.map(d => <option key={d} value={d} className="bg-slate-800 text-white">{d}</option>)}
          </select>

        {selectedCount > 0 && (
          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
            <span className={`text-xs font-medium mr-2 ${t_textMuted}`}>{selectedCount} selected</span>
            <button onClick={handleBulkApprove} className={`${badgeSuccess} flex items-center gap-1 py-1.5`}>
              <CheckCircle2 size={14}/> Approve Selected
            </button>
            <button onClick={handleBulkReject} className={`${badgeWarning} flex items-center gap-1 py-1.5 text-rose-400 border-rose-500/30`}>
              <XCircle size={14}/> Reject Selected
            </button>
          </div>
        )}
        </div>
      </div>

      <div className="p-5 overflow-auto max-h-[40rem] custom-scrollbar">
        <table className="w-full text-sm text-left min-w-[800px]">
          <thead>
            <tr className={`border-b ${t_textMuted} ${t_borderLight}`}>
              <th className="pb-3 px-2 w-10">
                <button onClick={toggleAll} className="hover:text-indigo-500 transition-colors">
                  {selectedCount === autofillProposals.length && autofillProposals.length > 0 ? <CheckSquare size={18}/> : <Square size={18}/>}
                </button>
              </th>
              <th className="pb-3 font-medium px-2">Site / Match Pattern</th>
              <th className="pb-3 font-medium px-2">Steps</th>
              <th className="pb-3 font-medium px-2">Submitted</th>
              <th className="pb-3 text-right font-medium px-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y-0">
            {groupedProposals.map(([domain, proposals]) => (
              <React.Fragment key={domain}>
                <tr className="bg-indigo-500/5">
                  <td colSpan="5" className={`py-2 px-4 text-[10px] font-bold uppercase tracking-widest ${t_textMuted} border-y ${t_borderLight}`}>
                    Domain Group: {domain}
                  </td>
                </tr>
                {proposals.map((p) => (
                  <tr key={p.id} className={`${t_rowHover} border-b ${t_borderLight} last:border-0`}>
                    <td className="py-4 px-2">
                      <button onClick={() => toggleSelect(p.id)} className="text-indigo-500/60 hover:text-indigo-500 transition-colors">
                        {selectedIds[p.id] ? <CheckSquare size={18}/> : <Square size={18}/>}
                      </button>
                    </td>
                    <td className="py-4 px-2">
                      <div className={`font-mono text-xs ${t_textHeading}`}>{p.rule.site?.pattern || "Unknown"}</div>
                      <div className={`text-[10px] ${t_textMuted}`}>Mode: {p.rule.site?.match_mode} | Device: {p.device_id?.slice(0,8)}...</div>
                    </td>
                    <td className="py-4 px-2">
                      <div className={`text-xs ${t_textHeading}`}>{p.rule.steps?.length || 0} actions</div>
                      <div className="flex gap-1 mt-1">
                        {p.rule.steps?.slice(0,3).map((s, i) => (
                          <span key={i} className="text-[9px] bg-indigo-500/10 text-indigo-400 px-1 rounded">{s.action}</span>
                        ))}
                        {(p.rule.steps?.length > 3) && <span className="text-[9px] text-slate-500">+{p.rule.steps.length - 3}</span>}
                      </div>
                    </td>
                    <td className={`py-4 px-2 text-xs ${t_textMuted}`}>
                      <div className="mb-1">
                        {p.status === 'approved' && <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400">Approved</span>}
                        {p.status === 'pending' && <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-400">Pending</span>}
                        {p.status === 'rejected' && <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-400">Rejected</span>}
                      </div>
                      {p.submitted_at ? new Date(p.submitted_at).toLocaleString() : "Unknown"}
                    </td>
                    <td className="py-4 px-2 text-right space-x-2">
                      <button onClick={() => alert(JSON.stringify(p.rule, null, 2))} className={glassButton}>View JSON</button>
                      {p.status !== 'approved' && (
                        <button onClick={() => handleApproveAutofillProposal(p.id)} className={`${badgeSuccess} border-emerald-500/50 hover:bg-emerald-500/20 transition-colors`}>Approve</button>
                      )}
                      {p.status !== 'rejected' && (
                        <button onClick={() => handleRejectAutofillProposal(p.id)} className={`${badgeWarning} border-rose-500/50 hover:bg-rose-500/20 text-rose-400 transition-colors`}>Reject</button>
                      )}
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
            {Object.keys(groupedProposals).length === 0 && (
              <tr><td colSpan="5" className={`py-12 text-center ${t_textMuted}`}>No autofill rules found for the selected criteria.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
