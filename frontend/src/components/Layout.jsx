import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

const PAGE_TITLES = {
  "/":          "Overview",
  "/pipeline":  "Pipeline Control",
  "/scheduler": "Automation Scheduler",
  "/sheets":    "Google Sheets Data",
  "/leads":     "Lead Scores",
  "/settings":  "Settings",
};

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const { pathname } = useLocation();

  const title = Object.entries(PAGE_TITLES).find(([path]) => 
    path === "/" ? pathname === "/" : pathname.startsWith(path)
  )?.[1] || "Dashboard";

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-gray-950 overflow-hidden">
      <Sidebar collapsed={collapsed} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar collapsed={collapsed} onToggle={() => setCollapsed(p => !p)} title={title} />
        <main className="flex-1 overflow-y-auto p-6 bg-grid">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
