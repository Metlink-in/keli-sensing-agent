import { useState, useEffect, useMemo } from "react";
import { getSheetsData, deleteSheetRow, clearSheet } from "../api";
import { FileSpreadsheet, Download, Loader2, Search, Trash2, AlertTriangle } from "lucide-react";

export default function SheetsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("Companies");
  const [search, setSearch] = useState("");
  const [deletingRow, setDeletingRow] = useState(null);   // rowIndex being deleted
  const [clearingAll, setClearingAll] = useState(false);  // clear-all in progress
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const fetchSheets = async () => {
    try {
      setLoading(true);
      const res = await getSheetsData();
      setData(res.data);
    } catch (e) {
      setError(e.response?.data?.error || "Failed to load sheets data. Is your service account valid?");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
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

  // Delete a single row — uses the original row index (not filtered index)
  const handleDeleteRow = async (filteredRowIndex) => {
    if (deletingRow !== null) return;

    // Find the actual index in the full rows array
    const rowToDelete = filteredRows[filteredRowIndex];
    const actualIndex = currentSheet.rows.indexOf(rowToDelete);
    if (actualIndex === -1) return;

    setDeletingRow(filteredRowIndex);
    try {
      await deleteSheetRow(activeTab, actualIndex);
      // Optimistically update local state
      setData(prev => {
        const newRows = [...prev[activeTab].rows];
        newRows.splice(actualIndex, 1);
        return { ...prev, [activeTab]: { ...prev[activeTab], rows: newRows } };
      });
    } catch (e) {
      console.error("Delete row failed:", e);
    } finally {
      setDeletingRow(null);
    }
  };

  // Clear all rows in the active tab
  const handleClearAll = async () => {
    setShowClearConfirm(false);
    setClearingAll(true);
    try {
      await clearSheet(activeTab);
      // Re-fetch to be sure
      await fetchSheets();
    } catch (e) {
      console.error("Clear sheet failed:", e);
      setClearingAll(false);
    }
  };

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

  const dataRowCount = currentSheet?.rows?.length ?? 0;

  return (
    <div className="h-full flex flex-col gap-4">

      {/* Confirm Clear Dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="glass-card p-6 max-w-sm w-full mx-4 shadow-2xl border border-red-500/30">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <AlertTriangle size={20} className="text-red-500" />
              </div>
              <h3 className="font-bold text-lg dark:text-white">Clear All Data?</h3>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              This will permanently delete all <strong>{dataRowCount}</strong> rows from the <strong>{activeTab}</strong> sheet. The header row will be kept. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-slate-300 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-500 hover:bg-red-600 text-white transition-colors flex items-center gap-2"
              >
                <Trash2 size={14} />
                Yes, Clear All
              </button>
            </div>
          </div>
        </div>
      )}

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
        <div className="flex items-center gap-2">
          <div className="relative w-full md:w-56">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              className="input pl-9"
              placeholder="Search rows..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {dataRowCount > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={clearingAll}
              title={`Clear all data in ${activeTab}`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {clearingAll ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Clear All
            </button>
          )}
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
                  {/* Actions column */}
                  <th className="px-4 py-3 border-b border-slate-200 dark:border-gray-800 w-12" />
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="group hover:bg-red-50/50 dark:hover:bg-red-900/10 border-b border-slate-100 dark:border-gray-800/60 transition-colors"
                  >
                    {currentSheet.headers.map((_, cIdx) => (
                      <td key={cIdx} className="px-4 py-2 text-slate-700 dark:text-slate-300 max-w-[200px] truncate text-xs" title={row[cIdx]}>
                        {row[cIdx] || "—"}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleDeleteRow(rIdx)}
                        disabled={deletingRow !== null}
                        title="Delete this row"
                        className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 dark:hover:text-red-400 transition-all disabled:pointer-events-none"
                      >
                        {deletingRow === rIdx
                          ? <Loader2 size={13} className="animate-spin" />
                          : <Trash2 size={13} />
                        }
                      </button>
                    </td>
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
