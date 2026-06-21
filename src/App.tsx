import React, { useState, useEffect, useRef } from "react";
import { 
  Terminal, 
  Trash2, 
  Copy, 
  Check, 
  RotateCw, 
  Wifi, 
  WifiOff, 
  Database, 
  Play, 
  AlertTriangle, 
  HelpCircle, 
  Server, 
  FileText, 
  User, 
  Layers,
  ChevronRight,
  Sparkles,
  Info
} from "lucide-react";

interface ConfigInfo {
  configured: boolean;
  mode: "production" | "simulation";
  domain: string;
  destinationEmail: string;
  details: {
    hasToken: boolean;
    hasZoneId: boolean;
    hasDomain: boolean;
    hasDestEmail: boolean;
  };
}

interface CFAddressRule {
  id: string;
  name: string;
  enabled: boolean;
  matchers: Array<{ type: string; field: string; value: string }>;
  actions: Array<{ type: string; value: string[] }>;
}

interface LogEntry {
  timestamp: string;
  type: "success" | "info" | "warning" | "error" | "command";
  message: string;
}

export default function App() {
  const [config, setConfig] = useState<ConfigInfo | null>(null);
  const [rules, setRules] = useState<CFAddressRule[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([
    { timestamp: getTimeString(), type: "info", message: "Powering up CF Temp Mail terminal..." },
    { timestamp: getTimeString(), type: "info", message: "System initialized. Ready for operations." }
  ]);
  const [customLocalPart, setCustomLocalPart] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [ruleToDelete, setRuleToDelete] = useState<CFAddressRule | null>(null);
  const [showConfigDetails, setShowConfigDetails] = useState<boolean>(false);

  // References
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Get current time formatted
  function getTimeString() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  // Push new entry to session logs
  const addLog = (type: LogEntry["type"], message: string) => {
    setLogs(prev => [
      ...prev,
      { timestamp: getTimeString(), type, message }
    ]);
  };

  // Scroll logs to bottom
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Fetch API configurations on component mount
  useEffect(() => {
    fetchConfig();
    fetchRules(true);
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await fetch("/api/config");
      if (response.ok) {
        const data = await response.json();
        setConfig(data);
        if (data.mode === "simulation") {
          addLog("warning", "Running in SIMULATION MODE. Please define CF_API_TOKEN, CF_ZONE_ID etc. in your .env/secrets file to connect to real Cloudflare email routing.");
        } else {
          addLog("success", `System connected successfully in PRODUCTION MODE. Domain: @${data.domain}`);
        }
      } else {
        addLog("error", "Failed to retrieve configuration status from backend service.");
      }
    } catch (err: any) {
      addLog("error", "Error connecting to configuration API: " + err.message);
    }
  };

  const fetchRules = async (isInitialCall = false) => {
    setIsRefreshing(true);
    if (!isInitialCall) {
      addLog("command", "$ fetch_active_routing_rules");
    }
    try {
      const response = await fetch("/api/list");
      const data = await response.json();
      if (response.ok && data.success) {
        setRules(data.result || []);
        if (!isInitialCall) {
          addLog("success", `Fetched ${data.result?.length || 0} active routing rule(s) from backend.`);
        }
        setApiError(null);
      } else {
        const errMsg = data.error || "Unknown response error";
        setApiError(errMsg);
        addLog("error", `Failed to retrieve active rules: ${errMsg}`);
      }
    } catch (err: any) {
      setApiError(err.message);
      addLog("error", `Connection failure: ${err.message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCreateEmail = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsCreating(true);
    
    const tokenPrompt = customLocalPart ? `local_part=${customLocalPart.trim()}` : "random_generated";
    addLog("command", `$ generate_email --assign ${tokenPrompt}`);

    try {
      const response = await fetch("/api/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          localPart: customLocalPart.trim() || undefined
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        addLog("success", `Successfully generated temp email route: ${data.address}`);
        setCustomLocalPart("");
        // Instantly refresh list
        fetchRules(true);
      } else {
        const errorText = data.error || "Failed registration payload";
        addLog("error", `Generation failed: ${errorText}`);
      }
    } catch (err: any) {
      addLog("error", `Generation connection exception: ${err.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteRule = async () => {
    if (!ruleToDelete) return;
    const ruleId = ruleToDelete.id;
    const ruleEmail = ruleToDelete.matchers[0]?.value || "unknown";

    addLog("command", `$ destroy_rule --id ${ruleId} --target ${ruleEmail}`);
    setRuleToDelete(null);

    try {
      const response = await fetch(`/api/delete/${ruleId}`, {
        method: "DELETE"
      });
      const data = await response.json();

      if (response.ok && data.success) {
        addLog("success", `Rule mapping for ${ruleEmail} deleted successfully.`);
        // Instantly filter out local view for instant feel, then fetch fresh
        setRules(prev => prev.filter(r => r.id !== ruleId));
        fetchRules(true);
      } else {
        addLog("error", `Failed to delete route rule: ${data.error || 'Server error'}`);
      }
    } catch (err: any) {
      addLog("error", `Deletion exception: ${err.message}`);
    }
  };

  const handleCopyClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    addLog("info", `Copied to clipboard: ${text}`);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const clearLogs = () => {
    setLogs([
      { timestamp: getTimeString(), type: "info", message: "Terminal log history wiped clean." }
    ]);
  };

  return (
    <div className="min-h-screen px-4 py-8 md:py-16 selection:bg-[#00ffa8] selection:text-black">
      <div className="max-w-5xl mx-auto">
        
        {/* Terminal Header Info & Title */}
        <div className="flex flex-col md:flex-row items-center justify-between mb-8 pb-4 border-b border-zinc-800 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 bg-green-neon rounded-full animate-ping"></span>
              <span className="text-xs font-mono tracking-widest text-[#00ffa8] font-semibold bg-[#00ffa8]/10 px-2 py-0.5 rounded border border-[#00ffa8]/30">
                SYSTEM LIVE
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold font-mono tracking-tight text-white flex items-center gap-2">
              <span className="text-neon">CF TEMP MAIL</span>
              <span className="text-slate-500 font-normal">v1.1.0</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Simulation / Production Indicator badge */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm ${
              config?.mode === "production" 
                ? "bg-emerald-950/40 border-emerald-500/35 text-emerald-400" 
                : "bg-amber-950/40 border-amber-500/35 text-amber-400"
            }`}>
              {config?.mode === "production" ? <Wifi size={15} /> : <AlertTriangle size={15} />}
              <span className="font-semibold tracking-wide">
                Mode: {config ? config.mode.toUpperCase() : "INIT..."}
              </span>
            </div>

            <button 
              onClick={() => fetchConfig()} 
              className="p-2 text-slate-400 hover:text-white hover:bg-zinc-850 rounded-md border border-zinc-800 transition"
              title="Refresh connection configuration credentials information"
              id="refresh_config_btn"
            >
              <RotateCw size={15} className="hover:rotate-180 transition duration-500" />
            </button>
          </div>
        </div>

        {/* Configuration Notice Panel */}
        {config && !config.configured && (
          <div className="mb-6 p-4 rounded-lg bg-amber-950/30 border border-amber-500/20 text-amber-200 text-sm leading-relaxed" id="simulation_status_panel">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
              <div>
                <p className="font-bold text-amber-400 mb-1">Demo / Simulation Mode is Currently Running</p>
                <p>
                  You are observing the interface using a secure sandbox simulation. To connect your real-world Cloudflare Email Routing domain proxy, configure these environment keys in the Secrets panel or your <code>.env</code> file:
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 font-mono text-xs">
                  <div className={`p-1.5 rounded border ${config.details.hasToken ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-400' : 'border-zinc-800 bg-zinc-900/40 text-slate-500'}`}>
                    CF_API_TOKEN: {config.details.hasToken ? '✅' : '❌ missing'}
                  </div>
                  <div className={`p-1.5 rounded border ${config.details.hasZoneId ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-400' : 'border-zinc-800 bg-zinc-900/40 text-slate-500'}`}>
                    CF_ZONE_ID: {config.details.hasZoneId ? '✅' : '❌ missing'}
                  </div>
                  <div className={`p-1.5 rounded border ${config.details.hasDomain ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-400' : 'border-zinc-800 bg-zinc-900/40 text-slate-500'}`}>
                    CF_DOMAIN: {config.details.hasDomain ? '✅' : '❌ missing'}
                  </div>
                  <div className={`p-1.5 rounded border ${config.details.hasDestEmail ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-400' : 'border-zinc-800 bg-zinc-900/40 text-slate-500'}`}>
                    CF_DEST_EMAIL: {config.details.hasDestEmail ? '✅' : '❌ missing'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Active routing meta badges */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-[#0c0f12] border border-zinc-800 rounded-lg p-3 flex items-center gap-3">
            <div className="p-2.5 rounded bg-zinc-900 text-[#00ffa8] border border-zinc-800">
              <Server size={18} />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-widest font-sans font-semibold">Active Domain</p>
              <p className="text-sm font-semibold text-white font-mono break-all" id="active_domain_badge">
                {config?.domain || "demo-temp-mail.com"}
              </p>
            </div>
          </div>

          <div className="bg-[#0c0f12] border border-zinc-800 rounded-lg p-3 flex items-center gap-3">
            <div className="p-2.5 rounded bg-zinc-900 text-teal-400 border border-zinc-800">
              <Layers size={18} />
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-widest font-sans font-semibold">Forward Target</p>
              <p className="text-sm font-semibold text-white font-mono break-all" id="forward_target_badge">
                {config?.destinationEmail || "demo-recipient@gmail.com"}
              </p>
            </div>
          </div>

          <div className="bg-[#0c0f12] border border-zinc-800 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded bg-zinc-900 text-cyan-400 border border-zinc-800">
                <Database size={18} />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-widest font-sans font-semibold">Active Mail Rules</p>
                <p className="text-lg font-bold text-white font-mono" id="active_rules_count">
                  {rules.length} Addresses
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* MAIN TERMINAL WINDOW */}
        <div className="bg-terminal-bg border border-terminal-border rounded-xl overflow-hidden shadow-terminal" id="main_terminal_window">
          {/* Mac style header */}
          <div className="bg-terminal-header border-b border-terminal-border px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500 hover:opacity-80 transition cursor-pointer" title="Close interface (disabled)"></span>
              <span className="w-3 h-3 rounded-full bg-amber-400 hover:opacity-80 transition cursor-pointer" title="Minimize interface (disabled)"></span>
              <span className="w-3 h-3 rounded-full bg-emerald-500 hover:opacity-80 transition cursor-pointer" title="Maximize interface (disabled)"></span>
              <span className="text-xs text-slate-500 font-mono ml-4 select-none">root@cloudflare-temp-mail:~</span>
            </div>
            
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="hidden sm:inline">Active session logger</span>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
            </div>
          </div>

          {/* Interactive Shell Input bar */}
          <div className="p-5 border-b border-terminal-border bg-slate-950/20">
            <div className="mb-2 text-xs text-[#00ffa8] font-mono flex items-center justify-between">
              <span>GENERATE NEW ROUTED TEMPORARY ADDRESS:</span>
              <span className="text-slate-500 font-sans">Type name or leave blank for secure random sequence</span>
            </div>
            
            <form onSubmit={handleCreateEmail} className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1 flex items-center rounded-lg bg-black border border-zinc-800 focus-within:border-[#00ffa8] transition px-3">
                <span className="text-[#00ffa8] font-mono mr-2 select-none">$</span>
                <input 
                  type="text" 
                  value={customLocalPart}
                  onChange={(e) => setCustomLocalPart(e.target.value.replace(/[^a-zA-Z0-9_\-]/g, ""))}
                  placeholder="custom_prefix_name (optional)"
                  className="bg-transparent border-0 outline-none w-full py-2.5 text-white font-mono placeholder-slate-700 text-sm focus:ring-0 focus:outline-none"
                  maxLength={30}
                  disabled={isCreating}
                  id="custom_prefix_input"
                />
                {customLocalPart && (
                  <span className="text-xs text-slate-500 mr-2 font-mono select-none">
                    @{config?.domain || "demo-temp-mail.com"}
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 md:flex-initial px-5 py-2.5 bg-[#00ffa8] hover:bg-[#00ffa8]/90 text-black font-extrabold uppercase text-xs tracking-wider rounded-lg transition duration-200 disabled:bg-zinc-800 disabled:text-slate-500 flex items-center justify-center gap-2"
                  id="btn_generate_email"
                >
                  <Sparkles size={14} className={isCreating ? "animate-spin" : ""} />
                  <span>{isCreating ? "GENERATING..." : "generate_email"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => fetchRules()}
                  disabled={isRefreshing}
                  className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-slate-300 font-bold uppercase text-xs tracking-wider rounded-lg border border-zinc-800 transition flex items-center gap-2 "
                  id="btn_refresh_rules"
                  title="Force re-query rules from server"
                >
                  <RotateCw size={14} className={isRefreshing ? "animate-spin" : ""} />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>
            </form>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[420px]">
            {/* LEFT PANEL: EMAIL ADDRESSES DICTIONARY & LISTING */}
            <div className="lg:col-span-7 border-b lg:border-b-0 lg:border-r border-terminal-border p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-800/60">
                  <h3 className="text-xs font-bold text-slate-400 flex items-center gap-2 tracking-widest uppercase">
                    <FileText size={13} className="text-cyan-glow" />
                    ACTIVE TEMPORARY MAILBOXES ({rules.length})
                  </h3>
                  
                  <span className="text-[10px] text-slate-500 font-sans">
                    *Fowards to target automatically
                  </span>
                </div>

                {apiError && (
                  <div className="p-3 mb-4 rounded bg-rose-950/20 border border-rose-300/20 text-rose-300 text-xs">
                    <p className="font-bold mb-1">Configuration / API Connection Error:</p>
                    <p className="font-sans leading-relaxed">{apiError}</p>
                    <p className="mt-2 text-[10px] text-slate-400">If Cloudflare token is wrong or Zone ID invalid, double-check server settings values.</p>
                  </div>
                )}

                {/* Listing of Address Card Blocks */}
                {rules.length === 0 ? (
                  <div className="py-12 px-4 text-center border-2 border-dashed border-zinc-900 rounded-lg" id="empty_list_prompt">
                    <HelpCircle size={32} className="mx-auto text-slate-600 mb-3" />
                    <p className="text-sm font-semibold text-slate-400 font-mono">No active routed emails found.</p>
                    <p className="text-xs text-slate-600 mt-1 font-sans">Click "generate_email" to create your first disposable route.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1" id="active_rules_list">
                    {rules.map((rule) => {
                      const emailAddress = rule.matchers[0]?.value || "unknown";
                      const localPartOnly = emailAddress.split("@")[0] || "random";
                      const isSim = rule.id.startsWith("rule_sim_");

                      return (
                        <div 
                          key={rule.id}
                          className="p-3.5 rounded-lg bg-black/60 border border-zinc-800 hover:border-zinc-700/80 transition relative group"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              {/* Address */}
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="w-2 h-2 rounded-full bg-green-neon" title="Status active"></span>
                                <span className="text-white font-bold font-mono text-sm break-all select-all">
                                  {emailAddress}
                                </span>
                              </div>
                              
                              {/* Metadata indicators */}
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 font-mono">
                                <span>Rule Name: <span className="text-zinc-400">{rule.name}</span></span>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  Type: 
                                  <span className={`px-1 rounded text-[10px] ${isSim ? 'bg-amber-950/40 text-amber-500 border border-amber-900/40' : 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40'}`}>
                                    {isSim ? "Simulated" : "Cloudflare"}
                                  </span>
                                </span>
                              </div>
                            </div>

                            {/* Control Actions buttons */}
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handleCopyClipboard(emailAddress, rule.id)}
                                className="p-2 bg-zinc-900 hover:bg-[#00ffa8]/10 hover:text-[#00ffa8] text-slate-400 rounded border border-zinc-800 transition"
                                title="Copy email address to clipboard"
                                id={`copy_btn_${rule.id}`}
                              >
                                {copiedId === rule.id ? (
                                  <Check size={14} className="text-[#00ffa8]" />
                                ) : (
                                  <Copy size={14} />
                                )}
                              </button>

                              <button
                                onClick={() => setRuleToDelete(rule)}
                                className="p-2 bg-zinc-900 hover:bg-rose-950/40 hover:text-rose-400 text-slate-400 rounded border border-zinc-800 hover:border-rose-500/30 transition"
                                title="Delete email routing rule"
                                id={`delete_btn_${rule.id}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Status and instruction footer */}
              <div className="mt-4 pt-3 border-t border-zinc-900 text-xs text-slate-500 flex items-center justify-between font-sans">
                <span>Domain source: Cloudflare Cloud Console</span>
                <span className="flex items-center gap-1">
                  Secure proxy route <Check size={12} className="text-green-neon" />
                </span>
              </div>
            </div>

            {/* RIGHT PANEL: LIVE SESSION COMMAND LOGS */}
            <div className="lg:col-span-5 p-5 bg-black/40 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-800/60">
                  <h3 className="text-xs font-bold text-slate-400 flex items-center gap-2 tracking-widest uppercase">
                    <Terminal size={13} className="text-amber-glow" />
                    LIVE TELEMETRY LOGS
                  </h3>
                  
                  <button 
                    onClick={clearLogs}
                    className="text-[10px] text-zinc-500 hover:text-white px-2 py-0.5 border border-zinc-800 rounded bg-zinc-950 hover:bg-zinc-900 font-mono transition"
                    id="clear_logs_btn"
                  >
                    WIPE_LOGS
                  </button>
                </div>

                {/* Scrollable logs box */}
                <div className="h-[310px] overflow-y-auto space-y-2.5 pr-1 font-mono text-xs text-slate-400 bg-black/30 p-3 rounded border border-zinc-900/60">
                  {logs.map((log, index) => {
                    let typeColor = "text-slate-400";
                    let typeLabel = "INFO";

                    switch (log.type) {
                      case "command":
                        typeColor = "text-cyan-400 font-bold";
                        typeLabel = "SH";
                        break;
                      case "success":
                        typeColor = "text-[#00ffa8]";
                        typeLabel = "OK";
                        break;
                      case "warning":
                        typeColor = "text-amber-400";
                        typeLabel = "WARN";
                        break;
                      case "error":
                        typeColor = "text-red-400 font-bold";
                        typeLabel = "FAIL";
                        break;
                    }

                    return (
                      <div key={index} className="leading-relaxed border-b border-zinc-900/30 pb-1.5 last:border-0 last:pb-0">
                        <div className="flex items-start gap-1.5">
                          <span className="text-[10px] text-slate-600 select-none shrink-0">
                            [{log.timestamp}]
                          </span>
                          <span className={`${typeColor} text-[10px] uppercase font-bold tracking-wider select-none shrink-0`}>
                            {typeLabel} &gt;&gt;
                          </span>
                          <span className="break-all font-mono">
                            {log.message}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={logsEndRef} />
                </div>
              </div>

              {/* Console Prompt style decorator */}
              <div className="border-t border-zinc-800/55 pt-3 mt-4 text-[11px] text-slate-500 flex items-center justify-between font-mono">
                <div className="flex items-center gap-1">
                  <ChevronRight size={13} className="text-[#00ffa8] animate-pulse" />
                  <span>Interactive console active</span>
                </div>
                <span>SSL / Encrypted</span>
              </div>
            </div>
          </div>
        </div>

        {/* INFORMATIVE EXPLANATORY FOOTER NOTES */}
        <div className="mt-8 bg-[#0c0f12] border border-zinc-800/60 p-6 rounded-xl">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Info size={16} className="text-[#00ffa8]" />
            What is CF Temp Mail & How does email routing work?
          </h3>
          <ul className="space-y-2.5 text-xs text-slate-400 leading-relaxed font-sans">
            <li className="flex gap-2">
              <span className="text-[#00ffa8] font-bold font-mono">1.</span>
              <span><strong>Cloudflare Email Routing integration:</strong> When you generate a new email address, a <code>literal matching rule</code> is registered directly to your target Cloudflare Domain inside your organization. Cloudflare routes any emails landing here onto your personal inbox safe and secure.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-[#00ffa8] font-bold font-mono">2.</span>
              <span><strong>Total Privacy Controls:</strong> You never expose your real personal address online when testing newsletters, logging into apps, or signing up on suspicious websites.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-[#00ffa8] font-bold font-mono">3.</span>
              <span><strong>Instant Discard:</strong> When a route starts collecting spam or you no longer need it, delete it with one click. Destruction is done at the CDN / DNS edge server in microseconds.</span>
            </li>
          </ul>
        </div>

        {/* CONFIRMATION DELETION MODAL */}
        {ruleToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 transition-opacity" id="deletion_modal">
            <div className="border border-zinc-800 bg-terminal-bg rounded-lg max-w-md w-full overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="bg-terminal-header border-b border-terminal-border px-5 py-4 flex items-center gap-3">
                <div className="p-1.5 bg-rose-500/10 text-rose-400 rounded border border-rose-500/20">
                  <AlertTriangle size={18} />
                </div>
                <h3 className="text-base font-bold text-white font-mono">CRITICAL_ACTION_REQUIRED</h3>
              </div>
              
              {/* Content */}
              <div className="p-5">
                <p className="text-sm text-slate-300 leading-relaxed font-sans">
                  You are requested to destroy the current mail direction. This action is <strong className="text-rose-400">permanent</strong> and cannot be undone.
                </p>
                <div className="mt-3 p-3 bg-black/60 rounded border border-zinc-800 font-mono text-xs">
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Target Address:</span>
                    <span className="font-bold text-white">{ruleToDelete.matchers[0]?.value}</span>
                  </div>
                  <div className="flex justify-between py-1 border-t border-zinc-900/50 mt-1 pt-1">
                    <span className="text-slate-500">Rule ID Code:</span>
                    <span className="text-zinc-400">{ruleToDelete.id}</span>
                  </div>
                </div>
              </div>

              {/* Footer actions */}
              <div className="bg-terminal-header px-5 py-4 border-t border-terminal-border flex justify-end gap-3 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => setRuleToDelete(null)}
                  className="px-4 py-2 rounded bg-zinc-900 hover:bg-zinc-800 text-slate-300 border border-zinc-800 transition uppercase"
                  id="cancel_delete_btn"
                >
                  $ cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteRule}
                  className="px-4 py-2 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold transition uppercase"
                  id="confirm_delete_btn"
                >
                  $ destroy_rule --force
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
