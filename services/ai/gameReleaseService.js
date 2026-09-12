import openai from "./openaiService.js";
import { researchGamingNews } from "./researchService.js";

const AI_MODEL = "gpt-4.1-mini";

const RELEASE_CALENDAR_SOURCES = [
    {
        name: "VGC",
        url: "https://www.videogameschronicle.com/guide/upcoming-game-release-dates-schedule/"
    },
    {
        name: "GamesRadar",
        url: "https://www.gamesradar.com/video-game-release-dates/"
    }
];

const REQUEST_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
    Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

function getMonthRange(year, month) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    return { start, end };
}

function isValidDate(dateString) {
    if (!dateString) return false;

    const date = new Date(dateString);

    return !Number.isNaN(date.getTime());
}

function isDateInMonth(dateString, year, month) {
    if (!isValidDate(dateString)) return false;

    const date = new Date(dateString);

    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() + 1 === month
    );
}

function normalizePlatform(platform) {
    if (!platform) return "";

    if (Array.isArray(platform)) {
        return platform.join(", ");
    }

    return String(platform).trim();
}

function normalizeCandidate(candidate) {
    return {
        title: String(candidate.title || "").trim(),
        release_date: String(candidate.release_date || "").trim(),
        platform: normalizePlatform(candidate.platform),
        genre: String(candidate.genre || "").trim(),
        category: String(candidate.category || "Games").trim(),
        source: String(candidate.source || "").trim(),
        source_url: String(candidate.source_url || "").trim(),
        confidence: String(candidate.confidence || "medium").trim(),
        reason: String(candidate.reason || "").trim()
    };
}

