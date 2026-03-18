// ============================================================
// REPORTING AGENT (Phase 6)
// Syncs all pipeline data to Google Sheets dashboard
// Also generates console summary reports
// ============================================================

const logger = require("../utils/logger").forAgent("ReportingAgent");
const sheets = require("../integrations/GoogleSheetsIntegration");
const { formatRevenue } = require("../utils/helpers");
const fs = require("fs");
const path = require("path");

class ReportingAgent {
  constructor() {
    this.reportData = {};
  }

  /**
   * MAIN ENTRY POINT
   * Syncs everything to Google Sheets and generates summary
   */
  async run({ companies = [], contacts = [], outreachLog = [], responses = [], leadScores = [] }) {
    logger.info(`=== REPORTING AGENT STARTING ===`);

    // Initialize Google Sheets
    await sheets.init();

    const results = {};

    // Sync companies
    if (companies.length > 0) {
      logger.info(`Syncing ${companies.length} companies to Google Sheets...`);
      results.companies = await sheets.appendCompanies(companies);
    }

    // Sync contacts
    if (contacts.length > 0) {
      logger.info(`Syncing ${contacts.length} contacts...`);
      results.contacts = await sheets.appendContacts(contacts);
    }

    // Sync outreach log
    if (outreachLog.length > 0) {
      logger.info(`Syncing ${outreachLog.length} outreach records...`);
      results.outreach = await sheets.logOutreach(outreachLog);
    }

    // Sync responses
    if (responses.length > 0) {
      logger.info(`Syncing ${responses.length} inbound responses...`);
      for (const response of responses) {
        await sheets.logResponse(response);
      }
    }

    // Sync lead scores
    if (leadScores.length > 0) {
      logger.info(`Syncing ${leadScores.length} lead scores...`);
      results.leads = await sheets.updateLeadScores(leadScores);
    }

    // Generate console summary
    this.printSummary({ companies, contacts, outreachLog, responses, leadScores });

    // Save JSON report locally
    this.saveLocalReport({ companies, contacts, outreachLog, responses, leadScores });

    logger.info(`=== REPORTING COMPLETE ===`);
    return results;
  }

  /**
   * Print a formatted summary report to console
   */
  printSummary({ companies, contacts, outreachLog, responses, leadScores }) {
    const divider = "═".repeat(60);
    const line = "─".repeat(60);

    console.log(`\n${divider}`);
    console.log(`   KELI SENSING AGENT — PIPELINE SUMMARY`);
    console.log(`   ${new Date().toLocaleString()}`);
    console.log(divider);

    console.log(`\n📡 DISCOVERY`);
    console.log(line);
    console.log(`  Companies discovered:    ${companies.length}`);
    console.log(`  ICP-qualified:           ${companies.filter((c) => c.icpScore >= 50).length}`);

    const segments = {};
    companies.forEach((c) => {
      const seg = c.primarySegment || "Unknown";
      segments[seg] = (segments[seg] || 0) + 1;
    });
    console.log(`  By segment:`);
    Object.entries(segments)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .forEach(([seg, count]) => console.log(`    • ${seg}: ${count}`));

    console.log(`\n👥 ENRICHMENT`);
    console.log(line);
    console.log(`  Contacts enriched:       ${contacts.length}`);
    console.log(`  With verified email:     ${contacts.filter((c) => c.emailStatus === "verified").length}`);
    console.log(`  With phone:              ${contacts.filter((c) => c.phone).length}`);

    const roles = {};
    contacts.forEach((c) => {
      const role = this._categorizeRole(c.title);
      roles[role] = (roles[role] || 0) + 1;
    });
    console.log(`  By role category:`);
    Object.entries(roles).forEach(([r, n]) => console.log(`    • ${r}: ${n}`));

    console.log(`\n📧 OUTREACH`);
    console.log(line);
    console.log(`  Total sent:              ${outreachLog.filter((o) => o.status === "sent").length}`);
    console.log(`  Email:                   ${outreachLog.filter((o) => o.type === "email" && o.status === "sent").length}`);


    const stepCounts = {};
    outreachLog.forEach((o) => {
      if (o.status === "sent") stepCounts[o.step] = (stepCounts[o.step] || 0) + 1;
    });
    Object.entries(stepCounts).forEach(([step, count]) =>
      console.log(`    • Step ${step}: ${count} sent`)
    );

    console.log(`\n💬 RESPONSES`);
    console.log(line);
    const responseRate = outreachLog.length > 0
      ? ((responses.length / outreachLog.filter((o) => o.status === "sent").length) * 100).toFixed(1)
      : "0";
    console.log(`  Inbound responses:       ${responses.length}`);
    console.log(`  Response rate:           ${responseRate}%`);

    const intentCounts = {};
    responses.forEach((r) => {
      intentCounts[r.intent] = (intentCounts[r.intent] || 0) + 1;
    });
    Object.entries(intentCounts).forEach(([intent, count]) =>
      console.log(`    • ${intent}: ${count}`)
    );

    console.log(`\n🎯 LEAD SCORES`);
    console.log(line);
    const high = leadScores.filter((l) => l.priority === "HIGH");
    const med = leadScores.filter((l) => l.priority === "MEDIUM");
    const low = leadScores.filter((l) => l.priority === "LOW");
    const avg = leadScores.length
      ? Math.round(leadScores.reduce((a, b) => a + b.totalScore, 0) / leadScores.length)
      : 0;

    console.log(`  🔴 HIGH priority:        ${high.length}`);
    console.log(`  🟡 MEDIUM priority:      ${med.length}`);
    console.log(`  🟢 LOW priority:         ${low.length}`);
    console.log(`  Average score:           ${avg}/100`);

    if (high.length > 0) {
      console.log(`\n⭐ TOP 5 HIGH-PRIORITY LEADS`);
      console.log(line);
      high.slice(0, 5).forEach((l, i) => {
        console.log(`  ${i + 1}. ${l.contactName} (${l.title})`);
        console.log(`     @ ${l.companyName} | Score: ${l.totalScore}/100`);
        console.log(`     Revenue: ${l.revenue} | Size: ${l.companySize}`);
      });
    }

    console.log(`\n${divider}\n`);
  }

  /**
   * Save a structured JSON report locally
   */
  saveLocalReport(data) {
    const reportPath = path.join(
      process.cwd(),
      "data",
      `report_${new Date().toISOString().slice(0, 10)}.json`
    );

    try {
      const dir = path.dirname(reportPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const report = {
        generatedAt: new Date().toISOString(),
        summary: {
          companiesDiscovered: data.companies.length,
          contactsEnriched: data.contacts.length,
          emailsSent: data.outreachLog.filter((o) => o.status === "sent").length,
          responsesReceived: data.responses.length,
          highPriorityLeads: data.leadScores.filter((l) => l.priority === "HIGH").length,
        },
        topLeads: data.leadScores.filter((l) => l.priority === "HIGH").slice(0, 10),
        companies: data.companies,
        contacts: data.contacts,
      };

      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      logger.info(`Local report saved: ${reportPath}`);
    } catch (err) {
      logger.warn(`Could not save local report: ${err.message}`);
    }
  }

  _categorizeRole(title = "") {
    const t = title.toLowerCase();
    if (t.includes("cto") || t.includes("chief technology")) return "C-Suite";
    if (t.includes("vp") || t.includes("vice president")) return "VP Level";
    if (t.includes("director")) return "Director";
    if (t.includes("engineer")) return "Engineer";
    if (t.includes("manager")) return "Manager";
    return "Other";
  }
}

module.exports = ReportingAgent;
