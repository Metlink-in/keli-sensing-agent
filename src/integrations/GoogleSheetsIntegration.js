// ============================================================
// GOOGLE SHEETS INTEGRATION
// Central CRM dashboard — companies, contacts, outreach, scores
// Uses Google Service Account for server-to-server auth
// ============================================================

const { google } = require("googleapis");
const logger = require("../utils/logger").forAgent("GoogleSheets");

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

// Sheet names (tabs in the spreadsheet)
const SHEETS = {
  COMPANIES: "Companies",
  CONTACTS: "Contacts",
  OUTREACH: "Outreach Log",
  RESPONSES: "Responses",
  LEADS: "Lead Scores",
  DASHBOARD: "Dashboard",
};

// Prefix used to identify scrape-run history tabs
const SCRAPE_RUN_PREFIX = "Scrape ";


// Column headers per sheet
const HEADERS = {
  [SHEETS.COMPANIES]: [
    "ID", "Name", "Domain", "Website", "Industry", "Sub-Industry",
    "Employees", "Revenue", "Headquarters", "Description", "Technologies",
    "ICP Score", "Primary Segment", "LinkedIn", "Source", "Discovered At",
  ],
  [SHEETS.CONTACTS]: [
    "ID", "Name", "First Name", "Last Name", "Title", "Email", "Email Status",
    "Phone", "LinkedIn", "Company", "Company Domain", "City", "Country",
    "Seniority", "Source", "Enriched At",
  ],
  [SHEETS.OUTREACH]: [
    "Contact ID", "Contact Name", "Company", "Email", "Step", "Type",
    "Subject", "Status", "Sent At", "Message ID",
  ],
  [SHEETS.RESPONSES]: [
    "Contact ID", "Contact Name", "Company", "Email", "Received At",
    "Intent", "Sentiment", "Urgency", "Buying Signals", "Timeline",
    "Budget", "Summary", "Next Action", "Draft Reply Status",
  ],
  [SHEETS.LEADS]: [
    "Company ID", "Company Name", "Contact Name", "Title", "Email",
    "Total Score", "Company Score", "Engagement Score", "Sentiment Score",
    "Priority", "Last Activity", "Notes",
  ],
};

class GoogleSheetsIntegration {
  constructor() {
    this.sheets = null;
    this.spreadsheetId = SPREADSHEET_ID;
    this.initialized = false;
  }