function decodeHtml(value) {
    return String(value || "")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&apos;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&#x27;/gi, "'")
        .replace(/&#x2F;/gi, "/")
        .replace(/\s+/g, " ")
        .trim();
}

function stripHtml(value) {
    return decodeHtml(
        String(value || "")
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
    );
}

function normalizeTitle(title) {
    return String(title || "")
        .toLowerCase()
        .replace(/[’']/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function monthName(month) {
    return new Date(Date.UTC(2026, month - 1, 1)).toLocaleString("en-US", {
        month: "long",
        timeZone: "UTC"
    });
}

function parseReleaseDate(monthNameText, day, year) {
    const monthMap = {
        january: 1,
        february: 2,
        march: 3,
        april: 4,
        may: 5,
        june: 6,
        july: 7,
        august: 8,
        september: 9,
        october: 10,
        november: 11,
        december: 12
    };

    const month = monthMap[String(monthNameText || "").toLowerCase()];

    if (!month || !day || !year) {
        return null;
    }

    const date = new Date(
        Date.UTC(Number(year), month - 1, Number(day))
    );

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date.toISOString().slice(0, 10);
}

function inferGenre(title) {
    const lower = title.toLowerCase();

    if (
        lower.includes("wolverine") ||
        lower.includes("control") ||
        lower.includes("dune") ||
        lower.includes("onimusha")
    ) {
        return "Action";
    }

    if (
        lower.includes("silent hill") ||
        lower.includes("horror")
    ) {
        return "Horror";
    }

    if (
        lower.includes("fire emblem") ||
        lower.includes("dragon quest")
    ) {
        return "RPG / Strategy";
    }

    if (lower.includes("minecraft")) {
        return "Action / Adventure";
    }

    return "Video Game";
}

function extractReleaseCandidatesFromText(
    sourceName,
    sourceUrl,
    text,
    year,
    month
) {
    const results = [];

    const targetMonth = monthName(month);

    /*
     * Preserve block boundaries from the original HTML.
     *
     * The previous parser collapsed all whitespace into one line before
     * parsing. That caused titles and dates from separate release entries
     * to become one giant string.
     */
    const normalizedText = String(text || "")
        .replace(/\r/g, "\n")
        .replace(/<script[\s\S]*?<\/script>/gi, "\n")
        .replace(/<style[\s\S]*?<\/style>/gi, "\n")
        .replace(
            /<\/(?:p|div|li|article|section|header|footer|h1|h2|h3|h4|h5|h6|tr|br)>/gi,
            "\n"
        )
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&#8211;/gi, "–")
        .replace(/&#8212;/gi, "—")
        .replace(/&#x2013;/gi, "–")
        .replace(/&#x2014;/gi, "—")
        .replace(/[ \t]+/g, " ")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    const lines = normalizedText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

    function addCandidate({
        title,
        releaseDate,
        platform = ""
    }) {
        const cleanTitle = String(title || "")
            .replace(/\s+/g, " ")
            .replace(/^[•·|]+/, "")
            .replace(/[|•·]+$/, "")
            .trim();

        if (!cleanTitle || cleanTitle.length < 2) return;
        if (cleanTitle.length > 120) return;

        if (
            /^(new games|new video game release dates|new games of|release dates|2026|2027|tbc)$/i.test(
                cleanTitle
            )
        ) {
            return;
        }

        if (!isDateInMonth(releaseDate, year, month)) {
            return;
        }

        results.push({
            title: cleanTitle,
            release_date: releaseDate,
            platform: String(platform || "")
                .replace(/\s+/g, " ")
                .trim(),
            genre: inferGenre(cleanTitle),
            category: "Games",
            source: sourceName,
            source_url: sourceUrl,
            confidence: "medium",
            reason:
                "Release date discovered on a dedicated gaming release calendar."
        });
    }

    /*
     * VGC format:
     *
     * Marvel's Wolverine
     * – Tuesday, September 15 (PS5)
     *
     * Also supports:
     *
     * Title – Tuesday, September 15 (PS5)
     */
    if (sourceName === "VGC") {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            const inlineMatch = line.match(
                /^(.{2,120}?)\s*[–—-]\s*(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*)?([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?\s*(?:\(([^)]+)\))?\s*$/i
            );

            if (inlineMatch) {
                const candidateMonth = inlineMatch[2];

                if (
                    candidateMonth.toLowerCase() ===
                    targetMonth.toLowerCase()
                ) {
                    const candidateYear = Number(
                        inlineMatch[4] || year
                    );

                    const releaseDate = parseReleaseDate(
                        candidateMonth,
                        Number(inlineMatch[3]),
                        candidateYear
                    );

                    addCandidate({
                        title: inlineMatch[1],
                        releaseDate,
                        platform: inlineMatch[5] || ""
                    });
                }

                continue;
            }

            /*
             * Two-line VGC format:
             * title
             * – date (platform)
             */
            const dateLine = line.match(
                /^[–—-]\s*(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*)?([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?\s*(?:\(([^)]+)\))?\s*$/i
            );

            if (!dateLine || i === 0) {
                continue;
            }

            if (
                dateLine[1].toLowerCase() !==
                targetMonth.toLowerCase()
            ) {
                continue;
            }

            const candidateYear = Number(dateLine[3] || year);

            const releaseDate = parseReleaseDate(
                dateLine[1],
                Number(dateLine[2]),
                candidateYear
            );

            addCandidate({
                title: lines[i - 1],
                releaseDate,
                platform: dateLine[4] || ""
            });
        }
    }

    /*
     * GamesRadar format:
     *
     * Moonlighter 2: The Endless Vault
     * (PS5, NS2) – September 2
     *
     * Sometimes the title and date are on the same line, so both
     * formats are supported.
     */
    if (sourceName === "GamesRadar") {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            /*
             * Title followed by platform/date.
             */
            const inlineMatch = line.match(
                /^(.{2,120}?)\s*\(([^)]+)\)\s*[–—-]\s*([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?\s*$/i
            );

            if (inlineMatch) {
                if (
                    inlineMatch[3].toLowerCase() !==
                    targetMonth.toLowerCase()
                ) {
                    continue;
                }

                const candidateYear = Number(
                    inlineMatch[5] || year
                );

                const releaseDate = parseReleaseDate(
                    inlineMatch[3],
                    Number(inlineMatch[4]),
                    candidateYear
                );

                addCandidate({
                    title: inlineMatch[1],
                    releaseDate,
                    platform: inlineMatch[2]
                });

                continue;
            }

            /*
             * GamesRadar can split the title and release information:
             *
             * Title
             * (PS5, PC) – September 15
             */
            const dateLine = line.match(
                /^\(([^)]+)\)\s*[–—-]\s*([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?\s*$/i
            );

            if (!dateLine || i === 0) {
                continue;
            }

            if (
                dateLine[2].toLowerCase() !==
                targetMonth.toLowerCase()
            ) {
                continue;
            }

            const candidateYear = Number(
                dateLine[4] || year
            );

            const releaseDate = parseReleaseDate(
                dateLine[2],
                Number(dateLine[3]),
                candidateYear
            );

            addCandidate({
                title: lines[i - 1],
                releaseDate,
                platform: dateLine[1]
            });
        }
    }

    /*
     * General safety-net parser.
     *
     * This catches release-calendar formats where the title/date are
     * contained on the same line but do not exactly match the source-
     * specific patterns above.
     */
    for (const line of lines) {
        const match = line.match(
            /^(.{2,120}?)\s*(?:\(([^)]+)\)\s*)?[–—-]\s*(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*)?([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?\s*$/i
        );

        if (!match) continue;

        if (
            match[3].toLowerCase() !==
            targetMonth.toLowerCase()
        ) {
            continue;
        }

        const candidateYear = Number(
            match[5] || year
        );

        const releaseDate = parseReleaseDate(
            match[3],
            Number(match[4]),
            candidateYear
        );

        addCandidate({
            title: match[1],
            releaseDate,
            platform: match[2] || ""
        });
    }

    /*
     * Deduplicate candidates by normalized title + release date.
     */
    const deduped = new Map();

    for (const candidate of results) {
        const key =
            `${normalizeTitle(candidate.title)}|${candidate.release_date}`;

        const existing = deduped.get(key);

        if (!existing) {
            deduped.set(key, candidate);
            continue;
        }

        if (
            candidate.platform.length >
            existing.platform.length
        ) {
            deduped.set(key, candidate);
        }
    }

    return Array.from(deduped.values()).sort((a, b) => {
        if (a.release_date !== b.release_date) {
            return a.release_date.localeCompare(b.release_date);
        }

        return a.title.localeCompare(b.title);
    });
}


async function fetchReleaseCalendar(source) {
    console.log(`Fetching release calendar: ${source.name}`);

    const response = await fetch(source.url, {
        headers: REQUEST_HEADERS
    });

    if (!response.ok) {
        throw new Error(
            `${source.name} returned HTTP ${response.status}`
        );
    }

    const html = await response.text();

    console.log(
        `${source.name} release calendar downloaded: ${html.length} characters`
    );

    return html;
}

async function collectReleaseCalendarCandidates(year, month) {
    const allCandidates = [];

    for (const source of RELEASE_CALENDAR_SOURCES) {
        try {
            const html = await fetchReleaseCalendar(source);

            const candidates =
                extractReleaseCandidatesFromText(
                    source.name,
                    source.url,
                    html,
                    year,
                    month
                );

            console.log(
                `${source.name} release candidates: ${candidates.length}`
            );

            allCandidates.push(...candidates);
        } catch (error) {
            console.error(
                `${source.name} release calendar error:`,
                error.message
            );
        }
    }

    const deduped = new Map();

    for (const candidate of allCandidates) {
        const key =
            `${normalizeTitle(candidate.title)}|${candidate.release_date}`;

        const existing = deduped.get(key);

        if (!existing) {
            deduped.set(key, candidate);
            continue;
        }

        /*
         * Prefer the candidate containing the most platform information.
         */
        if (
            String(candidate.platform || "").length >
            String(existing.platform || "").length
        ) {
            deduped.set(key, candidate);
        }
    }

    const sorted = Array.from(deduped.values()).sort((a, b) => {
        if (a.release_date !== b.release_date) {
            return a.release_date.localeCompare(b.release_date);
        }

        return a.title.localeCompare(b.title);
    });

    console.log(
        `CALENDAR CANDIDATES: ${sorted.length}`
    );

    return sorted;
}

function buildResearchContext(calendarCandidates, supportingResearch) {
    const calendarContext = calendarCandidates
        .map((item, index) => {
            return `
CALENDAR CANDIDATE ${index + 1}

Title:
${item.title}

Release Date:
${item.release_date}

Platforms:
${item.platform || "Unknown"}

Genre:
${item.genre || "Unknown"}

Source:
${item.source}

Source URL:
${item.source_url}

Confidence:
${item.confidence}
`;
        })
        .join("\n-----------------------------\n");

    const supportingContext = supportingResearch
        .map((item, index) => {
            return `
SUPPORTING SOURCE ${index + 1}

Publisher:
${item.source}

Title:
${item.title}

Published:
${item.published_at || "Unknown"}

URL:
${item.url}

Summary:
${item.summary || "No summary available"}
`;
        })
        .join("\n-----------------------------\n");

    return {
        calendarContext,
        supportingContext
    };
}

async function getSupportingResearch(year, month) {
    try {
        const articles = await researchGamingNews();

        const targetMonth =
            `${year}-${String(month).padStart(2, "0")}`;

        return articles.filter(article => {
            const publishedDate =
                article.published_at ||
                article.publishedAt ||
                article.pubDate ||
                article.date ||
                article.published ||
                "";

            if (!publishedDate) {
                return true;
            }

            return String(publishedDate).startsWith(targetMonth);
        });
    } catch (error) {
        console.error(
            "SUPPORTING RESEARCH ERROR:",
            error.message
        );

        return [];
    }
}

async function rankAndVerifyCandidates({
    year,
    month,
    limit,
    calendarCandidates,
    supportingResearch
}) {
    if (calendarCandidates.length === 0) {
        return [];
    }

    const { calendarContext, supportingContext } =
        buildResearchContext(
            calendarCandidates,
            supportingResearch
        );

    const prompt = `You are the PulsePlay game release research and ranking assistant.

TARGET MONTH:
${year}-${String(month).padStart(2, "0")}

The supplied release-calendar candidates are the ONLY allowed source
for release dates.

Your job is to:

1. Remove duplicates.
2. Remove obvious DLC-only releases unless they are a major standalone
   gaming release with strong PulsePlay relevance.
3. Prefer full games over minor DLC.
4. Prefer major AAA and major studio releases.
5. Prefer PS5 relevance.
6. Consider Xbox, PC, and Switch 2 releases.
7. Consider Twitch/streaming potential.
8. Consider broad gaming-community interest.
9. Keep only games actually releasing in the requested month.
10. NEVER invent a release date.
11. NEVER move a game to another date.
12. NEVER create a game that is not present in the supplied calendar.
13. Preserve the calendar source URL for every selected game.
14. If multiple calendar sources confirm a title/date, confidence should be high.
15. If a candidate only appears once, confidence may remain medium.

Return ONLY valid JSON:

{
  "releases": [
    {
      "title": "Game title",
      "release_date": "YYYY-MM-DD",
      "platform": "PS5, Xbox Series X|S, PC",
      "genre": "Action",
      "category": "Games",
      "source": "VGC",
      "source_url": "https://...",
      "confidence": "high",
      "reason": "Why PulsePlay should consider this release"
    }
  ]
}

Return no more than ${limit} games.

IMPORTANT:
The release_date MUST exactly match the supplied calendar candidate.

RELEASE CALENDAR CANDIDATES:

${calendarContext}

SUPPORTING GAMING RESEARCH:

${supportingContext || "No supporting research available."}
`;

    const response = await openai.chat.completions.create({
        model: AI_MODEL,
        temperature: 0.1,
        response_format: {
            type: "json_object"
        },
        messages: [
            {
                role: "system",
                content:
                    "You are a factual gaming release researcher. Never invent release dates or games."
            },
            {
                role: "user",
                content: prompt
            }
        ]
    });

    const raw = response?.choices?.[0]?.message?.content;

    if (!raw) {
        throw new Error(
            "AI returned an empty ranked game release response"
        );
    }

    let parsed;

    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        console.error(
            "GAME RELEASE RANKING JSON ERROR:",
            raw
        );

        throw new Error(
            "AI returned invalid ranked game release JSON"
        );
    }

    return Array.isArray(parsed.releases)
        ? parsed.releases
        : [];
}

export async function scanGameReleases({
    year,
    month,
    limit = 10
}) {
    const numericYear = Number(year);
    const numericMonth = Number(month);
    const numericLimit = Math.max(
        1,
        Math.min(Number(limit) || 10, 25)
    );

    if (
        !Number.isInteger(numericYear) ||
        !Number.isInteger(numericMonth) ||
        numericMonth < 1 ||
        numericMonth > 12
    ) {
        throw new Error("Invalid year or month");
    }

    const { start, end } = getMonthRange(
        numericYear,
        numericMonth
    );

    console.log("=================================");
    console.log("PULSEPLAY AI GAME RELEASE SCAN");
    console.log("=================================");
    console.log("TARGET YEAR:", numericYear);
    console.log("TARGET MONTH:", numericMonth);
    console.log("MAX RESULTS:", numericLimit);
    console.log(
        "DATE RANGE:",
        start.toISOString(),
        "through",
        end.toISOString()
    );

    /*
     * Dedicated release calendars are the primary discovery source.
     */
    const calendarCandidates =
        await collectReleaseCalendarCandidates(
            numericYear,
            numericMonth
        );

    console.log(
        "CALENDAR CANDIDATES:",
        calendarCandidates.length
    );

    /*
     * RSS/news research remains useful for supporting evidence,
     * but it is no longer responsible for discovering the entire
     * release calendar.
     */
    const supportingResearch =
        await getSupportingResearch(
            numericYear,
            numericMonth
        );

    console.log(
        "SUPPORTING RESEARCH ITEMS:",
        supportingResearch.length
    );

    if (calendarCandidates.length === 0) {
        throw new Error(
            "No game releases were discovered from the configured release calendars"
        );
    }

    const ranked =
        await rankAndVerifyCandidates({
            year: numericYear,
            month: numericMonth,
            limit: numericLimit,
            calendarCandidates,
            supportingResearch
        });

    /*
     * The release calendars are the source of truth.
     *
     * AI is allowed to rank candidates, but it is NOT allowed
     * to invent, alter, or remove the authoritative release data.
     */

    const calendarByTitle = new Map();

    for (const calendarCandidate of calendarCandidates) {
        calendarByTitle.set(
            normalizeTitle(calendarCandidate.title),
            calendarCandidate
        );
    }

    const selectedTitles = new Set();
    const validated = [];

    /*
     * First: keep the AI's ranking order.
     *
     * For every AI-selected title, restore the exact calendar
     * title/date/platform/source.
     */
    for (const rankedCandidate of ranked) {
        if (!rankedCandidate?.title) {
            continue;
        }

        const rankedTitle =
            normalizeTitle(rankedCandidate.title);

        const authoritative =
            calendarByTitle.get(rankedTitle);

        if (!authoritative) {
            continue;
        }

        const key =
            normalizeTitle(authoritative.title);

        if (selectedTitles.has(key)) {
            continue;
        }

        if (
            !authoritative.release_date ||
            !isDateInMonth(
                authoritative.release_date,
                numericYear,
                numericMonth
            )
        ) {
            continue;
        }

        selectedTitles.add(key);

        validated.push({
            ...authoritative,
            genre:
                rankedCandidate.genre ||
                authoritative.genre ||
                "Video Game",
            category:
                rankedCandidate.category ||
                "Games",
            confidence:
                rankedCandidate.confidence ||
                "medium",
            reason:
                rankedCandidate.reason ||
                "Selected for PulsePlay based on release relevance."
        });

        if (validated.length >= numericLimit) {
            break;
        }
    }

    /*
     * If the AI returned fewer games than requested, fill the
     * remaining slots from the authoritative calendar candidates.
     *
     * This guarantees that a request for 10 can actually return
     * 10 when at least 10 valid calendar candidates exist.
     */
    if (validated.length < numericLimit) {
        for (const calendarCandidate of calendarCandidates) {
            const key =
                normalizeTitle(calendarCandidate.title);

            if (selectedTitles.has(key)) {
                continue;
            }

            if (
                !calendarCandidate.release_date ||
                !isDateInMonth(
                    calendarCandidate.release_date,
                    numericYear,
                    numericMonth
                )
            ) {
                continue;
            }

            selectedTitles.add(key);

            validated.push({
                ...calendarCandidate,
                category: "Games",
                confidence:
                    calendarCandidate.confidence ||
                    "medium",
                reason:
                    "Added from the verified release calendar to complete the requested scan."
            });

            if (validated.length >= numericLimit) {
                break;
            }
        }
    }

    console.log(
        "AI RANKED RELEASES:",
        ranked.length
    );

    console.log(
        "VALID GAME RELEASES:",
        validated.length
    );

    console.log(
        "VALID GAME RELEASES:",
        validated.length
    );

    return {
        success: true,
        year: numericYear,
        month: numericMonth,
        limit: numericLimit,
        releases: validated
    };
}

export async function generateGamePackage(release) {
    if (!release?.title) {
        throw new Error(
            "Game release title is required"
        );
    }

    if (
        !release.release_date ||
        !isValidDate(release.release_date)
    ) {
        throw new Error(
            "A verified release date is required"
        );
    }

    const prompt = `Create a complete PulsePlay game listing package.

GAME:

Title:
${release.title}

Release Date:
${release.release_date}

Platforms:
${release.platform || "Unknown"}

Genre:
${release.genre || "Unknown"}

Source:
${release.source || "Unknown"}

Source URL:
${release.source_url}

Create content for the PulsePlay Games library.

Return ONLY valid JSON:

{
  "title": "",
  "description": "",
  "release_date": "",
  "genre": "",
  "platform": "",
  "category": "Games",
  "status": "upcoming",
  "featured": false,
  "article_title": "",
  "meta_description": "",
  "article_content": "",
  "facebook_post": "",
  "image_prompt": "",
  "hashtags": ""
}

Accuracy rules:

- Keep the supplied release date exactly.
- Do not invent gameplay features.
- Do not invent reviews.
- Do not invent sales numbers.
- Do not invent quotes.
- Do not invent developers or publishers unless supported by the supplied information.
- Clearly write original PulsePlay editorial content.
- Do not claim AI-generated artwork is official game artwork.
- The image_prompt should request original editorial gaming artwork.
- Do not instruct the image model to reproduce official game key art.
- Article content should use Markdown.
- Facebook post should be energetic but factual.
- Hashtags should be comma-separated.
`;

    const response = await openai.chat.completions.create({
        model: AI_MODEL,
        temperature: 0.4,
        response_format: {
            type: "json_object"
        },
        messages: [
            {
                role: "system",
                content:
                    "You create accurate gaming editorial content for PulsePlay. Never invent facts."
            },
            {
                role: "user",
                content: prompt
            }
        ]
    });

    const raw = response?.choices?.[0]?.message?.content;

    if (!raw) {
        throw new Error(
            "AI returned an empty game package"
        );
    }

    let packageData;

    try {
        packageData = JSON.parse(raw);

        const cleanGeneratedText = (value) =>
            typeof value === "string"
                ? value
                    .replace(/([a-z])([A-Z])/g, "$1 $2")
                    .replace(/([a-z])([0-9])/g, "$1 $2")
                    .replace(/([0-9])([a-z])/g, "$1 $2")
                    .replace(/\\s{2,}/g, " ")
                    .trim()
                : value;

        for (const key of [
            "description",
            "article_title",
            "meta_description",
            "article_content",
            "facebook_post",
            "image_prompt",
            "hashtags"
        ]) {
            packageData[key] = cleanGeneratedText(packageData[key]);
        }
    } catch {
        throw new Error(
            "AI returned invalid game package JSON"
        );
    }

    return {
        ...packageData,

        title: release.title,

        release_date:
            release.release_date,

        genre:
            packageData.genre ||
            release.genre ||
            null,

        platform:
            packageData.platform ||
            release.platform ||
            null,

        category: "Games",

        status: "upcoming",

        featured:
            Boolean(packageData.featured),

        research_source:
            release.source,

        research_source_url:
            release.source_url
    };
}
