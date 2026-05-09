import React from "react";
import PropTypes from "prop-types";
import { CheckCircle2, BarChart3, XCircle, Timer } from "lucide-react";
import { DashboardPanel }         from "./DashboardPanel";
import { UserscriptsPanel }       from "./UserscriptsPanel";
import { ModelsPanel }            from "./ModelsPanel";
import { MappingsPanel }          from "./MappingsPanel";
import { ExamStatsPanel }         from "./ExamStatsPanel";
import { SettingsPanel }          from "./SettingsPanel";
import { KeysPanel }              from "./KeysPanel";
import { AutofillProposalsPanel } from "./AutofillProposalsPanel";
import { CaptchaProposalsPanel }  from "./CaptchaProposalsPanel";
import { useThemeContext } from "../context/ThemeContext";

export function PageRouter({
  activePage,
  stats, latencyValue,
  apiKeys, access, masterKeyInfo,
  models, mappingsByDomain,
  failedPayloads, selectedPayloads, allPayloadSelected, datasetsDir,
  autofillProposals, captchaProposals, examStats,
  cloudBackupConfigured, userscripts,
  fetchBootstrap, showToast,
  editingModelId, editingModelDraft, setEditingModelDraft,
  editingMappingId, editingMappingDraft, setEditingMappingDraft,
  assigningDomainDraft, setAssigningDomainDraft,
  createKeyAllDomains, setCreateKeyAllDomains,
  createKeyDomainSelections,
  settingsKeyId, settingsAllDomains, setSettingsAllDomains,
  settingsDomainSelections, settingsKeyRpm, setSettingsKeyRpm,
  settingsKeyBurst, setSettingsKeyBurst,
  settingsCustomDomain, setSettingsCustomDomain,
  keyHandlers, settingsHandlers, modelHandlers, proposalHandlers,
}) {
  const { isDark, t_textHeading, t_textMuted, t_rowHover, glassPanel } = useThemeContext();

  if (activePage === "dashboard") {
    return (
      <div className="space-y-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Requests", value: stats.total_requests?.toLocaleString() || "0", color: "text-indigo-500",   icon: BarChart3 },
            { label: "Success",        value: stats.successful_requests?.toLocaleString() || "0", color: "text-emerald-500", icon: CheckCircle2 },
            { label: "Failed",         value: stats.failed_requests?.toLocaleString() || "0", color: "text-rose-500",    icon: XCircle },
            { label: "Avg Latency",    value: `${latencyValue}ms`, color: "text-cyan-500",    icon: Timer },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
            <div key={i} className={`rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group ${glassPanel} ${t_rowHover}`}>
              <div>
                <p className={`text-sm font-medium mb-1 ${t_textMuted}`}>{s.label}</p>
                <p className={`text-2xl sm:text-3xl font-bold tracking-tight ${t_textHeading}`}>{s.value}</p>
              </div>
              <div className={`p-3 rounded-xl border group-hover:scale-110 transition-transform ${isDark ? "bg-white/[0.05] border-white/5" : "bg-white border-white/60 shadow-sm"} ${s.color}`}>
                <Icon size={24} />
              </div>
            </div>
          )})}
        </div>

        <DashboardPanel
          failedPayloads={failedPayloads} selectedPayloads={selectedPayloads}
          allPayloadSelected={allPayloadSelected} datasetsDir={datasetsDir}
          {...modelHandlers}
        />

        <KeysPanel
          apiKeys={apiKeys} access={access} masterKeyInfo={masterKeyInfo}
          createKeyAllDomains={createKeyAllDomains} setCreateKeyAllDomains={setCreateKeyAllDomains}
          createKeyDomainSelections={createKeyDomainSelections}
          {...keyHandlers} {...settingsHandlers}
        />
      </div>
    );
  }

  if (activePage === "userscripts") {
    return (
      <UserscriptsPanel 
        userscripts={userscripts} 
        refreshUserscripts={fetchBootstrap}
        showToast={showToast}
      />
    );
  }

  if (activePage === "models") {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <ModelsPanel
          models={models} editingModelId={editingModelId}
          editingModelDraft={editingModelDraft} setEditingModelDraft={setEditingModelDraft}
          {...modelHandlers}
        />
        <MappingsPanel
          mappingsByDomain={mappingsByDomain} models={models}
          editingMappingId={editingMappingId} editingMappingDraft={editingMappingDraft}
          setEditingMappingDraft={setEditingMappingDraft}
          assigningDomainDraft={assigningDomainDraft} setAssigningDomainDraft={setAssigningDomainDraft}
          {...modelHandlers}
        />
      </div>
    );
  }

  if (activePage === "autofill") {
    return (
      <AutofillProposalsPanel
        autofillProposals={autofillProposals} {...proposalHandlers}
      />
    );
  }

  if (activePage === "captcha") {
    return (
      <CaptchaProposalsPanel
        mappings={mappings}
        handleRemoveMapping={modelHandlers.handleRemoveMapping}
        handleQuickEditMapping={modelHandlers.handleQuickEditMapping}
        captchaProposals={captchaProposals} models={models} {...proposalHandlers}
      />
    );
  }

  if (activePage === "exam") {
    return (
      <ExamStatsPanel
        examStats={examStats}
        showToast={showToast}
      />
    );
  }

  if (activePage === "settings") {
    return (
      <SettingsPanel
        apiKeys={apiKeys} access={access}
        settingsKeyId={settingsKeyId} settingsAllDomains={settingsAllDomains}
        setSettingsAllDomains={setSettingsAllDomains}
        settingsDomainSelections={settingsDomainSelections}
        settingsKeyRpm={settingsKeyRpm} setSettingsKeyRpm={setSettingsKeyRpm}
        settingsKeyBurst={settingsKeyBurst} setSettingsKeyBurst={setSettingsKeyBurst}
        settingsCustomDomain={settingsCustomDomain} setSettingsCustomDomain={settingsCustomDomain}
        cloudBackupConfigured={cloudBackupConfigured}
        showToast={showToast}
        {...settingsHandlers}
      />
    );
  }

  return null;
}

