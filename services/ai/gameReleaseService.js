import { openai } from "./openaiService.js";
import { researchGamingNews } from "./researchService.js";


// =====================================
// PulsePlay AI Game Release Service
// =====================================
//
// Stage 1:
// Researches upcoming game releases.
//
// IMPORTANT:
// This service does NOT publish games.
// It does NOT modify the games table.
// It only discovers and structures
// release candidates for later review.
//
// =====================================


const AI_MODEL = "gpt-4.1-mini";


// =====================================
// Helpers
// =====================================

function getMonthRange(year, month) {

    const start =
        new Date(
            Date.UTC(
                year,
                month - 1,
                1
            )
        );

    const end =
        new Date(
            Date.UTC(
                year,
                month,
                0,
                23,
                59,
                59,
                999
            )
        );

    return {
        start,
        end
    };

}


function isValidDate(dateString) {

    if (!dateString) {
        return false;
    }

    const date =
        new Date(dateString);

    return !Number.isNaN(
        date.getTime()
    );

}


function isDateInMonth(
    dateString,
    year,
    month
) {

    if (!isValidDate(dateString)) {
        return false;
    }

    const date =
        new Date(dateString);

    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() + 1 === month
    );

}


function normalizePlatform(platform) {

    if (!platform) {
        return "";
    }

    if (Array.isArray(platform)) {
        return platform.join(", ");
    }

    return String(platform)
        .trim();

}


function normalizeCandidate(candidate) {

    return {

        title:
            String(
                candidate.title || ""
            ).trim(),

        release_date:
            String(
                candidate.release_date || ""
            ).trim(),

        platform:
            normalizePlatform(
                candidate.platform
            ),

        genre:
            String(
                candidate.genre || ""
            ).trim(),

        category:
            String(
                candidate.category || "Games"
            ).trim(),

        source:
            String(
                candidate.source || ""
            ).trim(),

        source_url:
            String(
                candidate.source_url || ""
            ).trim(),

        confidence:
            String(
                candidate.confidence || "medium"
            ).trim(),

        reason:
            String(
                candidate.reason || ""
            ).trim()

    };

}


// =====================================
// Research Releases
// =====================================

