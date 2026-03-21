import { useState, useEffect } from "react";
import { Terminal, Play, Loader2 } from "lucide-react";
import { 
  runFull, runScrape, runEnrich, runOutreach, runScore, runReport, getLogs 
} from "../api";
import toast from "react-hot-toast";

const PHASES = [
  { id: "all", name: "Run Full Pipeline", fn: runFull, color: "btn-primary", desc: "Runs all 5 phases sequentially" },
  { id: "scrape", name: "1. Scrape", fn: runScrape, color: "btn-secondary", desc: "Discover new companies via Apollo" },
  { id: "enrich", name: "2. Enrich", fn: runEnrich, color: "btn-secondary", desc: "Find contacts for companies" },
  { id: "outreach", name: "3. Outreach", fn: () => runOutreach(1), color: "btn-secondary", desc: "Send personalized emails" },
  { id: "score", name: "4. Score Leads", fn: runScore, color: "btn-secondary", desc: "Analyze responses & prioritize" },
  { id: "report", name: "5. Report", fn: runReport, color: "btn-secondary", desc: "Sync to Google Sheets" },
];

export default function PipelinePage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState({});

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const { data } = await getLogs();
        setLogs(data.lines || []);
      } catch (e) {}
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleRun = async (phase) => {
    setLoading(p => ({ ...p, [phase.id]: true }));
    try {
      if (phase.id === "all") {
        await phase.fn();
        toast.success("Full pipeline initiated! Check logs.");
      } else {
        const { data } = await phase.fn();
        toast.success(data.message || `Phase ${phase.name} completed successfully`);
      }
    } catch (e) {
      toast.error(e.response?.data?.error || `Failed to run ${phase.name}`);
    } finally {
      setLoading(p => ({ ...p, [phase.id]: false }));
    }
  };

  const parseLog = (line) => {
    try {
      if (line.trim().startsWith('{')) {
        const obj = JSON.parse(line);
        const date = new Date(obj.timestamp);
        const time = isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second:'2-digit' });
        
        return {
          time,
          level: (obj.level || "INFO").toUpperCase(),
          source: obj.agent || "System",
          message: obj.message || "",
          raw: false
        };
      }
    } catch(e) {
      // Fallback
    }

    const match = line.match(/^(\d{2}:\d{2}:\d{2})\s+\[(.*?)\]\s+(?:\[(.*?)\])?\s*(.*)/);
    if (!match) return { time: "", level: "INFO", source: "", message: line, raw: true };
    
    return {
      time: match[1],
      level: match[2],
      source: match[3] || "System",
      message: match[4]
    };
  };

  return (
    <div className="flex flex-col h-full gap-6 max-w-6xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {PHASES.map(phase => (
          <div key={phase.id} className="glass-card p-5 hover:shadow-lg transition-all flex flex-col justify-between">
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-white">{phase.name}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{phase.desc}</p>
            </div>
            <button
              onClick={() => handleRun(phase)}
              disabled={loading[phase.id]}
              className={`mt-4 w-full justify-center ${phase.color}`}
            >
              {loading[phase.id] ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              {loading[phase.id] ? "Running..." : "Run"}
            </button>
          </div>
        ))}
      </div>

      <div className="flex-1 glass-card overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 dark:border-gray-800 flex items-center gap-2 bg-slate-50 dark:bg-gray-900/50">
          <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
            <Terminal size={16} className="text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 dark:text-white">Recent Activity</h3>
            <p className="text-xs text-slate-500">Live updates from the agent</p>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse-slow" />
            Live
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-gray-900/20 flex flex-col gap-4">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <Loader2 size={24} className="animate-spin mb-2 opacity-50" />
              <p>Waiting for activity...</p>
            </div>
          ) : (
            logs.map((line, i) => {
              const parsed = parseLog(line);
              if (!parsed.message.trim()) return null; // skip empty
              
              const isError = parsed.level === "ERROR";
              const isSuccess = parsed.message.includes("✓") || parsed.message.includes("SUCCESS");
              
              return (
                <div key={i} className="flex gap-4 group">
                  <div className="flex flex-col items-center pt-1">
                    <div className={`w-2.5 h-2.5 rounded-full ring-4 ring-white dark:ring-gray-900 ${
                      isError ? "bg-red-500" : isSuccess ? "bg-emerald-500" : "bg-brand-400"
                    }`} />
                    {i !== logs.length - 1 && <div className="w-[1px] h-full bg-slate-100 dark:bg-gray-800 mt-2" />}
                  </div>
                  
                  <div className="flex-1 pb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{parsed.time}</span>
                      {!parsed.raw && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 dark:bg-gray-800 text-slate-500">
                          {parsed.source}
                        </span>
                      )}
                    </div>
                    <p className={`text-sm ${
                      isError ? "text-red-600 dark:text-red-400 font-medium" 
                      : isSuccess ? "text-emerald-700 dark:text-emerald-400 font-medium"
                      : "text-slate-700 dark:text-slate-300"
                    }`}>
                      {parsed.message}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