  /**
   * Authenticate and initialize the Sheets API
   */
  async init() {
    if (!SPREADSHEET_ID) {
      logger.warn("GOOGLE_SHEETS_SPREADSHEET_ID not set — reporting disabled");
      this.dryRun = true;
      return;
    }

    try {
      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          private_key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
        },
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      const authClient = await auth.getClient();
      this.sheets = google.sheets({ version: "v4", auth: authClient });
      this.initialized = true;
      logger.info("Google Sheets connected");

      // Ensure all sheets/tabs exist
      await this._ensureSheets();
    } catch (err) {
      logger.error(`Google Sheets init failed: ${err.message}`);
      this.dryRun = true;
    }
  }

  /**
   * Clear a sheet's data rows (everything from row 2 downward, keeping header)
   */
  async clearSheet(sheetName) {
    if (this.dryRun || !this.sheets) {
      logger.info(`[DRY RUN] Would clear "${sheetName}"`);
      return;
    }
    try {
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A2:ZZ`,
      });
      logger.info(`Cleared existing data in "${sheetName}"`);
    } catch (err) {
      logger.warn(`Could not clear "${sheetName}": ${err.message}`);
    }
  }

  /**
   * Sync company records — clears sheet first so no duplicates across runs
   */
  async appendCompanies(companies) {
    await this.clearSheet(SHEETS.COMPANIES);
    const rows = companies.map((c) => [
      c.id, c.name, c.domain, c.website, c.industry, c.subIndustry || "",
      c.employeeCount || "", c.revenueRange || "", c.headquarters || "",
      (c.description || "").slice(0, 500),
      (c.technologies || []).join(", "),
      c.icpScore || "", c.primarySegment || "",
      c.linkedinUrl || "", c.source || "", c.discoveredAt || new Date().toISOString(),
    ]);
    return this._appendRows(SHEETS.COMPANIES, rows);
  }

  /**
   * Sync contact records — clears sheet first so no duplicates across runs
   */
  async appendContacts(contacts) {
    await this.clearSheet(SHEETS.CONTACTS);
    const rows = contacts.map((c) => [
      c.id, c.name, c.firstName || "", c.lastName || "", c.title || "",
      c.email || "", c.emailStatus || "", c.phone || "", c.linkedinUrl || "",
      c.company || "", c.companyDomain || "", c.city || "", c.country || "",
      c.seniorityLevel || "", c.source || "", c.enrichedAt || new Date().toISOString(),
    ]);
    return this._appendRows(SHEETS.CONTACTS, rows);
  }

  /**
   * Sync outreach log — clears sheet first so no duplicates across runs
   */
  async logOutreach(outreachRecords) {
    await this.clearSheet(SHEETS.OUTREACH);
    const rows = outreachRecords.map((o) => [
      o.contactId, o.contactName, o.company, o.email,
      o.step, o.type, o.subject, o.status, o.sentAt, o.messageId || "",
    ]);
    return this._appendRows(SHEETS.OUTREACH, rows);
  }

  /**
   * Log an inbound response (appends — responses are cumulative, don't clear)
   */
  async logResponse(response) {
    const row = [
      response.contactId, response.contactName, response.company, response.email,
      response.receivedAt, response.intent, response.sentiment, response.urgency,
      (response.buyingSignals || []).join(", "),
      response.timeline || "", response.budget || "",
      response.summary, response.nextAction, response.draftReplyStatus || "Pending",
    ];
    return this._appendRows(SHEETS.RESPONSES, [row]);
  }

  // ── Scrape Run History ──────────────────────────────────────

  /**
   * Build the tab name for a pipeline run.
   * Format: "[Prefix] 03/26/26 14:30 · Keli Sensing"
   */
  _pipelineRunTabName(prefix = SCRAPE_RUN_PREFIX, date = new Date()) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      month: "2-digit",
      day: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const mm = parts.find(p => p.type === "month").value;
    const dd = parts.find(p => p.type === "day").value;
    const yy = parts.find(p => p.type === "year").value;
    let hh = parts.find(p => p.type === "hour").value;
    const min = parts.find(p => p.type === "minute").value;
    
    // Intl sometimes returns 24 for midnight instead of 00
    if (hh === "24") hh = "00";
    
    return `${prefix}${mm}/${dd}/${yy} ${hh}:${min} · Keli Sensing`;
  }

  /**
   * Create a new dated scrape-run tab and write companies into it.
   * Returns the tab name.
   */
  async createScrapeRunTab(companies) {
    if (this.dryRun || !this.sheets) {
      logger.info(`[DRY RUN] Would create scrape run tab with ${companies.length} companies`);
      return null;
    }

    const tabName = this._pipelineRunTabName();

    try {
      // Create the new sheet tab
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: tabName } } }],
        },
      });

      // Headers for the run tab (same as Companies)
      const headers = [
        "ID", "Name", "Domain", "Website", "Industry", "Sub-Industry",
        "Employees", "Revenue", "Headquarters", "Description", "Technologies",
        "ICP Score", "Primary Segment", "LinkedIn", "Source", "Discovered At",
      ];

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `'${tabName}'!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      });

      const rows = companies.map((c) => [
        c.id, c.name, c.domain, c.website, c.industry, c.subIndustry || "",
        c.employeeCount || "", c.revenueRange || "", c.headquarters || "",
        (c.description || "").slice(0, 500),
        (c.technologies || []).join(", "),
        c.icpScore || "", c.primarySegment || "",
        c.linkedinUrl || "", c.source || "", c.discoveredAt || new Date().toISOString(),
      ]);

      if (rows.length > 0) {
        await this.sheets.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: `'${tabName}'!A:Z`,
          valueInputOption: "USER_ENTERED",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values: rows },
        });
      }

      logger.info(`Created scrape run tab "${tabName}" with ${rows.length} companies`);
      return tabName;
    } catch (err) {
      logger.error(`Failed to create scrape run tab: ${err.message}`);
      return null;
    }
  }

  /**
   * Create a new dated pipeline-run tab and write data into it.
   */
  async createPipelineRunTab(prefix, headers, rows) {
    if (this.dryRun || !this.sheets) {
      logger.info(`[DRY RUN] Would create ${prefix} run tab with ${rows.length} rows`);
      return null;
    }

    const tabName = this._pipelineRunTabName(prefix);

    try {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: tabName } } }],
        },
      });

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `'${tabName}'!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      });

      if (rows.length > 0) {
        await this.sheets.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: `'${tabName}'!A:Z`,
          valueInputOption: "USER_ENTERED",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values: rows },
        });
      }

      logger.info(`Created run tab "${tabName}" with ${rows.length} rows`);
      return tabName;
    } catch (err) {
      logger.error(`Failed to create ${prefix} run tab: ${err.message}`);
      return null;
    }
  }

  /**
   * List all scrape-run history tabs (sorted newest first).
   * Returns: [{ tabName, date }]
   */
  async listScrapeRuns() {
    if (this.dryRun || !this.sheets) return [];
    try {
      const meta = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });
      const validPrefixes = ["Scrape ", "Enrich ", "Outreach ", "Score ", "Report ", "Response "];
      const runs = meta.data.sheets
        .map((s) => s.properties.title)
        .filter((t) => validPrefixes.some(prefix => t.startsWith(prefix)) && t !== "Outreach Log" && t !== "Responses" && t !== "Report ")
        .reverse(); // newest last in Sheets = first here after reverse
      return runs.map((tabName) => ({ tabName }));
    } catch (err) {
      logger.error(`Failed to list scrape runs: ${err.message}`);
      return [];
    }
  }

  /**
   * Fetch data from a specific scrape-run tab.
   * Returns { headers, rows }
   */
  async getScrapeRunData(tabName) {
    if (this.dryRun || !this.sheets) return { headers: [], rows: [] };
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `'${tabName}'!A:Z`,
      });
      const all = response.data.values || [];
      const [headers, ...rows] = all;
      return { headers: headers || [], rows: rows || [] };
    } catch (err) {
      logger.error(`Failed to get scrape run data for "${tabName}": ${err.message}`);
      return { headers: [], rows: [] };
    }
  }

  // ── Lead Scores ─────────────────────────────────────────────

  /**
   * Sync lead scores — clears sheet first so 1 row per company, no duplicates
   */
  async updateLeadScores(leadScores) {
    await this.clearSheet(SHEETS.LEADS);
    const rows = leadScores.map((l) => [
      l.companyId, l.companyName, l.contactName, l.title, l.email,
      l.totalScore, l.companyScore, l.engagementScore, l.sentimentScore,
      l.priority, l.lastActivity, l.notes || "",
    ]);
    return this._appendRows(SHEETS.LEADS, rows);
  }

  /**
   * Low-level: append rows to a named sheet
   */
  async _appendRows(sheetName, rows) {
    if (this.dryRun || !this.sheets) {
      logger.info(`[DRY RUN] Would append ${rows.length} rows to "${sheetName}"`);
      return { updated: rows.length, dryRun: true };
    }

    try {
      const result = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:Z`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: rows },
      });

      const updated = result.data.updates?.updatedRows || rows.length;
      logger.info(`Appended ${updated} rows to "${sheetName}"`);
      return { updated, dryRun: false };
    } catch (err) {
      logger.error(`Failed to append to "${sheetName}": ${err.message}`);
      throw err;
    }
  }

  /**
   * Ensure all required sheet tabs exist (create if missing)
   */
  async _ensureSheets() {
    if (!this.sheets) return;

    try {
      const meta = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      const existingSheets = meta.data.sheets.map((s) => s.properties.title);
      const requests = [];

      for (const [, sheetName] of Object.entries(SHEETS)) {
        if (!existingSheets.includes(sheetName)) {
          requests.push({ addSheet: { properties: { title: sheetName } } });
          logger.info(`Will create sheet tab: "${sheetName}"`);
        }
      }

      if (requests.length > 0) {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: { requests },
        });
      }

      // Write headers to new sheets
      await this._writeHeaders();
    } catch (err) {
      logger.warn(`Could not verify sheet structure: ${err.message}`);
    }
  }

  /**
   * Write column headers to each sheet
   */
  async _writeHeaders() {
    for (const [sheetName, headers] of Object.entries(HEADERS)) {
      try {
        // Check if header already exists
        const check = await this.sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!A1:A1`,
        });

        if (!check.data.values || check.data.values[0]?.[0] !== headers[0]) {
          await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `${sheetName}!A1`,
            valueInputOption: "RAW",
            requestBody: { values: [headers] },
          });
          logger.info(`Headers written to "${sheetName}"`);
        }
      } catch { /* Skip if sheet doesn't exist yet */ }
    }
  }
}

module.exports = new GoogleSheetsIntegration();