export async function scanGameReleases({
    year,
    month,
    limit = 10
}) {

    const numericYear =
        Number(year);

    const numericMonth =
        Number(month);

    const numericLimit =
        Math.max(
            1,
            Math.min(
                Number(limit) || 10,
                25
            )
        );


    if (
        !Number.isInteger(numericYear) ||
        !Number.isInteger(numericMonth) ||
        numericMonth < 1 ||
        numericMonth > 12
    ) {

        throw new Error(
            "Invalid year or month"
        );

    }


    const {
        start,
        end
    } =
        getMonthRange(
            numericYear,
            numericMonth
        );


    console.log(
        "================================="
    );

    console.log(
        "PULSEPLAY AI GAME RELEASE SCAN"
    );

    console.log(
        "================================="
    );

    console.log(
        "TARGET YEAR:",
        numericYear
    );

    console.log(
        "TARGET MONTH:",
        numericMonth
    );

    console.log(
        "MAX RESULTS:",
        numericLimit
    );


    // =====================================
    // Research current gaming sources
    // =====================================

    const research =
        await researchGamingNews();


    if (
        !research ||
        research.length === 0
    ) {

        throw new Error(
            "No gaming research sources returned results"
        );

    }


    // =====================================
    // Build research context
    // =====================================

    const researchContext =
        research
            .slice(0, 30)
            .map(
                (item, index) => {

                    return `
SOURCE ${index + 1}

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
                }
            )
            .join("\n-----------------------------\n");


    // =====================================
    // Ask AI to identify releases
    // =====================================

    const prompt = `You are the PulsePlay game release research assistant.

Current year: ${numericYear}

The user wants upcoming video game releases for:

YEAR: ${numericYear}
MONTH: ${numericMonth}

DATE RANGE:
${start.toISOString()}
through
${end.toISOString()}

Your job is to identify games that are scheduled to release during EXACTLY this month.

Use ONLY information supported by the supplied research.

Do NOT invent:
- release dates
- platforms
- publishers
- genres
- game titles
- URLs
- announcements
- features

If the research does not provide enough evidence for a release date, DO NOT include that game.

Prefer major releases, console releases, PC releases, and games likely to interest PulsePlay's gaming audience.

Every result MUST include a source URL from the supplied research.

Return ONLY valid JSON.

Required format:

{
  "releases": [
    {
      "title": "Game title",
      "release_date": "YYYY-MM-DD",
      "platform": "PS5, Xbox Series X|S, PC",
      "genre": "Action RPG",
      "category": "Games",
      "source": "Source name",
      "source_url": "https://...",
      "confidence": "high",
      "reason": "Short explanation of why this release is relevant"
    }
  ]
}

Rules:

1. release_date MUST be inside ${numericYear}-${String(numericMonth).padStart(2, "0")}.
2. Do not include games releasing outside that month.
3. Do not include games with an unknown release date.
4. Do not guess missing information.
5. Do not duplicate games.
6. Return no more than ${numericLimit} releases.

RESEARCH:

${researchContext}
`;


    const response =
        await openai.chat.completions.create({

            model:
                AI_MODEL,

            temperature:
                0.1,

            response_format:
                {
                    type: "json_object"
                },

            messages: [

                {
                    role:
                        "system",

                    content:
                        "You are a factual gaming release research assistant. Never invent release information."
                },

                {
                    role:
                        "user",

                    content:
                        prompt
                }

            ]

        });


    const raw =
        response
            ?.choices?.[0]
            ?.message?.content;


    if (!raw) {

        throw new Error(
            "AI returned an empty release research response"
        );

    }


    let parsed;

    try {

        parsed =
            JSON.parse(raw);

    } catch (error) {

        console.error(
            "GAME RELEASE JSON ERROR:",
            raw
        );

        throw new Error(
            "AI returned invalid game release JSON"
        );

    }


    const releases =
        Array.isArray(
            parsed.releases
        )
            ? parsed.releases
            : [];


    // =====================================
    // Server-side validation
    // =====================================

    const validated =
        releases

            .map(
                normalizeCandidate
            )

            .filter(
                candidate =>
                    candidate.title &&
                    candidate.release_date &&
                    candidate.source_url &&
                    isDateInMonth(
                        candidate.release_date,
                        numericYear,
                        numericMonth
                    )
            )

            .filter(
                (candidate, index, array) => {

                    const normalizedTitle =
                        candidate.title
                            .toLowerCase()
                            .trim();

                    return (
                        array.findIndex(
                            item =>
                                item.title
                                    .toLowerCase()
                                    .trim() ===
                                normalizedTitle
                        ) === index
                    );

                }
            )

            .slice(
                0,
                numericLimit
            );


    console.log(
        "VALID GAME RELEASES:",
        validated.length
    );


    return {

        success:
            true,

        year:
            numericYear,

        month:
            numericMonth,

        limit:
            numericLimit,

        releases:
            validated

    };

}


// =====================================
// Generate Game Package
// =====================================
//
// Stage 1 intentionally includes this
// helper for the next stage, but it does
// NOT write anything to Supabase.
//

export async function generateGamePackage(
    release
) {

    if (!release?.title) {

        throw new Error(
            "Game release title is required"
        );

    }


    if (
        !release.release_date ||
        !isValidDate(
            release.release_date
        )
    ) {

        throw new Error(
            "A verified release date is required"
        );

    }


    const prompt = `Create a complete PulsePlay game listing package.

Game:

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
- The image_prompt should request editorial gaming artwork rather than copying official key art.
- Article content should use Markdown.
- Facebook post should be energetic but factual.
- Hashtags should be comma-separated.
`;


    const response =
        await openai.chat.completions.create({

            model:
                AI_MODEL,

            temperature:
                0.4,

            response_format:
                {
                    type: "json_object"
                },

            messages: [

                {
                    role:
                        "system",

                    content:
                        "You create accurate gaming editorial content for PulsePlay. Never invent facts."
                },

                {
                    role:
                        "user",

                    content:
                        prompt
                }

            ]

        });


    const raw =
        response
            ?.choices?.[0]
            ?.message?.content;


    if (!raw) {

        throw new Error(
            "AI returned an empty game package"
        );

    }


    let packageData;

    try {

        packageData =
            JSON.parse(raw);

    } catch {

        throw new Error(
            "AI returned invalid game package JSON"
        );

    }


    return {

        ...packageData,

        title:
            release.title,

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

        category:
            "Games",

        status:
            "upcoming",

        featured:
            Boolean(
                packageData.featured
            ),

        research_source:
            release.source,

        research_source_url:
            release.source_url

    };

}
