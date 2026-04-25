import React from "react";
import { FileX2, Trash2 } from "lucide-react";

export function DashboardPanel({
  failedPayloads,
  selectedPayloads,
  allPayloadSelected,
  datasetsDir,
  togglePayload,
  toggleAllPayloads,
  handleLabelPayload,
  handleIgnorePayload,
  handleBulkSavePayloads,
  handleBulkIgnorePayloads,
  t_textHeading,
  t_textMuted,
  t_borderLight,
  t_rowHover,
  glassPanel,
  glassButton,
  glassInput,
  isDark
}) {
  return (
    <div className={`rounded-2xl transition-colors duration-500 overflow-hidden ${glassPanel}`}>
      <div className={`p-5 border-b flex items-center gap-3 ${t_borderLight}`}>
        <div className="p-2 bg-amber-500/20 text-amber-500 rounded-lg backdrop-blur-md"><FileX2 size={20}/></div>
        <div>
          <h2 className={`text-lg font-semibold tracking-wide drop-shadow-sm ${t_textHeading}`}>Payload Correction Queue</h2>
          <p className={`text-[11px] ${t_textMuted}`}>Manual review of failed predictions. Source: <span className="font-mono text-amber-500/70">{datasetsDir}</span></p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={handleBulkSavePayloads} className={glassButton}>Save Selected</button>
          <button type="button" onClick={handleBulkIgnorePayloads} className={glassButton}>Ignore Selected</button>
        </div>
      </div>
      
      <div className="p-5 overflow-auto max-h-[30rem] custom-scrollbar">
        <table className="w-full text-sm text-left min-w-[700px]">
          <thead>
            <tr className={`border-b ${t_textMuted} ${t_borderLight}`}>
              <th className="pb-3 font-medium">
                <input type="checkbox" checked={allPayloadSelected} onChange={toggleAllPayloads} />
              </th>
              <th className="pb-3 font-medium">Target Context</th>
              <th className="pb-3 font-medium">Captured Payload</th>
              <th className="pb-3 font-medium">AI Guess</th>
              <th className="pb-3 font-medium">Human Correction</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${t_borderLight}`}>
            {failedPayloads.map(item => (
              <tr key={item.id || item.name} className={`group ${t_rowHover}`}>
                <td className="py-4 pr-3">
                  <input type="checkbox" checked={!!selectedPayloads[item.name]} onChange={() => togglePayload(item.name)} />
                </td>
                <td className="py-4 pr-4">
                  <div className={`font-mono text-xs drop-shadow-sm ${isDark ? 'text-gray-300' : 'text-slate-700'}`}>{item.domain}</div>
                  <div className={`text-[10px] mt-1 ${t_textMuted}`}>{item.updated_at}</div>
                </td>
                <td className="py-4 pr-4">
                  <div className={`relative inline-block rounded-lg overflow-hidden border shadow-md backdrop-blur-sm ${isDark ? 'border-white/10 bg-black/50' : 'border-white/60 bg-white/50'}`}>
                    <img src={item.preview_url} alt="failed captcha" className="h-[45px] w-[200px] object-cover mix-blend-multiply dark:mix-blend-screen" />
                  </div>
                </td>
                <td className="py-4 pr-4">
                  <span className={`px-3 py-1 border rounded-md font-mono tracking-widest backdrop-blur-md shadow-sm ${isDark ? 'bg-black/30 border-white/5 text-rose-400' : 'bg-white/60 border-white/80 text-rose-600'}`}>{item.ocr_guess}</span>
                </td>
                <td className="py-4">
                  <form onSubmit={(e) => handleLabelPayload(item.name, item.domain, item.ocr_guess, e)} className="flex items-center gap-2">
                    <input type="text" name="corrected_text" defaultValue={item.corrected_text || item.ocr_guess} required className={`${glassInput} w-32 tracking-widest font-mono text-emerald-500`} />
                    <button type="submit" className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors border backdrop-blur-md shadow-sm ${isDark ? 'bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 border-emerald-500/30' : 'bg-white/80 hover:bg-white text-emerald-600 border-white'}`}>Fix & Save</button>
                    <button type="button" onClick={() => handleIgnorePayload(item.name)} className={`p-2 transition-colors ${t_textMuted} hover:text-rose-500`}><Trash2 size={16}/></button>
                  </form>
                </td>
              </tr>
            ))}
            {failedPayloads.length === 0 && (
              <tr><td colSpan="5" className={`py-8 text-center ${t_textMuted}`}>Queue is clear. Great job!</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
