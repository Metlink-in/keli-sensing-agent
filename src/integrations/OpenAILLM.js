// ============================================================
// OPENAI LLM INTEGRATION
// Powers personalized message generation and response analysis
// ============================================================

const OpenAI = require("openai");
const logger = require("../utils/logger").forAgent("OpenAILLM");
const { retry } = require("../utils/helpers");

class OpenAILLM {
  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy-key-for-dry-run" });
    this.model = process.env.OPENAI_MODEL || "gpt-4o";
    this.defaultMaxTokens = 1024;
  }

  /**
   * Core completion method
   */
  async complete(systemPrompt, userMessage, maxTokens = 1024) {
    return retry(async () => {
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ]
      });

      return response.choices[0]?.message?.content || "";
    }, 3, 2000);
  }

  /**
   * Generate a personalized outreach email
   */
  async generateOutreachEmail(template, variables) {
    const prompt = this._fillTemplate(template, variables);

    logger.info(`Generating outreach email for ${variables.contact_name} at ${variables.company_name}`);

    const systemPrompt = `You are an expert B2B sales copywriter for Keli Sensing, a robotics sensor company.
Your job is to write highly personalized, concise, and effective outreach emails.
Always write in a natural, human tone. Never use buzzwords like "synergy", "leverage", "paradigm".
Your emails get replies because they feel personal and relevant, not like spam.`;

    const result = await this.complete(systemPrompt, prompt, 800);

    // Extract subject and body
    const subjectMatch = result.match(/SUBJECT:\s*(.+)/i);
    const subject = subjectMatch ? subjectMatch[1].trim() : `${variables.company_name} x Keli Sensing`;
    const body = result.replace(/SUBJECT:\s*.+/i, "").trim();

    return { subject, body };
  }

  /**
   * Analyze an inbound reply and extract intent/signals
   */
  async analyzeResponse(emailContent, contactName, companyName) {
    logger.info(`Analyzing response from ${contactName} at ${companyName}`);

    const systemPrompt = `You are a sales intelligence analyst. Analyze inbound email responses 
and extract structured data about intent, buying signals, and recommended next actions.
Always respond with valid JSON only. No markdown fences, no extra text.`;

    const userMessage = `Analyze this email response:

From: ${contactName} at ${companyName}
Content: ${emailContent}

Return ONLY valid JSON with these exact fields:
{
  "intent": "Interested|Not Interested|Needs More Info|Wrong Person|Out of Office|Bounce",
  "buyingSignals": ["signal1", "signal2"],
  "timeline": "string or null",
  "budget": "string or null", 
  "nextAction": "string describing best next step",
  "urgency": "High|Medium|Low",
  "sentiment": "Positive|Neutral|Negative",
  "summary": "one sentence summary"
}`;

    const result = await this.complete(systemPrompt, userMessage, 500);

    try {
      // Sometimes models wrap JSON in code blocks despite instructions
      const cleanJson = result.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
      return JSON.parse(cleanJson);
    } catch {
      logger.warn(`Failed to parse LLM JSON response, using fallback`);
      return {
        intent: "Needs More Info",
        buyingSignals: [],
        timeline: null,
        budget: null,
        nextAction: "Manual review required",
        urgency: "Medium",
        sentiment: "Neutral",
        summary: result.slice(0, 200),
      };
    }
  }

  /**
   * Draft a reply to an inbound message
   */
  async draftReply(contactName, companyName, theirMessage, intent, nextAction) {
    const systemPrompt = `You are a sales development representative at Keli Sensing.
Write helpful, professional replies that move deals forward. Be concise and human.`;

    const userMessage = `Draft a reply to ${contactName} at ${companyName}.

Their message: "${theirMessage}"
Detected intent: ${intent}
Recommended next action: ${nextAction}

Write a short, professional reply that moves toward booking a call or demo.
Include SUBJECT: line at top.`;

    const result = await this.complete(systemPrompt, userMessage, 600);
    const subjectMatch = result.match(/SUBJECT:\s*(.+)/i);
    const subject = subjectMatch ? subjectMatch[1].trim() : `Re: Keli Sensing T1 Sensor`;
    const body = result.replace(/SUBJECT:\s*.+/i, "").trim();

    return { subject, body };
  }

  /**
   * Score a company description for ICP fit using LLM
   */
  async scoreIcpFit(companyDescription, icpCriteria) {
    const systemPrompt = `You are a B2B market analyst. Score how well a company fits 
an Ideal Customer Profile (ICP). Respond with JSON only.`;

    const userMessage = `Score this company for ICP fit:

Company: ${companyDescription}

ICP Criteria:
- Target segments: ${icpCriteria.segments.join(", ")}
- Technology signals: ${icpCriteria.technologySignals.join(", ")}
- Disqualifiers: ${icpCriteria.disqualifiers.join(", ")}

Return JSON: { "score": 0-100, "reasons": ["reason1"], "disqualified": bool, "primarySegment": "string" }`;

    const result = await this.complete(systemPrompt, userMessage, 300);
    try {
      const cleanJson = result.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
      return JSON.parse(cleanJson);
    } catch {
      return { score: 50, reasons: ["Manual review needed"], disqualified: false, primarySegment: "Unknown" };
    }
  }

  /**
   * Fill a template string with variables
   */
  _fillTemplate(template, variables) {
    let filled = template;
    for (const [key, value] of Object.entries(variables)) {
      filled = filled.replace(new RegExp(`{{${key}}}`, "g"), value || "");
    }
    return filled;
  }
}

module.exports = new OpenAILLM();
