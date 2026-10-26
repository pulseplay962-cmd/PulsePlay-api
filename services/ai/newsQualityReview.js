/**
 * Deterministic, no-AI editorial safety checks for researched news candidates.
 * Flags prompt a human review; they do not prove a claim is false or discard it.
 */
const DEFAULT_MAX_AGE_DAYS = 7;
const MIN_SUMMARY_WORDS = 12;

const HIGH_RISK_HEADLINE_TERMS = /\b(?:demise|dead|death|doomed|collapse[sd]?|destroy(?:s|ed|ing)?|shut(?:s|ting)? down|bankrupt(?:cy)?|save the series|industry is over|game changer)\b/i;
const TIME_SENSITIVE_DEAL_TERMS = /\b(?:\d{1,3}%\s*off|\$\s?\d+(?:\.\d{2})?|deal|discount|sale price|limited time|today only|price drop|save\s+\$)\b/i;

function wordCount(value = "") {
    return String(value).trim().split(/\s+/).filter(Boolean).length;
}

export function assessNewsQuality(article = {}, options = {}) {
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const maxAgeDays = Number.isFinite(options.maxAgeDays)
        ? options.maxAgeDays
        : DEFAULT_MAX_AGE_DAYS;
    const flags = [];
    const publishedAt = String(article.published_at || "").trim();
    const title = String(article.title || "").trim();
    const summary = String(article.summary || "").trim();

    if (!publishedAt) {
        flags.push({
            code: "missing_publish_date",
            severity: "review",
            message: "Publication date is missing; confirm the story is current."
        });
    } else {
        const publishedTime = Date.parse(publishedAt);
        if (Number.isNaN(publishedTime)) {
            flags.push({
                code: "invalid_publish_date",
                severity: "review",
                message: "Publication date could not be parsed; verify freshness."
            });
        } else if (publishedTime > now) {
            flags.push({
                code: "future_publish_date",
                severity: "review",
                message: "Publication date is in the future; verify the source metadata."
            });
        } else if (now - publishedTime > maxAgeDays * 24 * 60 * 60 * 1000) {
            flags.push({
                code: "stale_story",
                severity: "review",
                message: `Story is older than ${maxAgeDays} days; confirm it is still relevant.`
            });
        }
    }

    if (!summary || wordCount(summary) < MIN_SUMMARY_WORDS) {
        flags.push({
            code: "thin_summary",
            severity: "review",
            message: `Source summary is shorter than ${MIN_SUMMARY_WORDS} words. Open the original article and verify the key facts before approving; do not fill gaps by guessing.`
        });
    }

    if (HIGH_RISK_HEADLINE_TERMS.test(title)) {
        flags.push({
            code: "strong_headline_claim",
            severity: "review",
            message: "Headline uses dramatic or high-impact wording; verify the claim against the source."
        });
    }

    if (TIME_SENSITIVE_DEAL_TERMS.test(title + " " + summary)) {
        flags.push({
            code: "time_sensitive_deal",
            severity: "review",
            message: "Price or promotion may change; verify the current price and terms before publishing."
        });
    }

    return {
        flagged: flags.length > 0,
        flags
    };
}
