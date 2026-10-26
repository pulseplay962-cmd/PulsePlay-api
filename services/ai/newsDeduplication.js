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

// Terms that commonly appear across otherwise unrelated gaming or hardware stories.
// Ignoring these keeps broad platform/format coverage from dominating topic matching.
const TOPIC_STOP_WORDS = new Set([
    "about", "after", "again", "almost", "also", "amid", "announced", "another",
    "around", "before", "being", "best", "big", "brings", "could", "details",
    "first", "found", "from", "game", "games", "gaming", "gets", "here", "into",
    "just", "last", "latest", "more", "most", "new", "news", "now", "official",
    "over", "reveals", "review", "reviews", "series", "shows", "today", "update",
    "updates", "what", "when", "while", "with", "years", "your",
    "playstation", "xbox", "nintendo", "steam", "sony", "microsoft", "epic"
]);

function topicTerms(title = "") {
    return new Set(
        normalizeNewsTitle(title)
            .split(" ")
            .filter(word => word.length > 3 && !TOPIC_STOP_WORDS.has(word))
    );
}

function sharesTopic(candidate, selected) {
    const candidateTerms = topicTerms(candidate.title);
    if (!candidateTerms.size) return false;

    return selected.some(item => {
        const selectedTerms = topicTerms(item.title);
        for (const term of candidateTerms) {
            if (selectedTerms.has(term)) return true;
        }
        return false;
    });
}

// Prefer distinct topics when building the weekly batch, but only as a selection
// preference: if there are not enough unrelated candidates, related follow-up
// coverage remains eligible rather than being discarded as a duplicate.
function selectDiverse(items, limit, alreadySelected = []) {
    const preferred = [];
    const deferred = [];

    for (const item of items) {
        const target = sharesTopic(item, [...alreadySelected, ...preferred]) ? deferred : preferred;
        if (preferred.length < limit) {
            target.push(item);
        } else {
            deferred.push(item);
        }
    }

    const selected = preferred.slice(0, limit);
    if (selected.length < limit) {
        for (const item of [...preferred.slice(limit), ...deferred]) {
            if (selected.length >= limit) break;
            if (!selected.includes(item)) selected.push(item);
        }
    }
    return selected;
}


// Keep the hardware lane focused on products and technology that matter to gamers.
// A publisher's name alone (for example, Tom's Hardware) is not enough to qualify.
const GAMING_HARDWARE_RELEVANCE = /\b(?:gaming|gamer|graphics card|gpu|video card|cpu|processor|motherboard|ram|ddr[345]|ssd|nvme|storage|pc case|power supply|psu|cooling|cooler|fan|monitor|display|keyboard|mouse|headset|controller|peripheral|mechanical switch|gaming chair|gaming pc|gaming laptop|handheld pc|steam deck|rog ally|legion go|nvidia geforce|amd radeon|intel arc|ray tracing|frame rate|refresh rate|oled|mini led|pc build|desktop pc|laptop|webcam|microphone|capture card)\b/i;

function isRelevantHardwareStory(item) {
    const text = String(item.title || "") + " " + String(item.summary || "");
    return GAMING_HARDWARE_RELEVANCE.test(text);
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
    const databaseTitles = new Set(seenTitles);
    const databaseSourceUrls = new Set(seenSourceUrls);
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
        rejected_off_topic_hardware: 0,
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
            if (databaseSourceUrls.has(sourceUrl)) counts.rejected_duplicate_url++;
            else counts.rejected_duplicate_in_batch++;
            continue;
        }
        if (seenTitles.has(normalizedTitle)) {
            if (databaseTitles.has(normalizedTitle)) counts.rejected_exact_title++;
            else counts.rejected_duplicate_in_batch++;
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
        seenTitles.add(normalizedTitle);
        seenSourceUrls.add(sourceUrl);
        if (puzzleKey) existingPuzzleFamilies.add(puzzleKey);
    }

    const eligible = fresh.filter(item => {
        if (item.source_type !== "hardware" || isRelevantHardwareStory(item)) return true;
        counts.rejected_off_topic_hardware++;
        return false;
    });
    const gaming = eligible.filter(item => item.source_type === "gaming");
    const hardware = eligible.filter(item => item.source_type === "hardware");
    const selectedGaming = selectDiverse(gaming, 3);
    const selectedHardware = selectDiverse(hardware, 2, selectedGaming);
    const selected = [...selectedGaming, ...selectedHardware];

    if (selected.length < 5) {
        const selectedUrls = new Set(selected.map(item => normalizeNewsUrl(item.url)));
        for (const item of selectDiverse(eligible, eligible.length, selected)) {
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
            fresh_candidates: eligible.length,
            selected_candidates: selected.length
        }
    };
}
