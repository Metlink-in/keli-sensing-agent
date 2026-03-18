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
   * Append company records to Companies sheet
   */
  async appendCompanies(companies) {
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
   * Append contact records to Contacts sheet
   */
  async appendContacts(contacts) {
    const rows = contacts.map((c) => [
      c.id, c.name, c.firstName || "", c.lastName || "", c.title || "",
      c.email || "", c.emailStatus || "", c.phone || "", c.linkedinUrl || "",
      c.company || "", c.companyDomain || "", c.city || "", c.country || "",
      c.seniorityLevel || "", c.source || "", c.enrichedAt || new Date().toISOString(),
    ]);

    return this._appendRows(SHEETS.CONTACTS, rows);
  }

  /**
   * Log outreach activity
   */
  async logOutreach(outreachRecords) {
    const rows = outreachRecords.map((o) => [
      o.contactId, o.contactName, o.company, o.email,
      o.step, o.type, o.subject, o.status, o.sentAt, o.messageId || "",
    ]);

    return this._appendRows(SHEETS.OUTREACH, rows);
  }

  /**
   * Log an inbound response
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

  /**
   * Update lead scores
   */
  async updateLeadScores(leadScores) {
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
