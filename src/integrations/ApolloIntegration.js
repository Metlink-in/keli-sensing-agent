// ============================================================
// APOLLO.IO INTEGRATION
// Enriches company and contact data via Apollo API
// Docs: https://apolloio.github.io/apollo-api-docs/
// ============================================================

const axios = require("axios");
const logger = require("../utils/logger").forAgent("Apollo");
const { retry, sleepWithJitter } = require("../utils/helpers");

const BASE_URL = "https://api.apollo.io/v1";

class ApolloIntegration {
  constructor() {
    this.apiKey = process.env.APOLLO_API_KEY;
    this.client = axios.create({
      baseURL: BASE_URL,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      timeout: 15000,
    });
  }

  _headers() {
    return { "X-Api-Key": this.apiKey };
  }

  /**
   * Search for people matching role criteria at a company
   * @param {string} companyDomain - e.g. "boston-dynamics.com"
   * @param {string[]} titles - e.g. ["CTO", "VP Engineering"]
   * @returns {Array} contacts
   */
  async searchPeople(companyDomain, titles = []) {
    if (!this.apiKey) {
      logger.warn("Apollo API key not set — returning mock data");
      return this._mockContacts(companyDomain);
    }

    try {
      const response = await this.client.post(
        "/mixed_people/search",
        {
          api_key: this.apiKey,
          q_organization_domains: companyDomain,
          person_titles: titles,
          page: 1,
          per_page: 10,
        },
        { headers: this._headers() }
      );

      const people = response.data?.people || [];
      logger.info(`Apollo found ${people.length} people at ${companyDomain}`);
      return people.map((p) => this._mapPerson(p));
    } catch (err) {
      logger.warn(`Apollo API failed for ${companyDomain}: ${err.message} — using mock data`);
      return this._mockContacts(companyDomain);
    }
  }

  /**
   * Enrich a single person by email
   */
  async enrichPerson(email) {
    if (!this.apiKey) return null;

    return retry(async () => {
      await sleepWithJitter(500);
      const response = await this.client.post("/people/match", {
        api_key: this.apiKey,
        email,
        reveal_personal_emails: false,
        reveal_phone_number: true,
      });

      const person = response.data?.person;
      if (!person) return null;

      return this._mapPerson(person);
    }, 2, 1500);
  }

  /**
   * Enrich a company by domain
   */
  async enrichCompany(domain) {
    if (!this.apiKey) return this._mockCompany(domain);

    try {
      await sleepWithJitter(500);
      const response = await this.client.post("/organizations/enrich", {
        api_key: this.apiKey,
        domain,
      }, { headers: this._headers() });

      const org = response.data?.organization;
      if (!org) return this._mockCompany(domain);

      return {
        name: org.name,
        domain: org.primary_domain,
        website: `https://${org.primary_domain}`,
        industry: org.industry,
        subIndustry: org.sub_industry,
        employeeCount: org.estimated_num_employees,
        revenueRange: org.annual_revenue_printed,
        revenue: org.annual_revenue,
        founded: org.founded_year,
        description: org.short_description,
        headquarters: `${org.city || ""}, ${org.country || ""}`.trim(),
        linkedinUrl: org.linkedin_url,
        technologies: org.technologies || [],
        keywords: org.keywords || [],
        funding: org.total_funding_printed,
        source: "apollo",
      };
    } catch (err) {
      logger.warn(`Apollo enrich failed for ${domain}: ${err.message} — using mock data`);
      return this._mockCompany(domain);
    }
  }

  /**
   * Map raw Apollo person to our schema
   */
  _mapPerson(p) {
    return {
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
      title: p.title,
      email: p.email,
      emailStatus: p.email_status,
      phone: p.phone_numbers?.[0]?.raw_number,
      linkedinUrl: p.linkedin_url,
      company: p.organization?.name,
      companyDomain: p.organization?.primary_domain,
      city: p.city,
      country: p.country,
      seniorityLevel: p.seniority,
      source: "apollo",
      enrichedAt: new Date().toISOString(),
    };
  }

  // ---- Mock data for development/testing without API key ----
  _mockContacts(domain) {
    const company = domain.split(".")[0];
    return [
      {
        name: "Sarah Mitchell",
        firstName: "Sarah",
        lastName: "Mitchell",
        title: "CTO",
        email: `s.mitchell@${domain}`,
        emailStatus: "verified",
        company: company,
        companyDomain: domain,
        linkedinUrl: `https://linkedin.com/in/sarah-mitchell-${company}`,
        source: "apollo_mock",
        enrichedAt: new Date().toISOString(),
      },
      {
        name: "David Park",
        firstName: "David",
        lastName: "Park",
        title: "VP of Engineering",
        email: `d.park@${domain}`,
        emailStatus: "likely",
        company: company,
        companyDomain: domain,
        linkedinUrl: `https://linkedin.com/in/david-park-${company}`,
        source: "apollo_mock",
        enrichedAt: new Date().toISOString(),
      },
    ];
  }

  _mockCompany(domain) {
    return {
      name: domain.split(".")[0],
      domain,
      website: `https://${domain}`,
      industry: "Robotics",
      employeeCount: 250,
      revenueRange: "$10M-$50M",
      description: "A robotics company focused on automation solutions.",
      headquarters: "San Francisco, US",
      source: "apollo_mock",
    };
  }
}

module.exports = new ApolloIntegration();
