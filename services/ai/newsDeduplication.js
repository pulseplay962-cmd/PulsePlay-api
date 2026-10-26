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

// Daily puzzle answer pages change date and puzzle number, but are still the same
// recurring content format. Treat those as a family so each day's URL is not
// automatically considered a fresh story when that format already exists.
export function recurringPuzzleKey(title = "") {
    const normalized = normalizeNewsTitle(title);
    const families = [
        { key: "quordle-daily-answers", pattern: /\bquordle\b/ },
        { key: "nyt-connections-daily-answers", pattern: /\b(?:nyt )?connections\b/ },
        { key: "nyt-strands-daily-answers", pattern: /\b(?:nyt )?strands\b/ },
        { key: "wordle-daily-answers", pattern: /\bwordle\b/ }
    ];
    const family = families.find(item => item.pattern.test(normalized));
    if (!family) return null;

    const puzzleSignals = /\b(hints?|answers?|clues?|solutions?|today|daily|game)\b/.test(normalized);
    return puzzleSignals ? family.key : null;
}

export function selectWeeklyCandidates(research, existingTitles, existingSourceUrls) {
    const seenTitles = new Set([...existingTitles].map(normalizeNewsTitle).filter(Boolean));
    const seenSourceUrls = new Set([...existingSourceUrls].map(normalizeNewsUrl).filter(Boolean));
    const existingPuzzleFamilies = new Set(
        [...seenTitles].map(recurringPuzzleKey).filter(Boolean)
    );
    const fresh = [];
    const counts = {
        researched: research.length,
        rejected_missing_title_or_url: 0,
        rejected_duplicate_url: 0,
        rejected_exact_title: 0,
        rejected_similar_title: 0,
        rejected_recurring_puzzle_format: 0,
        rejected_duplicate_in_batch: 0
    };

    for (const source of research) {
        const title = String(source.title || "").trim();
        const normalizedTitle = normalizeNewsTitle(title);
        const sourceUrl = normalizeNewsUrl(source.url);

        if (!title || !sourceUrl) {
            counts.rejected_missing_title_or_url++;
            continue;
        }
        if (seenSourceUrls.has(sourceUrl)) {
            counts.rejected_duplicate_url++;
            continue;
        }
        if (seenTitles.has(normalizedTitle)) {
            counts.rejected_exact_title++;
            continue;
        }
        if (isSimilarTitle(title, seenTitles)) {
            counts.rejected_similar_title++;
            continue;
        }
        const puzzleKey = recurringPuzzleKey(title);
        if (puzzleKey && existingPuzzleFamilies.has(puzzleKey)) {
            counts.rejected_recurring_puzzle_format++;
            continue;
        }

        fresh.push(source);
        if (seenTitles.has(normalizedTitle) || seenSourceUrls.has(sourceUrl)) {
            counts.rejected_duplicate_in_batch++;
            continue;
        }
        seenTitles.add(normalizedTitle);
        seenSourceUrls.add(sourceUrl);
        if (puzzleKey) existingPuzzleFamilies.add(puzzleKey);
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
        hardwareAvailable: hardware.length,
        counts: {
            ...counts,
            rejected_total: Object.entries(counts)
                .filter(([key]) => key.startsWith("rejected_"))
                .reduce((sum, [, value]) => sum + value, 0),
            fresh_candidates: fresh.length,
            selected_candidates: selected.length
        }
    };
}
