// ============================================================
// PIPELINE ORCHESTRATOR
// Coordinates all 6 agents in sequence or individually
// The "brain" that wires everything together
// ============================================================

const logger = require("./utils/logger").forAgent("Orchestrator");
const dedup = require("./utils/deduplication");
const cliProgress = require("cli-progress");
const chalk = require("chalk");
const fs = require("fs");
const path = require("path");

const ScrapingAgent    = require("./agents/ScrapingAgent");
const EnrichmentAgent  = require("./agents/EnrichmentAgent");
const OutreachAgent    = require("./agents/OutreachAgent");
const LeadScoringAgent = require("./agents/LeadScoringAgent");
const ReportingAgent   = require("./agents/ReportingAgent");

const DATA_DIR = path.join(process.cwd(), "data");

class PipelineOrchestrator {
  constructor() {
    this.scraping    = new ScrapingAgent();
    this.enrichment  = new EnrichmentAgent();
    this.outreach    = new OutreachAgent();
    this.scoring     = new LeadScoringAgent();
    this.reporting   = new ReportingAgent();

    // Shared pipeline state
    this.state = {
      companies : [],
      contacts  : [],
      outreachLog: [],
      responses : [],
      leadScores: [],
    };
  }

  // ──────────────────────────────────────────────────────────
  // FULL PIPELINE
  // ──────────────────────────────────────────────────────────
  async runFull() {
    this._printBanner();
    logger.info("Starting FULL pipeline run");

    // Always clear dedup so the pipeline produces fresh results
    dedup.clear();

    const timer = this._startTimer();

    await this.runScraping();
    await this.runEnrichment();
    await this.runOutreach();
    await this.runScoring();
    await this.runReporting();

    const elapsed = timer();
    logger.info(`Full pipeline completed in ${elapsed}`);
  }

  // ──────────────────────────────────────────────────────────
  // PHASE 2 — SCRAPING
  // ──────────────────────────────────────────────────────────
  async runScraping() {
    // Always clear dedup so scraping always produces companies
    dedup.clear();
    logger.info(chalk.cyan("\n▶ PHASE 2: Company Discovery & Scraping"));

    const bar = this._createProgressBar("Scraping");
    bar.start(100, 0, { status: "Starting scraper..." });

    bar.update(10, { status: "Fetching robotics directories..." });
    const companies = await this.scraping.run();

    bar.update(90, { status: "Deduplicating..." });
    this.state.companies = companies;
    this._saveState("companies", companies);

    bar.update(100, { status: "Done" });
    bar.stop();

    logger.info(`  ✓ ${companies.length} ICP-qualified companies discovered`);
    return companies;
  }

  // ──────────────────────────────────────────────────────────
  // PHASE 3 — ENRICHMENT
  // ──────────────────────────────────────────────────────────
  async runEnrichment() {
    logger.info(chalk.cyan("\n▶ PHASE 3: Decision-Maker Identification & Enrichment"));

    // Load companies from state or disk
    if (this.state.companies.length === 0) {
      this.state.companies = this._loadState("companies") || [];
    }

    if (this.state.companies.length === 0) {
      logger.warn("No companies found. Run scraping phase first.");
      return;
    }

    const bar = this._createProgressBar("Enrichment");
    bar.start(this.state.companies.length, 0, { status: "Starting enrichment..." });

    const { companies, contacts } = await this.enrichment.run(this.state.companies);

    this.state.companies = companies;
    this.state.contacts  = contacts;
    this._saveState("companies", companies);
    this._saveState("contacts",  contacts);

    bar.update(this.state.companies.length, { status: "Done" });
    bar.stop();

    logger.info(`  ✓ ${contacts.length} decision-makers enriched`);
    return contacts;
  }

  // ──────────────────────────────────────────────────────────
  // PHASE 4 — OUTREACH
  // ──────────────────────────────────────────────────────────
  async runOutreach(step = 1, approvedEmailIds = null) {
    logger.info(chalk.cyan(`\n▶ PHASE 4: AI-Personalized Outreach (Step ${step})`));

    // Load contacts from state or disk
    if (this.state.contacts.length === 0) {
      this.state.contacts = this._loadState("contacts") || this.enrichment.loadSavedContacts();
    }

    if (this.state.contacts.length === 0) {
      logger.warn("No contacts found. Run enrichment phase first.");
      return;
    }

    const results = await this.outreach.run(this.state.contacts, step, approvedEmailIds);

    // Persist outreach log
    const log = this.outreach.getOutreachLog();
    this.state.outreachLog = log;
    this._saveState("outreach_log", log);

    logger.info(`  ✓ ${results.sent.length} messages sent`);
    return results;
  }

