import { useState, useEffect } from "react";
import {
  Play, Loader2, Settings2, X, ChevronDown, Check, XCircle,
  CheckCheck, MailOpen, Users, Building2, Calendar, Target,
  FileText, BarChart3, Info,
} from "lucide-react";
import {
  runFull, runScrape, runEnrich, runOutreach, previewOutreach,
  runScore, runReport, getIcp, listScrapeRuns,
} from "../api";
import toast from "react-hot-toast";

// ── Tag Input (reused for roles) ────────────────────────────────────────────
function TagInput({ tags, setTags, placeholder }) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (v && !tags.includes(v)) setTags([...tags, v]);
    setInput("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-brand-500/40 focus-within:border-brand-500 transition-all min-h-[40px]">
      {tags.map((t, i) => (
        <span key={i} className="flex items-center gap-1 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded-md text-xs font-semibold">
          {t}
          <button onClick={() => setTags(tags.filter((_, j) => j !== i))}><X size={10} /></button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
        onBlur={add}
        className="flex-1 min-w-[100px] bg-transparent outline-none text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
        placeholder={tags.length === 0 ? placeholder : "Type + Enter..."}
      />
    </div>
  );
}

// ── Modal wrapper ────────────────────────────────────────────────────────────
function Modal({ title, icon: Icon, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-card w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-3 p-5 border-b border-slate-100 dark:border-gray-800">
          {Icon && <div className="p-2 bg-brand-50 dark:bg-brand-900/30 rounded-lg"><Icon size={18} className="text-brand-600 dark:text-brand-400" /></div>}
          <h3 className="font-bold text-slate-800 dark:text-white text-lg">{title}</h3>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">{children}</div>
        {footer && <div className="p-5 border-t border-slate-100 dark:border-gray-800">{footer}</div>}
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">{children}</label>;
}

// ── Scrape Config Modal ──────────────────────────────────────────────────────
function ScrapeModal({ onClose, onRun, icpProfiles }) {
  const [limit, setLimit] = useState(25);
  const [icpKey, setIcpKey] = useState("default");
  const [cadence, setCadence] = useState("manual");

  const cadenceOptions = [
    { value: "manual", label: "Manual (no auto-run)" },
    { value: "0 9 * * 1", label: "Weekly (every Monday 9am)" },
    { value: "0 9 * * *", label: "Daily (9am)" },
    { value: "0 9 1 * *", label: "Monthly (1st of month)" },
  ];

  return (
    <Modal title="Configure Scrape" icon={Building2} onClose={onClose}
      footer={
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => onRun({ limit, icpKey, cadence })} className="btn-primary">
            <Play size={14} /> Run Scrape
          </button>
        </div>
      }>
      <div>
        <FieldLabel>Number of Companies to Scrape</FieldLabel>
        <div className="flex items-center gap-3">
          <input type="range" min={5} max={200} step={5} value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            className="flex-1 accent-brand-500 cursor-pointer" />
          <span className="w-14 text-center font-bold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 rounded-lg px-2 py-1 text-sm">{limit}</span>
        </div>
        <p className="text-xs text-slate-400 mt-1">How many companies Apollo should return per run.</p>
      </div>

      <div>
        <FieldLabel>ICP Configuration</FieldLabel>
        <select value={icpKey} onChange={e => setIcpKey(e.target.value)}
          className="input w-full">
          <option value="default">Default ICP Config</option>
          {icpProfiles.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <p className="text-xs text-slate-400 mt-1">Select which ICP profile to use for this scrape. Edit profiles under <strong>ICP</strong>.</p>
      </div>

      <div>
        <FieldLabel>Run Cadence</FieldLabel>
        <div className="space-y-2">
          {cadenceOptions.map(opt => (
            <label key={opt.value} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${cadence === opt.value ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20" : "border-slate-200 dark:border-gray-700 hover:border-brand-300"}`}>
              <input type="radio" name="cadence" value={opt.value} checked={cadence === opt.value}
                onChange={() => setCadence(opt.value)} className="accent-brand-500" />
              <span className="text-sm text-slate-700 dark:text-slate-200">{opt.label}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-2">Cadence schedules are saved under the <strong>Scheduler</strong> tab.</p>
      </div>
    </Modal>
  );
}

// ── Enrich Config Modal ──────────────────────────────────────────────────────
function EnrichModal({ onClose, onRun, scrapeRuns }) {
  const [selectedRun, setSelectedRun] = useState(scrapeRuns[0]?.tabName || "latest");
  const [roles, setRoles] = useState(["CEO", "CTO", "VP Engineering"]);

  return (
    <Modal title="Configure Enrichment" icon={Users} onClose={onClose}
      footer={
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => onRun({ selectedRun, roles })} className="btn-primary">
            <Play size={14} /> Run Enrich
          </button>
        </div>
      }>
      <div>
        <FieldLabel>Source Scrape List</FieldLabel>
        <select value={selectedRun} onChange={e => setSelectedRun(e.target.value)} className="input w-full">
          <option value="latest">Latest Scrape (Companies sheet)</option>
          {scrapeRuns.map(r => <option key={r.tabName} value={r.tabName}>{r.tabName}</option>)}
        </select>
        <p className="text-xs text-slate-400 mt-1">Which list of companies to find contacts for.</p>
      </div>

      <div>
        <FieldLabel>Target Job Titles / Roles</FieldLabel>
        <TagInput tags={roles} setTags={setRoles} placeholder="e.g. CEO, CTO, VP Engineering..." />
        <p className="text-xs text-slate-400 mt-1">Enrichment will prioritize contacts with these titles. Press Enter after each.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["CEO", "CTO", "VP Engineering", "Head of Operations", "Director of Engineering", "Founder"].map(r => (
          <button key={r} onClick={() => { if (!roles.includes(r)) setRoles([...roles, r]); }}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${roles.includes(r) ? "bg-brand-500 text-white border-brand-500" : "border-slate-300 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:border-brand-400"}`}>
            {r}
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ── Outreach Config + Preview Modal ─────────────────────────────────────────
function OutreachModal({ onClose, onRun, scrapeRuns }) {
  const [step, setStep] = useState("config"); // "config" | "preview"
  const [selectedList, setSelectedList] = useState(scrapeRuns[0]?.tabName || "latest");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [emails, setEmails] = useState([]);

  const handlePreview = async () => {
    setLoadingPreview(true);
    try {
      const { data } = await previewOutreach({ targetList: selectedList });
      setEmails(data.previews.map(e => ({ ...e, approved: null })));
      setStep("preview");
    } catch (e) {
      toast.error("Failed to generate preview emails");
    } finally {
      setLoadingPreview(false);
    }
  };

  const setApproval = (id, val) => setEmails(prev => prev.map(e => e.id === id ? { ...e, approved: val } : e));
  const approveAll = () => setEmails(prev => prev.map(e => ({ ...e, approved: true })));

  const handleSend = () => {
    const approved = emails.filter(e => e.approved === true);
    if (approved.length === 0) { toast.error("No emails approved"); return; }
    onRun({ step: 1, approved });
  };

  const approvedCount = emails.filter(e => e.approved === true).length;
  const deniedCount = emails.filter(e => e.approved === false).length;

  if (step === "config") {
    return (
      <Modal title="Configure Outreach" icon={MailOpen} onClose={onClose}
        footer={
          <div className="flex gap-3 justify-end">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button onClick={handlePreview} disabled={loadingPreview} className="btn-primary">
              {loadingPreview ? <Loader2 size={14} className="animate-spin" /> : <MailOpen size={14} />}
              Generate Email Previews
            </button>
          </div>
        }>
        <div>
          <FieldLabel>Target Enriched Lead List</FieldLabel>
          <select value={selectedList} onChange={e => setSelectedList(e.target.value)} className="input w-full">
            <option value="latest">Latest Enriched Contacts</option>
            {scrapeRuns.map(r => <option key={r.tabName} value={r.tabName}>{r.tabName}</option>)}
          </select>
          <p className="text-xs text-slate-400 mt-1">Select the enriched contact list to send outreach to.</p>
        </div>
        <div className="flex gap-3 p-4 rounded-xl bg-slate-50 dark:bg-gray-900/40 border border-slate-200 dark:border-gray-700">
          <Info size={16} className="text-brand-500 mt-0.5 shrink-0" />
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Clicking "Generate Email Previews" will create <strong>3 sample personalized emails</strong> for your review. You can approve or deny each one before any emails are sent.
          </p>
        </div>
      </Modal>
    );
  }

  // Preview step
  return (
    <Modal title={`Email Previews (${approvedCount} approved · ${deniedCount} denied)`} icon={MailOpen} onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button onClick={approveAll} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
            <CheckCheck size={15} /> Approve All
          </button>
          <div className="flex gap-3">
            <button onClick={() => setStep("config")} className="btn-secondary">← Back</button>
            <button onClick={handleSend} disabled={approvedCount === 0}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              <Play size={14} /> Send {approvedCount} Email{approvedCount !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      }>
      <div className="space-y-4">
        {emails.map((email) => (
          <div key={email.id}
            className={`rounded-xl border-2 transition-all overflow-hidden ${email.approved === true ? "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/10" : email.approved === false ? "border-red-400 bg-red-50/50 dark:bg-red-900/10 opacity-60" : "border-slate-200 dark:border-gray-700"}`}>
            <div className="p-4">
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <div>
                  <p className="text-xs text-slate-400 font-medium">To</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">{email.toName} <span className="font-normal text-slate-400">&lt;{email.to}&gt;</span></p>
                  <p className="text-xs text-slate-500">{email.company}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setApproval(email.id, email.approved === true ? null : true)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${email.approved === true ? "bg-emerald-500 text-white" : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100"}`}>
                    <Check size={13} /> Approve
                  </button>
                  <button onClick={() => setApproval(email.id, email.approved === false ? null : false)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${email.approved === false ? "bg-red-500 text-white" : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100"}`}>
                    <XCircle size={13} /> Deny
                  </button>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-gray-700 p-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Subject</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-white mb-3">{email.subject}</p>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Body</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line">{email.body}</p>
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-gray-800">
                  <p className="text-xs text-slate-400" dangerouslySetInnerHTML={{ __html: email.signature }} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ── Score Config Modal ───────────────────────────────────────────────────────
function ScoreModal({ onClose, onRun }) {
  return (
    <Modal title="Score Leads" icon={BarChart3} onClose={onClose}
      footer={
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => onRun({})} className="btn-primary"><Play size={14} /> Run Scoring</button>
        </div>
      }>
      <div className="flex gap-3 p-4 rounded-xl bg-slate-50 dark:bg-gray-900/40 border border-slate-200 dark:border-gray-700">
        <Info size={16} className="text-brand-500 mt-0.5 shrink-0" />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Lead scoring uses your ICP configuration and email response signals to assign a priority score to each contact. Results are synced to the <strong>Lead Scores</strong> sheet.
        </p>
      </div>
    </Modal>
  );
}

// ── Report Config Modal ──────────────────────────────────────────────────────
function ReportModal({ onClose, onRun }) {
  const sheetUrl = import.meta.env.VITE_GOOGLE_SHEET_URL;
  return (
    <Modal title="Sync Report to Sheets" icon={FileText} onClose={onClose}
      footer={
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => onRun({})} className="btn-primary"><Play size={14} /> Run Report Sync</button>
        </div>
      }>
      <div className="flex gap-3 p-4 rounded-xl bg-slate-50 dark:bg-gray-900/40 border border-slate-200 dark:border-gray-700">
        <Info size={16} className="text-brand-500 mt-0.5 shrink-0" />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          This phase syncs all pipeline data (companies, contacts, outreach logs, scores) to your connected Google Spreadsheet.
        </p>
      </div>
      {sheetUrl && (
        <a href={sheetUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-brand-600 dark:text-brand-400 font-semibold hover:underline">
          🔗 Open Google Sheet (view only)
        </a>
      )}
    </Modal>
  );
}

// ── Phase Card ───────────────────────────────────────────────────────────────
const PHASE_META = {
  scrape:   { color: "from-blue-500 to-cyan-500",    icon: Building2,  label: "1. Scrape",       desc: "Discover new companies via Apollo" },
  enrich:   { color: "from-violet-500 to-purple-500", icon: Users,      label: "2. Enrich",       desc: "Find decision-maker contacts" },
  outreach: { color: "from-orange-500 to-rose-500",  icon: MailOpen,   label: "3. Outreach",     desc: "Preview & send personalized emails" },
  score:    { color: "from-emerald-500 to-teal-500", icon: BarChart3,  label: "4. Score Leads",  desc: "Analyze responses & prioritize" },
  report:   { color: "from-slate-500 to-gray-600",   icon: FileText,   label: "5. Report",       desc: "Sync all data to Google Sheets" },
};

function PhaseCard({ phaseId, loading, lastResult, onConfigure }) {
  const meta = PHASE_META[phaseId];
  const Icon = meta.icon;
  return (
    <div className="glass-card p-5 flex flex-col gap-3 hover:shadow-lg transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${meta.color} flex items-center justify-center shrink-0 shadow-md`}>
          <Icon size={18} className="text-white" />
        </div>
        <button onClick={onConfigure}
          className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors font-medium px-2 py-1 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/20">
          <Settings2 size={13} /> Configure
        </button>
      </div>
      <div>
        <h3 className="font-bold text-slate-800 dark:text-white">{meta.label}</h3>
        <p className="text-xs text-slate-400 mt-0.5">{meta.desc}</p>
      </div>
      {lastResult && (
        <div className={`text-xs font-semibold px-3 py-1.5 rounded-full w-fit ${lastResult.error ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400" : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"}`}>
          {lastResult.error || lastResult.message}
        </div>
      )}
      <button onClick={onConfigure} disabled={loading}
        className="mt-auto w-full justify-center btn-primary">
        {loading ? <><Loader2 size={14} className="animate-spin" /> Running...</> : <><Play size={14} /> Run</>}
      </button>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function PipelinePage() {
  const [loading, setLoading] = useState({});
  const [results, setResults] = useState({});
  const [modal, setModal] = useState(null); // "scrape"|"enrich"|"outreach"|"score"|"report"|null
  const [icpProfiles, setIcpProfiles] = useState([]);
  const [scrapeRuns, setScrapeRuns] = useState([]);

  useEffect(() => {
    getIcp().then(({ data }) => {
      if (data?.name) setIcpProfiles([data.name]);
    }).catch(() => {});
    listScrapeRuns().then(({ data }) => {
      setScrapeRuns(data.runs || []);
    }).catch(() => {});
  }, []);

  const setRunning = (id, val) => setLoading(p => ({ ...p, [id]: val }));
  const setResult = (id, res) => setResults(p => ({ ...p, [id]: res }));

  const handleRunFull = async () => {
    setRunning("all", true);
    try {
      await runFull();
      toast.success("Full pipeline initiated! Data will sync to Google Sheets.");
      setResult("all", { message: "Pipeline started" });
    } catch (e) {
      toast.error(e.response?.data?.error || "Failed to start pipeline");
    } finally {
      setRunning("all", false);
    }
  };

  const handleScrapeRun = async (cfg) => {
    setModal(null);
    setRunning("scrape", true);
    try {
      const { data } = await runScrape(cfg);
      const msg = `✓ ${data.companiesDiscovered} companies discovered`;
      toast.success(msg);
      setResult("scrape", { message: msg });
      // Refresh scrape runs list
      listScrapeRuns().then(r => setScrapeRuns(r.data.runs || [])).catch(() => {});
    } catch (e) {
      const err = e.response?.data?.error || "Scrape failed";
      toast.error(err);
      setResult("scrape", { error: err });
    } finally {
      setRunning("scrape", false);
    }
  };

  const handleEnrichRun = async (cfg) => {
    setModal(null);
    setRunning("enrich", true);
    try {
      const { data } = await runEnrich(cfg);
      const msg = `✓ ${data.contactsEnriched || 0} contacts enriched`;
      toast.success(msg);
      setResult("enrich", { message: msg });
    } catch (e) {
      const err = e.response?.data?.error || "Enrich failed";
      toast.error(err);
      setResult("enrich", { error: err });
    } finally {
      setRunning("enrich", false);
    }
  };

  const handleOutreachRun = async ({ step, approved }) => {
    setModal(null);
    setRunning("outreach", true);
    try {
      const { data } = await runOutreach(step, approved);
      const msg = `✓ Outreach sent`;
      toast.success(msg);
      setResult("outreach", { message: msg });
    } catch (e) {
      const err = e.response?.data?.error || "Outreach failed";
      toast.error(err);
      setResult("outreach", { error: err });
    } finally {
      setRunning("outreach", false);
    }
  };

  const handleScoreRun = async () => {
    setModal(null);
    setRunning("score", true);
    try {
      const { data } = await runScore();
      const msg = `✓ Scoring complete`;
      toast.success(msg);
      setResult("score", { message: msg });
    } catch (e) {
      const err = e.response?.data?.error || "Scoring failed";
      toast.error(err);
      setResult("score", { error: err });
    } finally {
      setRunning("score", false);
    }
  };

  const handleReportRun = async () => {
    setModal(null);
    setRunning("report", true);
    try {
      const { data } = await runReport();
      const msg = `✓ Synced to Google Sheets`;
      toast.success(msg);
      setResult("report", { message: msg });
    } catch (e) {
      const err = e.response?.data?.error || "Report failed";
      toast.error(err);
      setResult("report", { error: err });
    } finally {
      setRunning("report", false);
    }
  };

  const openModal = (id) => setModal(id);

  return (
    <div className="flex flex-col h-full gap-6 max-w-6xl mx-auto">

      {/* Modals */}
      {modal === "scrape"   && <ScrapeModal onClose={() => setModal(null)} onRun={handleScrapeRun} icpProfiles={icpProfiles} />}
      {modal === "enrich"   && <EnrichModal onClose={() => setModal(null)} onRun={handleEnrichRun} scrapeRuns={scrapeRuns} />}
      {modal === "outreach" && <OutreachModal onClose={() => setModal(null)} onRun={handleOutreachRun} scrapeRuns={scrapeRuns} />}
      {modal === "score"    && <ScoreModal onClose={() => setModal(null)} onRun={handleScoreRun} />}
      {modal === "report"   && <ReportModal onClose={() => setModal(null)} onRun={handleReportRun} />}

      {/* Full Pipeline Banner */}
      <div className="glass-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4 border-l-brand-500">
        <div>
          <h2 className="font-bold text-slate-800 dark:text-white text-lg">Full Pipeline</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Run all 5 phases sequentially: Scrape → Enrich → Outreach → Score → Report</p>
        </div>
        <button onClick={handleRunFull} disabled={loading["all"]}
          className="btn-primary shrink-0 whitespace-nowrap">
          {loading["all"] ? <><Loader2 size={16} className="animate-spin" /> Running...</> : <><Play size={16} /> Run Full Pipeline</>}
        </button>
      </div>

      {/* Phase Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {(["scrape", "enrich", "outreach", "score", "report"]).map(id => (
          <PhaseCard
            key={id}
            phaseId={id}
            loading={loading[id]}
            lastResult={results[id]}
            onConfigure={() => openModal(id)}
          />
        ))}
      </div>

      {/* Empty state placeholder */}
      <div className="glass-card flex-1 flex items-center justify-center p-10 text-center">
        <div>
          <Target size={36} className="mx-auto mb-3 text-slate-300 dark:text-gray-600" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">Run a phase above to see results.</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Results and logs will appear here after a phase completes.</p>
        </div>
      </div>
    </div>
  );
}
