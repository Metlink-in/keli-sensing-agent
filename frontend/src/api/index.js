import axios from "axios";

const BASE = "/api";

const api = axios.create({ baseURL: BASE, timeout: 300000 });

// --- Stats ---
export const getStats       = ()         => api.get("/stats");

// --- Pipeline ---
export const runFull        = ()         => api.post("/pipeline/all");
export const runScrape      = ()         => api.post("/pipeline/scrape");
export const runEnrich      = ()         => api.post("/pipeline/enrich");
export const runOutreach    = (step = 1) => api.post("/pipeline/outreach", { step });
export const runScore       = ()         => api.post("/pipeline/score");
export const runReport      = ()         => api.post("/pipeline/report");
export const processReply   = (data)     => api.post("/pipeline/reply", data);
export const resetState     = ()         => api.post("/reset");

// --- ICP ---
export const getIcp         = ()         => api.get("/icp");
export const saveIcp        = (data)     => api.post("/icp", data);

// --- Environment / Credentials ---
export const getEnv         = ()         => api.get("/env");
export const saveEnv        = (data)     => api.post("/env", data);

// --- Logs ---
export const getLogs        = ()         => api.get("/logs");

// --- Sheets ---
export const getSheetsData  = ()         => api.get("/sheets/data");

// --- Scheduler ---
export const getSchedules   = ()         => api.get("/schedule");
export const saveSchedule   = (phase, cronExpr, enabled) =>
  api.post("/schedule", { phase, cron: cronExpr, enabled });
