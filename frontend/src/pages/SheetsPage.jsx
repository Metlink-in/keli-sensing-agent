import { useState, useEffect, useMemo } from "react";
import { getSheetsData } from "../api";
import { FileSpreadsheet, Download, Loader2, Search } from "lucide-react";

export default function SheetsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("Companies");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchSheets = async () => {
      try {
        const res = await getSheetsData();
        setData(res.data);
      } catch (e) {
        setError(e.response?.data?.error || "Failed to load sheets data. Is your service account valid?");
      } finally {
        setLoading(false);
      }
    };
    fetchSheets();
  }, []);

  const currentSheet = data?.[activeTab];
  
  const filteredRows = useMemo(() => {
    if (!currentSheet || !currentSheet.rows) return [];
    if (!search) return currentSheet.rows;
    const lowerSearch = search.toLowerCase();
    return currentSheet.rows.filter(row => 
      row.some(cell => String(cell).toLowerCase().includes(lowerSearch))
    );
  }, [currentSheet, search]);

  if (loading) return (
    <div className="h-full flex flex-col items-center justify-center text-slate-500">
      <Loader2 size={32} className="animate-spin mb-4" />
      <p>Fetching data from Google Sheets...</p>
    </div>
  );

  if (error) return (
    <div className="glass-card p-6 border-l-4 border-l-red-500">
      <h3 className="text-red-500 font-bold mb-2">Error Connecting to Sheets</h3>
      <p className="text-sm dark:text-slate-300">{error}</p>
    </div>
  );

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-4">
        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-1">
          {["Companies", "Contacts", "Outreach Log", "Responses", "Lead Scores"].map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setSearch(""); }}
              className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                activeTab === tab 
                  ? "bg-brand-500 text-white shadow-md" 
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-slate-300 dark:hover:bg-gray-700"
              }`}
            >
              <FileSpreadsheet size={14} className="inline-block mr-2" />
              {tab}
            </button>
          ))}
        </div>
        <div className="relative w-full md:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            className="input pl-9" 
            placeholder="Search rows..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="glass-card flex-1 overflow-hidden flex flex-col">
        {currentSheet && currentSheet.headers.length > 0 ? (
          <div className="flex-1 overflow-auto relative">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-slate-50 dark:bg-gray-900 sticky top-0 z-10 shadow-sm">
                <tr>
                  {currentSheet.headers.map((h, i) => (
                    <th key={i} className="px-4 py-3 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap border-b border-slate-200 dark:border-gray-800">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-gray-800/50 border-b border-slate-100 dark:border-gray-800/60 transition-colors">
                    {currentSheet.headers.map((_, cIdx) => (
                      <td key={cIdx} className="px-4 py-2 text-slate-700 dark:text-slate-300 max-w-[200px] truncate text-xs" title={row[cIdx]}>
                        {row[cIdx] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredRows.length === 0 && (
              <div className="text-center p-8 text-slate-500">No matching rows found.</div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8 text-slate-500">
            This sheet is currently empty.
          </div>
        )}
      </div>
    </div>
  );
}
