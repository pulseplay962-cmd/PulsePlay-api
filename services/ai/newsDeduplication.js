export function normalizeNewsUrl(url = "") {
    try {
        const parsed = new URL(String(url).trim());
        ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"]
            .forEach(key => parsed.searchParams.delete(key));
        parsed.hash = "";
        return parsed.toString().replace(/\/$/, "");
    } catch {
        return String(url || "").trim().replace(/\/$/, "");
    }
}

export function normalizeNewsTitle(title = "") {
    return String(title)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function isSimilarTitle(title, existingTitles) {
    const words = new Set(normalizeNewsTitle(title).split(" ").filter(word => word.length > 2));
    if (words.size < 5) return false;

    for (const existing of existingTitles) {
        const existingWords = new Set(normalizeNewsTitle(existing).split(" ").filter(word => word.length > 2));
        if (existingWords.size < 5) continue;
        let overlap = 0;
        for (const word of words) {
            if (existingWords.has(word)) overlap++;
        }
        if (overlap / Math.max(words.size, existingWords.size) >= 0.88) return true;
    }
    return false;
}

export function selectWeeklyCandidates(research, existingTitles, existingSourceUrls) {
    const seenTitles = new Set(existingTitles);
    const seenSourceUrls = new Set(existingSourceUrls);
    const fresh = [];

    for (const source of research) {
        const title = String(source.title || "").trim();
        const normalizedTitle = normalizeNewsTitle(title);
        const sourceUrl = normalizeNewsUrl(source.url);
        if (
            !title ||
            !sourceUrl ||
            seenTitles.has(normalizedTitle) ||
            isSimilarTitle(title, seenTitles) ||
            seenSourceUrls.has(sourceUrl)
        ) continue;

        fresh.push(source);
        seenTitles.add(normalizedTitle);
        seenSourceUrls.add(sourceUrl);
    }

    const gaming = fresh.filter(item => item.source_type === "gaming");
    const hardware = fresh.filter(item => item.source_type === "hardware");
    const selected = [...gaming.slice(0, 3), ...hardware.slice(0, 2)];

    if (selected.length < 5) {
        const selectedUrls = new Set(selected.map(item => normalizeNewsUrl(item.url)));
        for (const item of fresh) {
            if (selected.length >= 5) break;
            const url = normalizeNewsUrl(item.url);
            if (!selectedUrls.has(url)) {
                selected.push(item);
                selectedUrls.add(url);
            }
        }
    }

    return {
        selected,
        gamingAvailable: gaming.length,
        hardwareAvailable: hardware.length
    };
}
