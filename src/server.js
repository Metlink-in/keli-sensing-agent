require("dotenv").config();

const express = require("express");
const cors = require("cors");
const logger = require("./utils/logger");
const validateCredentials = require("./utils/validateEnv");
const PipelineOrchestrator = require("./orchestrator");
const dedup = require("./utils/deduplication");

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
 */
app.post("/api/pipeline/scrape", async (req, res) => {
  logger.info("API Request: Scraping Phase");
  try {
    const companies = await pipeline.runScraping();
    res.json({ 
      success: true, 
      message: "Scraping completed", 
      companiesDiscovered: companies.length 
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
app.listen(PORT, () => {
  logger.info(`\n🚀 Keli Sensing API Server running on port ${PORT}`);
  logger.info(`Send POST requests to http://localhost:${PORT}/api/pipeline/all to run the agent`);
});
