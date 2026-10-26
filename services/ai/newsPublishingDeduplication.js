import { normalizeNewsUrl, normalizeNewsTitle } from "./newsDeduplication.js";

function hasNearDuplicateTitle(title, existingTitles) {
    const words = new Set(normalizeNewsTitle(title).split(" ").filter(word => word.length > 2));
    if (words.size < 5) return false;

    for (const existingTitle of existingTitles) {
        const existingWords = new Set(normalizeNewsTitle(existingTitle).split(" ").filter(word => word.length > 2));
        if (existingWords.size < 5) continue;

        let overlap = 0;
        for (const word of words) {
            if (existingWords.has(word)) overlap++;
        }

        if (overlap / Math.max(words.size, existingWords.size) >= 0.88) {
            return true;
        }
    }

    return false;
}

/**
 * Returns a duplicate reason when a candidate conflicts with an existing news
 * article; returns null when no URL/title duplicate is found.
 */
export function findDuplicateArticle(candidate = {}, existingArticles = []) {
    const sourceUrl = normalizeNewsUrl(candidate.source_url || "");
    const title = normalizeNewsTitle(candidate.title || "");
    const articles = Array.isArray(existingArticles) ? existingArticles : [];

    const duplicateSource = Boolean(sourceUrl) && articles.some(article => {
        const existingUrl = normalizeNewsUrl(article?.source_url || "");
        return Boolean(existingUrl) && existingUrl === sourceUrl;
    });

    const duplicateTitle = Boolean(title) && articles.some(article =>
        normalizeNewsTitle(article?.title || "") === title
    );

    const similarTitle = hasNearDuplicateTitle(
        candidate.title || "",
        articles.map(article => article?.title || "")
    );

    if (!duplicateSource && !duplicateTitle && !similarTitle) return null;

    return {
        code: "DUPLICATE_ARTICLE",
        reason: duplicateSource
            ? "An article from this source URL already exists."
            : "A news article with the same or a very similar title already exists.",
        match: duplicateSource ? "source_url" : duplicateTitle ? "title" : "similar_title"
    };
}
