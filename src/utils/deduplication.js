// ============================================================
// DEDUPLICATION - Prevents duplicate companies/contacts
// Uses in-memory + file-backed seen sets
// ============================================================

const fs = require("fs");
const path = require("path");
const logger = require("./logger").forAgent("Dedup");

const DATA_DIR = path.join(process.cwd(), "data");
const SEEN_COMPANIES_FILE = path.join(DATA_DIR, "seen_companies.json");
const SEEN_CONTACTS_FILE = path.join(DATA_DIR, "seen_contacts.json");

class DeduplicationStore {
  constructor() {
    this.seenCompanies = new Set();
    this.seenContacts = new Set();
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(SEEN_COMPANIES_FILE)) {
        const data = JSON.parse(fs.readFileSync(SEEN_COMPANIES_FILE, "utf-8"));
        this.seenCompanies = new Set(data);
        logger.info(`Loaded ${this.seenCompanies.size} seen companies`);
      }
      if (fs.existsSync(SEEN_CONTACTS_FILE)) {
        const data = JSON.parse(fs.readFileSync(SEEN_CONTACTS_FILE, "utf-8"));
        this.seenContacts = new Set(data);
        logger.info(`Loaded ${this.seenContacts.size} seen contacts`);
      }
    } catch (err) {
      logger.warn(`Could not load dedup store: ${err.message}`);
    }
  }

  _save() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(SEEN_COMPANIES_FILE, JSON.stringify([...this.seenCompanies]));
      fs.writeFileSync(SEEN_CONTACTS_FILE, JSON.stringify([...this.seenContacts]));
    } catch (err) {
      logger.warn(`Could not save dedup store: ${err.message}`);
    }
  }

  /**
   * Normalize company name to a dedup key
   */
  _normalizeCompany(name, domain) {
    const namePart = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const domainPart = domain ? domain.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
    return domainPart || namePart;
  }

  /**
   * Normalize contact to a dedup key
   */
  _normalizeContact(email, name, company) {
    if (email) return email.toLowerCase().trim();
    const n = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const c = company.toLowerCase().replace(/[^a-z0-9]/g, "");
    return `${n}@${c}`;
  }

  /**
   * Check if company is a duplicate
   */
  isCompanyDuplicate(name, domain) {
    const key = this._normalizeCompany(name, domain);
    return this.seenCompanies.has(key);
  }

  /**
   * Mark a company as seen
   */
  markCompanySeen(name, domain) {
    const key = this._normalizeCompany(name, domain);
    this.seenCompanies.add(key);
    this._save();
  }

  /**
   * Check if contact is a duplicate
   */
  isContactDuplicate(email, name, company) {
    const key = this._normalizeContact(email, name, company);
    return this.seenContacts.has(key);
  }

  /**
   * Mark contact as seen
   */
  markContactSeen(email, name, company) {
    const key = this._normalizeContact(email, name, company);
    this.seenContacts.add(key);
    this._save();
  }

  /**
   * Deduplicate an array of companies
   */
  deduplicateCompanies(companies) {
    const unique = [];
    for (const c of companies) {
      if (!this.isCompanyDuplicate(c.name, c.domain || c.website)) {
        unique.push(c);
        this.markCompanySeen(c.name, c.domain || c.website);
      }
    }
    logger.info(`Dedup: ${companies.length} → ${unique.length} unique companies`);
    return unique;
  }

  /**
   * Deduplicate an array of contacts
   */
  deduplicateContacts(contacts) {
    const unique = [];
    for (const c of contacts) {
      if (!this.isContactDuplicate(c.email, c.name, c.company)) {
        unique.push(c);
        this.markContactSeen(c.email, c.name, c.company);
      }
    }
    logger.info(`Dedup: ${contacts.length} → ${unique.length} unique contacts`);
    return unique;
  }

  getStats() {
    return {
      totalSeenCompanies: this.seenCompanies.size,
      totalSeenContacts: this.seenContacts.size,
    };
  }

  clear() {
    this.seenCompanies.clear();
    this.seenContacts.clear();
    try {
      if (fs.existsSync(SEEN_COMPANIES_FILE)) fs.unlinkSync(SEEN_COMPANIES_FILE);
      if (fs.existsSync(SEEN_CONTACTS_FILE)) fs.unlinkSync(SEEN_CONTACTS_FILE);
      logger.info("Deduplication state cleared.");
    } catch (err) {
      logger.warn("Error clearing dedup state: " + err.message);
    }
  }
}

// Singleton instance
module.exports = new DeduplicationStore();
