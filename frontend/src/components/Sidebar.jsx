import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Cpu, CalendarClock, Sheet, Trophy, Settings,
  Radio, Target
} from "lucide-react";

const links = [
  { to: "/",          label: "Overview",    icon: LayoutDashboard },
  { to: "/pipeline",  label: "Pipeline",    icon: Cpu },
  { to: "/icp",       label: "ICP Config",  icon: Target },
  { to: "/scheduler", label: "Scheduler",   icon: CalendarClock },
  { to: "/sheets",    label: "Sheets",      icon: Sheet },
  { to: "/leads",     label: "Lead Scores", icon: Trophy },
  { to: "/settings",  label: "Settings",    icon: Settings },
];

export default function Sidebar({ collapsed }) {
  const { pathname } = useLocation();

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 68 : 224 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="h-screen sticky top-0 flex flex-col bg-white dark:bg-gray-900 border-r border-slate-200 dark:border-gray-800 z-30 overflow-hidden"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-100 dark:border-gray-800">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-accent-cyan flex-shrink-0 flex items-center justify-center shadow-glow">
          <Radio size={16} className="text-white" />
        </div>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <p className="font-bold text-sm text-slate-900 dark:text-white leading-none">Keli Sensing</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Agent Dashboard</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 flex flex-col gap-1 overflow-y-auto no-scrollbar">
        {links.map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <NavLink key={to} to={to} end={to === "/"}>
              <motion.div
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.97 }}
                className={active ? "nav-item-active" : "nav-item"}
              >
                <Icon size={18} className="flex-shrink-0" />
                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden whitespace-nowrap text-sm"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-slate-100 dark:border-gray-800">
        <div className={`flex items-center gap-2.5 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 ${collapsed ? "justify-center" : ""}`}>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-slow flex-shrink-0" />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs text-emerald-700 dark:text-emerald-400 font-medium overflow-hidden whitespace-nowrap"
              >
                API Online
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  );
}