PageRouter.propTypes = {
  activePage: PropTypes.string.isRequired,
  stats: PropTypes.object.isRequired,
  latencyValue: PropTypes.string.isRequired,
  apiKeys: PropTypes.array.isRequired,
  access: PropTypes.object.isRequired,
  masterKeyInfo: PropTypes.object,
  models: PropTypes.array.isRequired,
  mappingsByDomain: PropTypes.array.isRequired,
  failedPayloads: PropTypes.array.isRequired,
  selectedPayloads: PropTypes.object.isRequired,
  allPayloadSelected: PropTypes.bool.isRequired,
  datasetsDir: PropTypes.string.isRequired,
  autofillProposals: PropTypes.array.isRequired,
  captchaProposals: PropTypes.array.isRequired,
  examStats: PropTypes.object.isRequired,
  cloudBackupConfigured: PropTypes.bool.isRequired,
  userscripts: PropTypes.array.isRequired,
  fetchBootstrap: PropTypes.func.isRequired,
  showToast: PropTypes.func.isRequired,
  editingModelId: PropTypes.number,
  editingModelDraft: PropTypes.object,
  setEditingModelDraft: PropTypes.func.isRequired,
  editingMappingId: PropTypes.number,
  editingMappingDraft: PropTypes.object,
  setEditingMappingDraft: PropTypes.func.isRequired,
  assigningDomainDraft: PropTypes.object,
  setAssigningDomainDraft: PropTypes.func.isRequired,
  createKeyAllDomains: PropTypes.bool.isRequired,
  setCreateKeyAllDomains: PropTypes.func.isRequired,
  createKeyDomainSelections: PropTypes.array.isRequired,
  settingsKeyId: PropTypes.string.isRequired,
  settingsAllDomains: PropTypes.bool.isRequired,
  setSettingsAllDomains: PropTypes.func.isRequired,
  settingsDomainSelections: PropTypes.array.isRequired,
  settingsKeyRpm: PropTypes.number.isRequired,
  setSettingsKeyRpm: PropTypes.func.isRequired,
  settingsKeyBurst: PropTypes.number.isRequired,
  setSettingsKeyBurst: PropTypes.func.isRequired,
  settingsCustomDomain: PropTypes.string.isRequired,
  setSettingsCustomDomain: PropTypes.func.isRequired,
  keyHandlers: PropTypes.object.isRequired,
  settingsHandlers: PropTypes.object.isRequired,
  modelHandlers: PropTypes.object.isRequired,
  proposalHandlers: PropTypes.object.isRequired,
};