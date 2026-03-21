import { motion } from "framer-motion";
import { Moon, Sun, Menu, X } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

export default function Topbar({ collapsed, onToggle, title }) {
  const { dark, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-slate-200 dark:border-gray-800">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggle}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors text-slate-500 dark:text-slate-400"
        >
          {collapsed ? <Menu size={18} /> : <X size={18} />}
        </button>
        <h1 className="font-bold text-lg text-slate-900 dark:text-white">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <motion.button
          onClick={toggle}
          whileTap={{ scale: 0.9 }}
          whileHover={{ scale: 1.05 }}
          className="p-2.5 rounded-xl bg-slate-100 dark:bg-gray-800 text-slate-500 dark:text-slate-400 hover:text-brand-500 dark:hover:text-brand-400 transition-colors"
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </motion.button>
      </div>
    </header>
  );
}