  // ──────────────────────────────────────────────────────────
  // PHASE 5 — SCORING
  // ──────────────────────────────────────────────────────────
  async runScoring() {
    logger.info(chalk.cyan("\n▶ PHASE 5: Lead Scoring & Prioritization"));

    // Load state
    if (!this.state.contacts.length)    this.state.contacts    = this._loadState("contacts") || [];
    if (!this.state.companies.length)   this.state.companies   = this._loadState("companies") || [];
    if (!this.state.outreachLog.length) this.state.outreachLog = this._loadState("outreach_log") || [];
    if (!this.state.responses.length)   this.state.responses   = this._loadState("responses") || [];

    const scores = await this.scoring.run(
      this.state.contacts,
      this.state.companies,
      this.state.outreachLog,
      this.state.responses
    );

    this.state.leadScores = scores;
    this._saveState("lead_scores", scores);

    const stats = this.scoring.getStats();
    logger.info(`  ✓ ${stats.high} HIGH | ${stats.medium} MEDIUM | ${stats.low} LOW priority`);
    return scores;
  }

  // ──────────────────────────────────────────────────────────
  // PHASE 6 — REPORTING
  // ──────────────────────────────────────────────────────────
  async runReporting() {
    logger.info(chalk.cyan("\n▶ PHASE 6: Google Sheets Reporting"));

    // Hydrate from disk if needed
    if (!this.state.companies.length)   this.state.companies   = this._loadState("companies") || [];
    if (!this.state.contacts.length)    this.state.contacts    = this._loadState("contacts") || [];
    if (!this.state.outreachLog.length) this.state.outreachLog = this._loadState("outreach_log") || [];
    if (!this.state.responses.length)   this.state.responses   = this._loadState("responses") || [];
    if (!this.state.leadScores.length)  this.state.leadScores  = this._loadState("lead_scores") || [];

    await this.reporting.run(this.state);
    logger.info("  ✓ Dashboard synced to Google Sheets");
  }

  // ──────────────────────────────────────────────────────────
  // PROCESS AN INBOUND REPLY (called ad-hoc)
  // ──────────────────────────────────────────────────────────
  async processInboundReply(replyData) {
    logger.info(chalk.cyan("\n▶ Processing inbound reply..."));

    const analysis = await this.outreach.processInboundResponse(replyData);

    // Save response
    const responses = this._loadState("responses") || [];
    responses.push(analysis);
    this._saveState("responses", responses);
    this.state.responses = responses;

    // Update Sheets immediately
    await this.reporting.run({ responses: [analysis] });

    logger.info(`  Intent: ${analysis.intent} | Urgency: ${analysis.urgency}`);
    return analysis;
  }

  // ──────────────────────────────────────────────────────────
  // STATE PERSISTENCE
  // ──────────────────────────────────────────────────────────
  _saveState(key, data) {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(DATA_DIR, `${key}.json`),
        JSON.stringify(data, null, 2)
      );
    } catch (err) {
      logger.warn(`Could not save state [${key}]: ${err.message}`);
    }
  }

  _loadState(key) {
    try {
      const filePath = path.join(DATA_DIR, `${key}.json`);
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
      }
    } catch { /* ignore */ }
    return null;
  }

  // ──────────────────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────────────────
  _createProgressBar(label) {
    return new cliProgress.SingleBar(
      {
        format: `  ${chalk.cyan(label.padEnd(12))} [{bar}] {percentage}% | {status}`,
        barCompleteChar: "█",
        barIncompleteChar: "░",
        hideCursor: true,
        clearOnComplete: false,
      },
      cliProgress.Presets.shades_classic
    );
  }

  _startTimer() {
    const start = Date.now();
    return () => {
      const ms = Date.now() - start;
      if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
      return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
    };
  }

  _printBanner() {
    console.log(chalk.cyan(`
╔══════════════════════════════════════════════════════════╗
║       KELI SENSING — MULTI-AGENT INTELLIGENCE ENGINE     ║
║          Robotics Market Intelligence & Outreach         ║
║                  Powered by Trinity Agents               ║
╚══════════════════════════════════════════════════════════╝
`));
  }

  getFullStats() {
    return {
      scraping   : this.scraping.getStats(),
      enrichment : this.enrichment.getStats(),
      outreach   : this.outreach.getStats(),
      scoring    : this.scoring.getStats(),
    };
  }
}

module.exports = PipelineOrchestrator;
