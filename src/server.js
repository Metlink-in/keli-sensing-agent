require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const logger = require("./utils/logger");
const validateCredentials = require("./utils/validateEnv");
const PipelineOrchestrator = require("./orchestrator");
const dedup = require("./utils/deduplication");

// ---- Scheduler state ----
const SCHEDULES_FILE = path.join(__dirname, "../data/schedules.json");
const activeCronJobs = {};

function loadSchedules() {
  try {
    if (fs.existsSync(SCHEDULES_FILE)) {
      return JSON.parse(fs.readFileSync(SCHEDULES_FILE, "utf8"));
    }
  } catch {}
  return {};
}

function saveSchedules(schedules) {
  fs.mkdirSync(path.dirname(SCHEDULES_FILE), { recursive: true });
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2));
}

function getNextRun(cronExpr) {
  try {
    // Simple: node-cron does not expose next-run natively, we return the expr
    return cronExpr;
  } catch {
    return null;
  }
}

function registerCronJob(phase, cronExpr, schedules, pipelineRef) {
  if (activeCronJobs[phase]) {
    activeCronJobs[phase].stop();
    delete activeCronJobs[phase];
  }
  if (!cronExpr || schedules[phase]?.enabled === false) return;
  if (!cron.validate(cronExpr)) return;
  activeCronJobs[phase] = cron.schedule(cronExpr, async () => {
    logger.info(`[Scheduler] Running scheduled phase: ${phase}`);
    try {
      if (phase === "all") await pipelineRef.runFull();
      else if (phase === "scrape") await pipelineRef.runScraping();
      else if (phase === "enrich") await pipelineRef.runEnrichment();
      else if (phase === "outreach") await pipelineRef.runOutreach(1);
      else if (phase === "score") await pipelineRef.runScoring();
      else if (phase === "report") await pipelineRef.runReporting();
    } catch (err) {
      logger.error(`[Scheduler] Phase ${phase} failed: ${err.message}`);
    }
  });
  logger.info(`[Scheduler] Registered cron for '${phase}': ${cronExpr}`);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Orchestrator and validate credentials on startup
validateCredentials();
const pipeline = new PipelineOrchestrator();

// ------------------------------------------------------------
// API ROUTES
// Note: Some of these phases can take a long time to complete.
// In a true production app, these should trigger background jobs 
// rather than holding the HTTP request open.
// ------------------------------------------------------------

/**
 * Health Check & Stats
 */
app.get("/api/stats", (req, res) => {
  try {
    const stats = pipeline.getFullStats();
    res.json({ status: "running", stats });
  } catch (err) {
    logger.error(`Error getting stats: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Reset State
 */
app.post("/api/reset", (req, res) => {
  try {
    dedup.clear();
    res.json({ success: true, message: "Deduplication memory completely cleared." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Phase 2+: Run the Entire Pipeline
 */
app.post("/api/pipeline/all", async (req, res) => {
  logger.info("API Request: Run Full Pipeline");
  // We don't await because it takes 20-40 minutes.
  // We return immediately to prevent HTTP timeout.
  pipeline.runFull().catch(err => {
    logger.error(`Full pipeline failed: ${err.message}`);
  });
  res.status(202).json({ 
    message: "Full pipeline initiated. Check logs and /api/stats to monitor progress.",
  });
});

/**
 * Phase 2: Scraping
 * Accepts optional body: { limit, icpConfig, cadence }
 */
app.post("/api/pipeline/scrape", async (req, res) => {
  logger.info("API Request: Scraping Phase");
  try {
    const companies = await pipeline.runScraping(req.body);
    // Auto-create a dated scrape-run tab in Google Sheets
    let runTabName = null;
    try {
      const sheets = require("./integrations/GoogleSheetsIntegration");
      if (!sheets.initialized) await sheets.init();
      runTabName = await sheets.createScrapeRunTab(companies || []);
    } catch (sheetErr) {
      logger.warn(`Could not create scrape run tab: ${sheetErr.message}`);
    }
    res.json({ 
      success: true, 
      message: "Scraping completed", 
      companiesDiscovered: (companies || []).length,
      runTabName,
    });
  } catch (err) {
    logger.error(`Scraping failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Phase 3: Enrichment
 */
app.post("/api/pipeline/enrich", async (req, res) => {
  logger.info("API Request: Enrichment Phase");
  try {
    const contacts = await pipeline.runEnrichment();
    if (!contacts) {
      return res.status(400).json({ error: "No companies available. Run scrape first." });
    }
    res.json({ 
      success: true, 
      message: "Enrichment completed", 
      contactsEnriched: contacts.length 
    });
  } catch (err) {
    logger.error(`Enrichment failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Phase 4: Outreach Preview
 * Generates 3 sample emails without sending them.
 * Body: { targetList, roles }
 */
app.post("/api/pipeline/outreach/preview", async (req, res) => {
  logger.info("API Request: Outreach Preview");
  try {
    // Pull a few contacts from the Contacts sheet to preview
    const sheets = require("./integrations/GoogleSheetsIntegration");
    if (!sheets.initialized) await sheets.init();
    const contactData = await sheets.getScrapeRunData("Contacts").catch(() => ({ headers: [], rows: [] }));

    // Try to get real contact rows, otherwise use placeholders
    const sampleContacts = (contactData.rows || []).slice(0, 3);
    const icpPath = path.join(__dirname, "config/icp.config.js");
    delete require.cache[require.resolve(icpPath)];
    const icp = require(icpPath);

    const companyName = icp?.valueProposition?.company || "your company";
    const tagline = icp?.valueProposition?.tagline || "helping businesses grow";
    const senderName = "The Keli Sensing Team";
    const signatureHtml = `<br><br>Best regards,<br><b>${senderName}</b><br>${companyName}<br><a href="${icp?.valueProposition?.website || '#'}">${icp?.valueProposition?.website || ''}</a>`;

    const previews = sampleContacts.length > 0
      ? sampleContacts.map((row, i) => ({
          id: `preview_${i}`,
          to: row[5] || `contact${i + 1}@example.com`,
          toName: row[1] || `Contact ${i + 1}`,
          company: row[9] || "Their Company",
          subject: `${companyName} — Quick Question for ${row[1] || 'You'}`,
          body: `Hi ${row[2] || row[1] || 'there'},\n\nI came across ${row[9] || 'your company'} and was impressed by your work. At ${companyName}, we specialize in ${tagline}.\n\nI'd love to explore whether there's a fit — would you be open to a quick 15-minute call this week?\n\nLooking forward to hearing from you.`,
          signature: signatureHtml,
          approved: null,
        }))
      : [0, 1, 2].map((i) => ({
          id: `preview_${i}`,
          to: `lead${i + 1}@example.com`,
          toName: `Lead ${i + 1}`,
          company: `Example Corp ${i + 1}`,
          subject: `${companyName} — Reaching Out`,
          body: `Hi Lead ${i + 1},\n\nI came across Example Corp ${i + 1} and thought there could be a great fit with ${companyName}.\n\nWe specialize in ${tagline}, and I'd love to share more.\n\nWould you be open to a quick call?`,
          signature: signatureHtml,
          approved: null,
        }));

    res.json({ success: true, previews });
  } catch (err) {
    logger.error(`Outreach preview failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Phase 4: Outreach
 * Specify step in body, e.g. { "step": 1 }
 */
app.post("/api/pipeline/outreach", async (req, res) => {
  const step = parseInt(req.body.step || 1);
  logger.info(`API Request: Outreach Phase (Step ${step})`);
  try {
    const results = await pipeline.runOutreach(step);
    if (!results) {
      return res.status(400).json({ error: "No contacts available. Run enrich first." });
    }
    res.json({
      success: true,
      message: `Outreach Step ${step} completed`,
      results
    });
  } catch (err) {
    logger.error(`Outreach failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Phase 5: Lead Scoring
 */
app.post("/api/pipeline/score", async (req, res) => {
  logger.info("API Request: Lead Scoring Phase");
  try {
    const scores = await pipeline.runScoring();
    res.json({ 
      success: true, 
      message: "Scoring completed",
      highPriority: scores.filter(s => s.priority === "HIGH").length,
      mediumPriority: scores.filter(s => s.priority === "MEDIUM").length,
      lowPriority: scores.filter(s => s.priority === "LOW").length
    });
  } catch (err) {
    logger.error(`Scoring failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Phase 6: Reporting (Sync to Google Sheets)
 */
app.post("/api/pipeline/report", async (req, res) => {
  logger.info("API Request: Reporting Phase");
  try {
    await pipeline.runReporting();
    res.json({ success: true, message: "Dashboard synced to Google Sheets" });
  } catch (err) {
    logger.error(`Reporting failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Process Inbound Reply Webhook
 */
app.post("/api/pipeline/reply", async (req, res) => {
  logger.info("API Request: Process Inbound Reply");
  const replyData = req.body;
  if (!replyData || !replyData.from || !replyData.body) {
    return res.status(400).json({ error: "Invalid reply data. Must include 'from' and 'body' fields." });
  }

  try {
    const analysis = await pipeline.processInboundReply(replyData);
    res.json({
      success: true,
      message: "Reply processed",
      analysis
    });
  } catch (err) {
    logger.error(`Reply processing failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});


// Start Server
// Load & register saved schedules on startup
const savedSchedules = loadSchedules();
for (const [phase, cfg] of Object.entries(savedSchedules)) {
  if (cfg.enabled && cfg.cron) {
    registerCronJob(phase, cfg.cron, savedSchedules, pipeline);
  }
}

/**
 * GET /api/icp — Get current ICP configuration
 */
app.get("/api/icp", (req, res) => {
  try {
    const icpPath = path.join(__dirname, "config/icp.config.js");
    delete require.cache[require.resolve(icpPath)];
    const icp = require(icpPath);
    res.json(icp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/icp — Update ICP configuration
 */
app.post("/api/icp", (req, res) => {
  try {
    const icpPath = path.join(__dirname, "config/icp.config.js");
    fs.writeFileSync(icpPath, `module.exports = ${JSON.stringify(req.body, null, 2)};\n`);
    delete require.cache[require.resolve(icpPath)];
    res.json({ success: true, message: "ICP configuration updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/env — Get environment variables (safely exposing to dashboard admin)
 */
app.get("/api/env", (req, res) => {
  try {
    const envPath = path.join(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return res.json({});
    const envContent = fs.readFileSync(envPath, "utf-8");
    const parsed = require("dotenv").parse(envContent);
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/env — Update environment variables
 */
app.post("/api/env", (req, res) => {
  try {
    const envPath = path.join(process.cwd(), ".env");
    let content = "";
    for (const [key, value] of Object.entries(req.body)) {
      if (value.includes("\\n")) {
        content += `${key}="${value}"\n`;
      } else {
        content += `${key}=${value}\n`;
      }
    }
    fs.writeFileSync(envPath, content);
    require("dotenv").config({ override: true }); // Reload into process.env
    res.json({ success: true, message: "Credentials updated. Some changes may require a server restart." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/logs — Return last N lines of the most recent log file
 */
app.get("/api/logs", (req, res) => {
  try {
    const logsDir = path.join(__dirname, "../logs");
    if (!fs.existsSync(logsDir)) return res.json({ lines: [] });

    const files = fs.readdirSync(logsDir)
      .filter(f => f.endsWith(".log"))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(logsDir, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) return res.json({ lines: [] });

    const latestLog = path.join(logsDir, files[0].name);
    const content = fs.readFileSync(latestLog, "utf8");
    const lines = content.trim().split("\n").slice(-200);
    res.json({ lines, file: files[0].name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/sheets/row — Delete a specific row from a sheet tab
 * Body: { sheet: "Companies", rowIndex: 2 }  (rowIndex is 1-based, excluding header)
 */
app.delete("/api/sheets/row", async (req, res) => {
  try {
    const { sheet, rowIndex } = req.body;
    if (!sheet || rowIndex === undefined) {
      return res.status(400).json({ error: "Missing 'sheet' or 'rowIndex'" });
    }

    const sheets = require("./integrations/GoogleSheetsIntegration");
    if (!sheets.initialized) await sheets.init();
    if (sheets.dryRun || !sheets.sheets) {
      return res.status(503).json({ error: "Google Sheets not configured" });
    }

    // Get the sheet's internal sheetId
    const meta = await sheets.sheets.spreadsheets.get({ spreadsheetId: sheets.spreadsheetId });
    const sheetMeta = meta.data.sheets.find(s => s.properties.title === sheet);
    if (!sheetMeta) return res.status(404).json({ error: `Sheet "${sheet}" not found` });

    const sheetId = sheetMeta.properties.sheetId;
    // rowIndex from frontend is 0-based among data rows; in Sheets API row 0 = header, row 1 = first data row
    const startRowIndex = rowIndex + 1; // +1 to skip header

    await sheets.sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheets.spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: startRowIndex,
              endIndex: startRowIndex + 1,
            },
          },
        }],
      },
    });

    logger.info(`Deleted row ${rowIndex} from sheet "${sheet}"`);
    res.json({ success: true });
  } catch (err) {
    logger.error(`Delete row failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/sheets/clear — Clear all data rows from a sheet tab (keeps header)
 * Body: { sheet: "Companies" }
 */
app.delete("/api/sheets/clear", async (req, res) => {
  try {
    const { sheet } = req.body;
    if (!sheet) return res.status(400).json({ error: "Missing 'sheet'" });

    const sheets = require("./integrations/GoogleSheetsIntegration");
    if (!sheets.initialized) await sheets.init();
    if (sheets.dryRun || !sheets.sheets) {
      return res.status(503).json({ error: "Google Sheets not configured" });
    }

    // Get row count first
    const response = await sheets.sheets.spreadsheets.values.get({
      spreadsheetId: sheets.spreadsheetId,
      range: `${sheet}!A:A`,
    });
    const totalRows = (response.data.values || []).length;
    if (totalRows <= 1) return res.json({ success: true, message: "Sheet already empty" });

    // Get sheetId
    const meta = await sheets.sheets.spreadsheets.get({ spreadsheetId: sheets.spreadsheetId });
    const sheetMeta = meta.data.sheets.find(s => s.properties.title === sheet);
    if (!sheetMeta) return res.status(404).json({ error: `Sheet "${sheet}" not found` });

    const sheetId = sheetMeta.properties.sheetId;

    await sheets.sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheets.spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: 1,        // keep row 0 (header)
              endIndex: totalRows,
            },
          },
        }],
      },
    });

    logger.info(`Cleared all data from sheet "${sheet}" (${totalRows - 1} rows deleted)`);
    res.json({ success: true, deleted: totalRows - 1 });
  } catch (err) {
    logger.error(`Clear sheet failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/sheets/runs — List all scrape run history tabs
 */
app.get("/api/sheets/runs", async (req, res) => {
  try {
    const sheets = require("./integrations/GoogleSheetsIntegration");
    if (!sheets.initialized) await sheets.init();
    if (sheets.dryRun || !sheets.sheets) {
      return res.status(503).json({ error: "Google Sheets not configured" });
    }
    const runs = await sheets.listScrapeRuns();
    res.json({ runs });
  } catch (err) {
    logger.error(`List scrape runs failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/sheets/runs/:tabName — Get data for a specific scrape run tab
 */
app.get("/api/sheets/runs/:tabName", async (req, res) => {
  try {
    const sheets = require("./integrations/GoogleSheetsIntegration");
    if (!sheets.initialized) await sheets.init();
    if (sheets.dryRun || !sheets.sheets) {
      return res.status(503).json({ error: "Google Sheets not configured" });
    }
    const data = await sheets.getScrapeRunData(req.params.tabName);
    res.json(data);
  } catch (err) {
    logger.error(`Get scrape run data failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/sheets/data — Fetch all sheet tabs and return as JSON
 */
app.get("/api/sheets/data", async (req, res) => {
  try {
    const sheets = require("./integrations/GoogleSheetsIntegration");
    if (!sheets.initialized) {
      await sheets.init();
    }
    if (sheets.dryRun || !sheets.sheets) {
      return res.status(503).json({ error: "Google Sheets not configured" });
    }

    const tabNames = ["Companies", "Contacts", "Outreach Log", "Responses", "Lead Scores"];
    const result = {};

    for (const tab of tabNames) {
      try {
        const response = await sheets.sheets.spreadsheets.values.get({
          spreadsheetId: sheets.spreadsheetId,
          range: `${tab}!A:Z`,
        });
        const rows = response.data.values || [];
        const [headers, ...data] = rows;
        result[tab] = { headers: headers || [], rows: data || [] };
      } catch {
        result[tab] = { headers: [], rows: [] };
      }
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/schedule — Get current schedule config
 */
app.get("/api/schedule", (req, res) => {
  try {
    const schedules = loadSchedules();
    const phases = ["all", "scrape", "enrich", "outreach", "score", "report"];
    const result = {};
    for (const phase of phases) {
      result[phase] = schedules[phase] || { cron: "", enabled: false };
      result[phase].active = !!activeCronJobs[phase];
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/schedule — Save and register a cron schedule
 * Body: { phase: "scrape", cron: "0 9 * * *", enabled: true }
 */
app.post("/api/schedule", (req, res) => {
  try {
    const { phase, cron: cronExpr, enabled } = req.body;
    const validPhases = ["all", "scrape", "enrich", "outreach", "score", "report"];
    if (!validPhases.includes(phase)) {
      return res.status(400).json({ error: "Invalid phase name" });
    }
    if (cronExpr && !cron.validate(cronExpr)) {
      return res.status(400).json({ error: "Invalid cron expression" });
    }

    const schedules = loadSchedules();
    schedules[phase] = { cron: cronExpr || "", enabled: !!enabled };
    saveSchedules(schedules);
    registerCronJob(phase, cronExpr, schedules, pipeline);

    logger.info(`[Scheduler] Schedule updated for '${phase}': ${cronExpr}, enabled: ${enabled}`);
    res.json({ success: true, phase, cron: cronExpr, enabled: !!enabled, active: !!activeCronJobs[phase] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export for Vercel / serverless environments
module.exports = app;

// Only listen if not in a serverless environment or if explicitly running as a standalone server
if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  const server = app.listen(PORT, "0.0.0.0", () => {
    logger.info(`\n🚀 Keli Sensing API Server running on port ${PORT}`);
    logger.info(`Dashboard API ready at http://0.0.0.0:${PORT}`);
  });
  
  // Increase timeout for long-running pipeline phases (10 minutes)
  server.timeout = 600000;
}
