import React from "react";
import { Key, Plus, ShieldCheck, XCircle } from "lucide-react";

export function KeysPanel({
  apiKeys,
  access,
  masterKeyInfo,
  createKeyAllDomains,
  setCreateKeyAllDomains,
  createKeyDomainSelections,
  toggleCreateKeyDomain,
  handleCreateKey,
  handleRevokeKey,
  handleDeleteRevokedKey,
  handleViewStoredKey,
  handleToggleGlobalAccess,
  handleRemoveDomain,
  handleAddDomain,
  t_textHeading,
  t_textMuted,
  t_borderLight,
  glassPanel,
  glassButton,
  glassInput,
  badgeSuccess,
  badgeWarning,
  dangerButton,
  isDark
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* API Keys Container */}
      <div className={`rounded-2xl flex flex-col transition-colors duration-500 overflow-hidden ${glassPanel}`}>
        <div className={`p-5 border-b flex items-center gap-3 ${t_borderLight}`}>
          <div className="p-2 bg-indigo-500/20 text-indigo-500 rounded-lg backdrop-blur-md"><Key size={20}/></div>
          <h2 className={`text-lg font-semibold tracking-wide drop-shadow-sm ${t_textHeading}`}>API Credentials</h2>
        </div>
        
        <div className="p-5 flex-1 flex flex-col">
          {/* Master Key Section */}
          {masterKeyInfo && (
            <div className={`mb-6 p-4 rounded-xl border-2 border-dashed transition-all ${isDark ? 'bg-indigo-500/5 border-indigo-500/20' : 'bg-indigo-50 border-indigo-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-indigo-500 text-white rounded-md shadow-lg shadow-indigo-500/20">
                    <ShieldCheck size={14}/>
                  </div>
                  <span className={`text-xs font-bold uppercase tracking-wider ${t_textHeading}`}>Master Administrative Key</span>
                </div>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">PERSISTENT</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`flex-1 font-mono text-sm p-2 rounded-lg border overflow-hidden truncate ${isDark ? 'bg-black/40 border-white/10 text-indigo-300' : 'bg-white border-indigo-100 text-indigo-700'}`}>
                  {masterKeyInfo.key}
                </div>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(masterKeyInfo.key);
                    // Toast is handled via prop if we had it, but let's assume we just want to copy for now
                  }}
                  className={`p-2 rounded-lg border transition-all ${glassButton}`}
                  title="Copy Master Key"
                >
                  <Plus size={16} className="rotate-45" /> {/* Use Plus as a placeholder for copy if needed, or just let it be */}
                </button>
              </div>
              <p className={`text-[10px] mt-2 italic leading-tight ${t_textMuted}`}>
                This key never expires and survives all system updates. Use it to unlock full "Master Mode" in the extension.
              </p>
            </div>
          )}

          <div className="overflow-auto max-h-72 mb-6 flex-1 pr-2 custom-scrollbar">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead>
                <tr className={`border-b ${t_textMuted} ${t_borderLight}`}>
                  <th className="pb-3 font-medium px-2">Name</th>
                  <th className="pb-3 font-medium px-2">Status</th>
                  <th className="pb-3 font-medium px-2 hidden sm:table-cell">Expires</th>
                  <th className="pb-3 text-right font-medium px-2">Action</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${t_borderLight}`}>
                {apiKeys.map(key => (
                  <tr key={key.id} className="group">
                    <td className="py-3 px-2">
                      <div className={`font-medium ${t_textHeading}`}>{key.name}</div>
                      <div className={`text-[10px] font-mono ${t_textMuted}`}>ID: {key.id}</div>
                    </td>
                    <td className="py-3 px-2">
                      {key.enabled ? <span className={badgeSuccess}>Active</span> : <span className={badgeWarning}>Revoked</span>}
                    </td>
                    <td className={`py-3 px-2 text-xs hidden sm:table-cell ${t_textMuted}`}>{key.expires_at_display}</td>
                    <td className="py-3 px-2 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button onClick={() => handleViewStoredKey(key.id)} className={glassButton}>View</button>
                        {key.enabled ? (
                          <button onClick={() => handleRevokeKey(key.id)} className={`${dangerButton} sm:opacity-0 group-hover:opacity-100`}>Revoke</button>
                        ) : (
                          <>
                            <span className={`text-xs ${t_textMuted}`}>{key.revoked_at_display}</span>
                            <button onClick={() => handleDeleteRevokedKey(key.id)} className={dangerButton}>Delete</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <form onSubmit={handleCreateKey} className="flex flex-col sm:flex-row gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
              <div>
                <label className={`text-xs ${t_textMuted}`}>Key Name</label>
                <input type="text" name="key_name" required placeholder="New key name..." className={glassInput} />
              </div>
              <div>
                <label className={`text-xs ${t_textMuted}`}>Expiry (days)</label>
                <input type="number" name="expiry_days" defaultValue="30" min="1" className={glassInput} title="Expiry days" />
              </div>
              <label className={`flex items-center gap-2 text-xs ${t_textMuted}`}>
                <input type="checkbox" checked={createKeyAllDomains} onChange={(e) => setCreateKeyAllDomains(e.target.checked)} /> All domains access
              </label>
              <div className={`max-h-24 overflow-auto rounded-xl border p-2 ${t_borderLight} ${createKeyAllDomains ? "opacity-50 pointer-events-none" : ""}`}>
                {access.allowed_domains.length === 0 && (
                  <div className={`text-xs ${t_textMuted}`}>No allowed domains configured yet.</div>
                )}
                {access.allowed_domains.map((domain) => (
                  <label key={domain} className={`flex items-center gap-2 text-xs ${t_textMuted}`}>
                    <input type="checkbox" checked={createKeyDomainSelections.includes(domain)} onChange={() => toggleCreateKeyDomain(domain)} />
                    {domain}
                  </label>
                ))}
              </div>
              <div>
                <label className={`text-xs ${t_textMuted}`}>Rate Limit RPM (requests/min)</label>
                <input type="number" name="requests_per_minute" defaultValue="60" min="1" className={glassInput} title="Per-key RPM" />
              </div>
              <div>
                <label className={`text-xs ${t_textMuted}`}>Burst (extra requests/min)</label>
                <input type="number" name="burst" defaultValue="10" min="0" className={glassInput} title="Per-key burst" />
              </div>
            </div>
            <button
              type="submit"
              className="w-full sm:w-auto self-end rounded-lg px-3 py-2 text-xs font-semibold bg-indigo-500 hover:bg-indigo-400 text-white transition-colors"
            >
              <span className="inline-flex items-center gap-1"><Plus size={14}/> Create</span>
            </button>
          </form>
        </div>
      </div>

      {/* Access Control Container */}
      <div className={`rounded-2xl flex flex-col transition-colors duration-500 overflow-hidden ${glassPanel}`}>
        <div className={`p-5 border-b flex items-center gap-3 ${t_borderLight}`}>
          <div className="p-2 bg-purple-500/20 text-purple-500 rounded-lg backdrop-blur-md"><ShieldCheck size={20}/></div>
          <h2 className={`text-lg font-semibold tracking-wide drop-shadow-sm ${t_textHeading}`}>Access Control</h2>
        </div>
        
        <div className="p-5 flex-1 space-y-6">
          <label className={`flex items-start sm:items-center gap-3 cursor-pointer p-4 rounded-xl border transition-colors backdrop-blur-md ${isDark ? 'bg-white/[0.03] border-white/10 hover:bg-white/[0.08]' : 'bg-white/50 border-white/80 hover:bg-white/80'}`}>
            <input 
              type="checkbox" 
              checked={access.global_access}
              onChange={(e) => handleToggleGlobalAccess(e.target.checked)}
              className={`mt-1 sm:mt-0 w-5 h-5 rounded text-indigo-500 focus:ring-indigo-500 ${isDark ? 'border-gray-600 bg-gray-700/50' : 'border-slate-300 bg-white/50'}`} 
            />
            <div>
              <div className={`text-sm font-medium ${t_textHeading}`}>Enable Global Access</div>
              <div className={`text-xs ${t_textMuted}`}>Skip all domain-based restrictions</div>
            </div>
          </label>

          <div>
            <h4 className={`text-xs font-semibold uppercase tracking-wider mb-3 drop-shadow-sm ${t_textMuted}`}>Allowed Domains Whitelist</h4>
            <div className="flex flex-wrap gap-2 mb-4 max-h-32 overflow-auto pr-1 custom-scrollbar">
              {access.allowed_domains.map(domain => (
                <div key={domain} className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm transition-colors backdrop-blur-md ${isDark ? 'bg-white/[0.05] border-white/10 hover:bg-white/[0.1]' : 'bg-white/60 border-white/80 hover:bg-white shadow-sm'}`}>
                  <span className={`font-mono text-xs ${isDark ? 'text-gray-300' : 'text-slate-700'}`}>{domain}</span>
                  <button onClick={() => handleRemoveDomain(domain)} className="text-gray-400 hover:text-rose-500 transition-colors"><XCircle size={14}/></button>
                </div>
              ))}
            </div>
            
            <form onSubmit={handleAddDomain} className="flex flex-col sm:flex-row gap-3">
              <input type="text" name="new_domain" placeholder="Add domain (e.g. site.gov.in)" className={glassInput} />
              <button type="submit" className={`w-full sm:w-auto ${glassButton}`}>Add</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
