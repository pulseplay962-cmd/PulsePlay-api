import openai, {
    isAIProductionMode,
    getAIMode
} from "./openaiService.js";

import { pulsePlayBrand } from "./prompts.js";

import { supabase } from "../../lib/supabase.js";

import { generateImage } from "./imageService.js";

import { researchGamingNews } from "./researchService.js";


// =====================================
// PulsePlay Weekly Content Schedule
// =====================================

const weeklySchedule = {

    Monday: {
        website: "Game Spotlight",
        facebook: "Promote article + discussion"
    },

    Tuesday: {
        website: "Gaming Gear Guide",
        facebook: "Gear teaser"
    },

    Wednesday: {
        website: "Community Poll",
        facebook: "Community discussion"
    },

    Thursday: {
        website: "Gaming News & Updates",
        facebook: "Gaming news discussion"
    },

    Friday: {
        website: "Weekend Gaming Picks",
        facebook: "Weekend gaming recommendations"
    },

    Saturday: {
        website: "Gaming Tips & Tricks",
        facebook: "Gaming tips discussion"
    },

    Sunday: {
        website: "Weekly Gaming Roundup",
        facebook: "Weekly gaming discussion"
    }

};


// =====================================
// OpenAI Model
// =====================================

const AI_MODEL = "gpt-4.1-mini";


// =====================================
// Get Upcoming Dates
// =====================================

function getUpcomingDates() {

    const dates = {};

    const today = new Date();

    Object.keys(weeklySchedule).forEach((day) => {

        const date = new Date(today);

        const currentDay =
            date.getDay();

        const targetDay =
            [
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday"
            ].indexOf(day);

        let difference =
            targetDay - currentDay;


        /*
         * Always schedule the next occurrence
         * of each weekday.
         */

        if (difference <= 0) {
            difference += 7;
        }


        date.setDate(
            date.getDate() + difference
        );


        dates[day] =
            date.toISOString().split("T")[0];

    });


    return dates;

}


// =====================================
// Parse AI JSON Safely
// =====================================

function parseAIResponse(content) {

    if (!content) {

        throw new Error(
            "AI returned an empty response."
        );

    }


    try {

        return JSON.parse(content);

    } catch (error) {

        console.error(
            "AI JSON FAILURE:",
            content
        );

        throw new Error(
            "AI returned invalid JSON."
        );

    }

}


// =====================================
// Research Text Normalization
// =====================================

function normalizeResearchText(text = "") {

    return String(text)

        .toLowerCase()

        .replace(
            /[^a-z0-9\s]/g,
            " "
        )

        .replace(
            /\s+/g,
            " "
        )

        .trim();

}


// =====================================
// AI Output Text Cleanup
// =====================================

function cleanAIText(text = "") {

    return String(text)

        // Fix common missing spaces between words.
        .replace(
            /([a-z])([A-Z])/g,
            "$1 $2"
        )

        // Fix common punctuation spacing.
        .replace(
            /([,.!?])([A-Za-z])/g,
            "$1 $2"
        )

        // Normalize excessive whitespace.
        .replace(
            /[ \t]+/g,
            " "
        )

        .replace(
            /\n{3,}/g,
            "\n\n"
        )

        .trim();

}


// =====================================
// Extract Research Keywords
// =====================================


function extractResearchKeywords(source) {

    if (!source) {
        return [];
    }


    const title =
        normalizeResearchText(
            source.title || ""
        );


    const summary =
        normalizeResearchText(
            source.summary || ""
        );


    const combined =
        `${title} ${summary}`;


    const stopWords =
        new Set([

            "about",
            "after",
            "again",
            "against",
            "among",
            "because",
            "before",
            "being",
            "between",
            "could",
            "first",
            "from",
            "gaming",
            "games",
            "have",
            "into",
            "latest",
            "more",
            "news",
            "over",
            "players",
            "player",
            "their",
            "there",
            "these",
            "they",
            "this",
            "through",
            "under",
            "update",
            "updates",
            "with",
            "would",
            "will",
            "been",
            "than",
            "today",
            "week",
            "weeks",
            "official",
            "current"

        ]);


    return [

        ...new Set(

            combined

                .split(" ")

                .filter(

                    word =>
                        word.length >= 4 &&
                        !stopWords.has(word)

                )

        )

    ];

}


// =====================================
// Verify Research Actually Supports Post
// =====================================

function researchSupportsPost(
    post,
    source
) {

    if (!post || !source) {
        return false;
    }


    const researchTitle =
        normalizeResearchText(
            source.title || ""
        );


    const researchSummary =
        normalizeResearchText(
            source.summary || ""
        );


    const postText =
        normalizeResearchText(

            [
                post.title || "",
                post.body || "",
                post.social_caption || ""

            ].join(" ")

        );


    if (
        !researchTitle ||
        !postText
    ) {

        return false;

    }


    // =====================================
    // Stop Words
    // =====================================

    const stopWords =
        new Set([

            "about",
            "after",
            "again",
            "against",
            "among",
            "because",
            "before",
            "being",
            "between",
            "could",
            "first",
            "from",
            "gaming",
            "games",
            "have",
            "into",
            "latest",
            "more",
            "news",
            "over",
            "players",
            "player",
            "their",
            "there",
            "these",
            "they",
            "this",
            "through",
            "under",
            "update",
            "updates",
            "with",
            "would",
            "will",
            "been",
            "than",
            "today",
            "week",
            "weeks",
            "official",
            "current",
            "recent",
            "recently"

        ]);


    // =====================================
    // Extract Meaningful Title Words
    // =====================================

    const titleWords =
        researchTitle

            .split(/\s+/)

            .filter(

                word =>
                    word.length >= 4 &&
                    !stopWords.has(word)

            );


    if (
        titleWords.length === 0
    ) {

        return false;

    }


    // =====================================
    // Match Title Words
    // =====================================

    const matchedTitleWords =
        titleWords.filter(

            word =>
                postText.includes(word)

        );


    const titleMatchRatio =
        titleWords.length > 0

            ? matchedTitleWords.length /
              titleWords.length

            : 0;


    /*
     * Strong title overlap.
     */

    if (
        titleMatchRatio >= 0.5
    ) {

        return true;

    }


    // =====================================
    // Research Keyword Matching
    // =====================================

    const researchKeywords =
        extractResearchKeywords(
            source
        );


    const matchedKeywords =
        researchKeywords.filter(

            keyword =>
                postText.includes(keyword)

        );


    const keywordMatchRatio =
        researchKeywords.length > 0

            ? matchedKeywords.length /
              researchKeywords.length

            : 0;


    /*
     * Strong keyword overlap.
     */

    if (

        keywordMatchRatio >= 0.35 &&
        matchedKeywords.length >= 2

    ) {

        return true;

    }


    // =====================================
    // Important Title Phrase
    // =====================================

    const importantTitleWords =
        titleWords.filter(
            word =>
                word.length >= 5
        );


    if (
        importantTitleWords.length >= 2
    ) {

        const phrase =
            importantTitleWords
                .slice(0, 3)
                .join(" ");


        if (
            phrase.length >= 12 &&
            postText.includes(phrase)
        ) {

            return true;

        }

    }


    // =====================================
    // Summary Overlap
    // =====================================

    if (
        researchSummary.length > 0
    ) {

        const summaryWords =
            researchSummary

                .split(/\s+/)

                .filter(

                    word =>
                        word.length >= 5 &&
                        !stopWords.has(word)

                );


        const matchedSummaryWords =
            summaryWords.filter(

                word =>
                    postText.includes(word)

            );


        /*
         * Require several meaningful
         * summary terms before accepting
         * the source.
         */

        if (
            matchedSummaryWords.length >= 3
        ) {

            return true;

        }

    }


    return false;

}


// =====================================
// Validate Research Source Index
// =====================================

function getResearchSource(
    post,
    research,
    index
) {

    const rawIndex =
        post?.research_source_index;


    /*
     * null is allowed for posts that are
     * intentionally general.
     */

    if (

        rawIndex === null ||
        rawIndex === undefined ||
        rawIndex === ""

    ) {

        return null;

    }


    /*
     * Do not silently convert strings
     * such as "1" into integers.
     */

    if (
        !Number.isInteger(rawIndex)
    ) {

        throw new Error(

            `AI post ${index + 1} has an invalid research_source_index. ` +
            `Expected an integer or null.`

        );

    }


    if (

        rawIndex < 1 ||
        rawIndex > research.length

    ) {

        throw new Error(

            `AI post ${index + 1} references research source ${rawIndex}, ` +
            `but only ${research.length} sources exist.`

        );

    }


    return {

        sourceIndex:
            rawIndex,

        source:
            research[rawIndex - 1]

    };

}


// =====================================
// Validate Generated Post
// =====================================

function validateGeneratedPost(
    post,
    index,
    research
) {

    if (
        !post ||
        typeof post !== "object"
    ) {

        throw new Error(
            `AI post ${index + 1} is invalid.`
        );

    }


    // =====================================
    // Required Fields
    // =====================================

    if (!post.title) {

        throw new Error(
            `AI post ${index + 1} is missing a title.`
        );

    }


    if (!post.content_type) {

        throw new Error(
            `AI post ${index + 1} is missing content_type.`
        );

    }


    if (!post.category) {

        throw new Error(
            `AI post ${index + 1} is missing category.`
        );

    }


    if (!post.body) {

        throw new Error(
            `AI post ${index + 1} is missing body content.`
        );

    }


    if (!post.social_caption) {

        throw new Error(
            `AI post ${index + 1} is missing social_caption.`
        );

    }


    if (!post.image_prompt) {

        throw new Error(
            `AI post ${index + 1} is missing image_prompt.`
        );

    }


    // =====================================
    // Research Source
    // =====================================

    const sourceResult =
        getResearchSource(
            post,
            research,
            index
        );


    const source =
        sourceResult?.source || null;


    const sourceIndex =
        sourceResult?.sourceIndex || null;


    // =====================================
    // Required Research Days
    // =====================================

    /*
     * Monday    = index 0
     * Thursday  = index 3
     * Friday    = index 4
     * Sunday    = index 6
     */

    const requiresResearch =
        (
            index === 0 ||
            index === 3 ||
            index === 4 ||
            index === 6
        );


    if (
        requiresResearch &&
        !source
    ) {

        throw new Error(

            `AI post ${index + 1} requires research-backed content.`

        );

    }


    // =====================================
    // Verify Research Match
    // =====================================

    if (source) {

        let matchedSource = source;
        let matchedSourceIndex = sourceIndex;

        const supported =
            researchSupportsPost(
                post,
                source
            );

        /*
         * If the AI selected the wrong research source,
         * search the available research for a better match.
         */
        if (!supported) {

            for (let i = 0; i < research.length; i++) {

                if (
                    i === sourceIndex - 1
                ) {
                    continue;
                }

                if (
                    researchSupportsPost(
                        post,
                        research[i]
                    )
                ) {

                    matchedSource =
                        research[i];

                    matchedSourceIndex =
                        i + 1;

                    break;

                }

            }

        }

        if (
            !researchSupportsPost(
                post,
                matchedSource
            )
        ) {

            throw new Error(

                `AI post ${index + 1} does not match any available research source. ` +
                `AI selected source ${sourceIndex}: "${source.title}"`

            );

        }

        /*
         * Correct the source index selected by the AI.
         */
        post.research_source_index =
            matchedSourceIndex;

    }


    // =====================================
    // Prevent Unsupported Current Games
    // =====================================

    const fullPostText =
        normalizeResearchText(

            [
                post.title || "",
                post.body || "",
                post.social_caption || ""

            ].join(" ")

        );


    /*
     * A research-backed post is checked
     * against its source above.
     *
     * Posts without a research source
     * are allowed only when their content
     * is genuinely generic.
     */


    // =====================================
    // Prevent Outdated Year
    // =====================================

    if (
        fullPostText.includes("2024")
    ) {

        throw new Error(

            `AI post ${index + 1} contains the outdated year 2024.`

        );

    }


    // =====================================
    // Prevent 2025 As Current Content
    // =====================================

    /*
     * 2025 can be mentioned when discussing
     * history, but this catches the common
     * hallucination pattern where the AI
     * treats 2025 information as current.
     */

    const current2025Patterns = [

        /in 2025,?/i,
        /during 2025,?/i,
        /this 2025/i,
        /currently in 2025/i,
        /latest in 2025/i

    ];


    for (
        const pattern of current2025Patterns
    ) {

        if (
            pattern.test(
                fullPostText
            )
        ) {

            throw new Error(

                `AI post ${index + 1} contains outdated 2025 current-content language.`

            );

        }

    }


    // =====================================
    // Prevent Development / Placeholder
    // =====================================

    const forbiddenPatterns = [

        /\[dev\]/i,

        /development mode/i,

        /development preview/i,

        /placeholder/i,

        /test content/i,

        /fictional game/i,

        /mock content/i,

        /dummy content/i,

        /sample content/i

    ];


    for (
        const pattern of forbiddenPatterns
    ) {

        if (
            pattern.test(
                fullPostText
            )
        ) {

            throw new Error(

                `AI post ${index + 1} contains development or placeholder content.`

            );

        }

    }


    // =====================================
    // Allowed Content Types
    // =====================================

    const allowedContentTypes =
        new Set([

            "article",
            "gaming_news",
            "gaming_gear",
            "poll",
            "gaming_recommendation",
            "gaming_tips",
            "weekly_roundup"

        ]);


    if (
        !allowedContentTypes.has(
            post.content_type
        )
    ) {

        throw new Error(

            `AI post ${index + 1} has invalid content_type: ` +
            `"${post.content_type}"`

        );

    }


    // =====================================
    // Allowed Categories
    // =====================================

    const allowedCategories =
        new Set([

            "Games",
            "Gear",
            "Community",
            "Recommendations"

        ]);


    if (
        !allowedCategories.has(
            post.category
        )
    ) {

        throw new Error(

            `AI post ${index + 1} has invalid category: ` +
            `"${post.category}"`

        );

    }


    // =====================================
    // Return Clean Post
    // =====================================

    return {

        ...post,

        title:
            cleanAIText(post.title),

        body:
            cleanAIText(post.body),

        social_caption:
            cleanAIText(post.social_caption),

        image_prompt:
            cleanAIText(post.image_prompt),

        sourceIndex,

        source_url:
            source?.url || null

    };

}


// =====================================
// PulseAI Development Generator
// =====================================

function generateDevelopmentArticle(topic) {

    const safeTopic =
        topic ||
        "Gaming Industry Updates";


    return {

        title:
            `[DEV] ${safeTopic}`,

        metaDescription:
            `Development preview for PulsePlay covering ${safeTopic}.`,

        article:

`# ${safeTopic}

## Development Preview

This article was generated by PulseAI Development Mode.

PulsePlay is testing its AI content pipeline using local development content so the complete publishing system can be tested without making OpenAI API calls.

## Gaming Overview

The topic being tested is:

**${safeTopic}**

This development article is intentionally generated locally.

It does not claim to contain verified breaking news, official announcements, release dates, statistics, or developer statements.

## PulsePlay Analysis

The production AI system generates researched and structured gaming content for PulsePlay.online.

During development, this placeholder allows us to test:

- AI content generation
- Queue creation
- Supabase storage
- Editing
- Approval
- Publishing
- Dashboard analytics
- Social content handling

## Community Discussion

What would you want PulsePlay to cover about ${safeTopic}?

## Final Thoughts

PulsePlay Development Mode is working correctly.

This content was generated locally and did not use OpenAI credits.`,

        facebookPost:
            `[DEV] PulsePlay is testing AI content generation for ${safeTopic}. What would you want us to cover about this topic? #PulsePlay #Gaming`,

        imagePrompt:
            `PulsePlay dark neon gaming artwork representing ${safeTopic}, cinematic lighting, futuristic gaming atmosphere, cyberpunk-inspired environment, no logos, no text.`,

        hashtags: [


            "#PulsePlay",
            "#Gaming",
            "#VideoGames"

        ]

    };

}


// =====================================
// PulseAI Development Weekly Generator
// =====================================

function generateDevelopmentWeeklyContent() {

    const dates =
        getUpcomingDates();


    const schedule = [

        [
            "Game Spotlight",
            "Games",
            "article"
        ],

        [
            "Gaming Gear Guide",
            "Gear",
            "gaming_gear"
        ],

        [
            "Community Poll",
            "Community",
            "poll"
        ],

        [
            "Gaming News & Updates",
            "Games",
            "gaming_news"
        ],

        [
            "Weekend Gaming Picks",
            "Recommendations",
            "gaming_recommendation"
        ],

        [
            "Gaming Tips & Tricks",
            "Games",
            "gaming_tips"
        ],

        [
            "Weekly Gaming Roundup",
            "Community",
            "weekly_roundup"
        ]

    ];


    const titles = [

        "Development Game Spotlight",
        "Development Gaming Gear Guide",
        "Development Community Poll",
        "Development Gaming News & Updates",
        "Development Weekend Gaming Picks",
        "Development Gaming Tips & Tricks",
        "Development Weekly Gaming Roundup"

    ];


    return schedule.map(

        (
            [
                contentType,
                category,
                type
            ],
            index
        ) => ({

            title:
                `[DEV] ${titles[index]}`,

            content_type:
                type,

            category,

            body:

`# ${titles[index]}

## PulseAI Development Mode

This is locally generated development content for testing the PulsePlay AI publishing pipeline.

Content type: ${contentType}

This test content does not use OpenAI and does not represent verified gaming news.`,

            social_caption:
                `[DEV] PulsePlay AI is testing the ${contentType} pipeline. What do you think? #PulsePlay #Gaming`,

            image_prompt:
                `PulsePlay dark neon gaming artwork for ${contentType}, cinematic lighting, futuristic gaming environment, cyberpunk aesthetic, no text, no logos.`,

            hashtags: [


                "#PulsePlay",
                "#Gaming",
                "#VideoGames"

            ],


            source_url:
                null,

            scheduled_date:
                Object.values(dates)[index],

            status:
                "pending"

        })

    );

}


// =====================================
// Generate Single Article
// =====================================

export async function generateArticle(
    topic
) {

    /*
     * Development mode intentionally bypasses
     * OpenAI so local testing does not consume
     * API credits.
     */

    if (
        !isAIProductionMode()
    ) {

        console.log(
            "PULSEAI DEVELOPMENT MODE: local article generator"
        );


        return generateDevelopmentArticle(
            topic
        );

    }


    const today =
        new Date().toLocaleDateString(
            "en-US",
            {
                weekday: "long"
            }
        );


    const schedule =
        weeklySchedule[today];


    const articlePrompt = [

        "You are the PulsePlay AI Content Manager.",

        "",

        "Create premium gaming content for PulsePlay.online.",

        "",

        "The content must be useful, engaging, accurate, and written for real gamers.",

        "",

        "CURRENT YEAR: 2026",

        "",

        "Schedule:",

        "",

        "Day:",
        today,

        "",

        "Website Content Type:",
        schedule?.website || "",

        "",

        "Facebook Purpose:",
        schedule?.facebook || "",

        "",

        "Topic:",
        topic || "",

        "",


        // =====================================
        // ACCURACY RULES
        // =====================================

        "STRICT ACCURACY RULES:",

        "",

        "- Never invent gaming news.",

        "- Never invent release dates.",

        "- Never invent developer or publisher statements.",

        "- Never invent quotes.",

        "- Never invent statistics.",

        "- Never invent game features.",

        "- Never invent patches or updates.",

        "- Never present speculation as confirmed fact.",

        "- Never claim something is current unless supported by reliable information.",

        "- Do not use 2024 as the current year.",

        "- Do not present 2025 information as current.",

        "- The current year is 2026.",

        "",


        // =====================================
        // OUTPUT
        // =====================================

        "Return JSON ONLY.",

        "",

        "FORMAT:",

        "",

        "{",

        '  "title": "",',

        '  "metaDescription": "",',

        '  "article": "",',

        '  "facebookPost": "",',

        '  "imagePrompt": "",',

        '  "hashtags": []',

        "}",

        "",


        // =====================================
        // ARTICLE REQUIREMENTS
        // =====================================

        "REQUIREMENTS:",

        "",

        "TITLE:",

        "Create an SEO-friendly gaming headline.",

        "",

        "META DESCRIPTION:",

        "Write a compelling SEO meta description.",

        "",

        "ARTICLE:",

        "Write approximately 800-1200 words when the content type is an article.",

        "",

        "Use:",

        "- A strong introduction",

        "- Clear section headings",

        "- Useful gaming information",

        "- Analysis or practical information",

        "- A natural community discussion question",

        "- Relevant SEO keywords",

        "",

        "COMMUNITY POLLS:",

        "If the content type is a community poll, create a concise discussion-focused post and a clear question with possible responses.",

        "",

        "GAMING NEWS:",

        "Focus on meaningful developments and avoid sensationalism.",

        "",

        "GAMING TIPS:",

        "Provide practical information gamers can actually use.",

        "",

        "FACEBOOK:",

        "Create an engagement-focused social post that encourages discussion without sounding like an advertisement.",

        "",

        "IMAGE PROMPT:",

        "Create a detailed cinematic gaming artwork prompt following the PulsePlay visual identity.",

        "",

        "HASHTAGS:",

        "Return relevant gaming hashtags as an array.",

        "",

        "Brand:",
        pulsePlayBrand

    ].join("\n");


    try {

        const response =
            await openai.chat.completions.create({

                model:
                    AI_MODEL,

                response_format: {
                    type: "json_object"
                },

                messages: [

                    {
                        role: "system",

                        content:
                            pulsePlayBrand
                    },

                    {
                        role: "user",

                        content:
                            articlePrompt
                    }

                ]

            });


        return parseAIResponse(

            response
                .choices[0]
                .message
                .content

        );

    } catch (error) {

        console.error(
            "AI ARTICLE GENERATION ERROR:",
            error
        );

        throw error;

    }

}


// =====================================
// Generate Weekly Package
// =====================================

export async function generateWeeklyContent() {

    /*
     * Development mode
     * ---------------------------------
     * Do not call OpenAI or live research.
     */

    if (
        !isAIProductionMode()
    ) {

        console.log(
            "PULSEAI DEVELOPMENT MODE: generating local weekly package"
        );


        return generateDevelopmentWeeklyContent();

    }


    try {

        const dates =
            getUpcomingDates();


        // =====================================
        // LIVE GAMING RESEARCH
        // =====================================

        console.log(
            "================================="
        );

        console.log(
            "STARTING LIVE GAMING RESEARCH"
        );

        console.log(
            "================================="
        );


        const research =
            await researchGamingNews();


        console.log(
            "Research articles available:",
            research?.length || 0
        );


        /*
         * Never generate a production weekly
         * package without research.
         */

        if (
            !research ||
            research.length === 0
        ) {

            throw new Error(

                "No gaming research sources were returned. " +
                "Weekly content generation stopped to prevent unsupported content."

            );

        }


        // =====================================
        // Clean Research Sources
        // =====================================

        const validResearch =
            research.filter(

                item =>
                    item &&
                    item.title &&
                    item.summary &&
                    item.url

            );


        if (
            validResearch.length === 0
        ) {

            throw new Error(

                "Gaming research returned no usable sources. " +
                "Weekly content generation stopped."

            );

        }


        console.log(
            "Usable research sources:",
            validResearch.length
        );


        // =====================================
        // Build Research Context
        // =====================================

        const researchContext =
            validResearch

                .map(

                    (
                        item,
                        index
                    ) => [

                        `SOURCE ${index + 1}`,

                        `Source: ${
                            item.source || "Unknown"
                        }`,

                        `Title: ${
                            item.title
                        }`,

                        `Published: ${
                            item.published_at || "Unknown"
                        }`,

                        `URL: ${
                            item.url
                        }`,

                        `Summary: ${
                            item.summary
                        }`,

                        ""

                    ].join("\n")

                )

                .join("\n");


        console.log(
            "RESEARCH CONTEXT:"
        );


        console.log(
            researchContext
        );


        // =====================================
        // Weekly AI Prompt
        // =====================================

        const weeklyPrompt = [

            "You are the PulsePlay AI Weekly Content Manager.",

            "",

            "Your job is to create exactly 7 high-quality gaming content items for PulsePlay.online.",

            "",

            "You MUST create exactly ONE item for each scheduled day.",

            "",


            // =====================================
            // CURRENT YEAR
            // =====================================

            "=================================",

            "CURRENT DATE RULE",

            "=================================",

            "",

            "The current year is 2026.",

            "Treat 2026 as the current year.",

            "Do not describe 2024 or 2025 information as current.",

            "Do not invent dates.",

            "",


            // =====================================
            // RESEARCH
            // =====================================

            "=================================",

            "CURRENT RESEARCH DATA",

            "=================================",

            "",

            researchContext,

            "",


            // =====================================
            // ABSOLUTE RESEARCH RULES
            // =====================================

            "=================================",

            "ABSOLUTE RESEARCH RULES",

            "=================================",

            "",

            "The CURRENT RESEARCH DATA above is the ONLY factual source you may use for current gaming news.",

            "",

            "You may NOT use your training knowledge to create current factual claims.",

            "",

            "You may NOT invent:",

            "- games",

            "- announcements",

            "- patches",

            "- updates",

            "- DLC",

            "- release dates",

            "- events",

            "- companies",

            "- developers",

            "- publishers",

            "- statistics",

            "- player counts",

            "- sales numbers",

            "- features",

            "- platform availability",

            "- community reactions",

            "- quotes",

            "- statements",

            "- esports results",

            "- hardware announcements",

            "- product specifications",

            "",

            "If a fact is not supported by CURRENT RESEARCH DATA, do not state it as fact.",

            "",

            "Do not fill missing information with general knowledge.",

            "",

            "Do not guess.",

            "",


            // =====================================
            // GAME TITLE RULE
            // =====================================

            "GAME TITLE RULE:",

            "",

            "A specific game may only be used as a current research-backed topic if that game appears in one of the supplied research sources.",

            "",

            "If a game does not appear in CURRENT RESEARCH DATA, do not present it as current news.",

            "",

            "Do not invent a game merely to fill the weekly schedule.",

            "",


            // =====================================
            // SOURCE INDEX RULE
            // =====================================

            "=================================",

            "RESEARCH SOURCE INDEX RULE",

            "=================================",

            "",

            "Every research-backed post MUST include research_source_index.",

            "",

            "research_source_index MUST be a JSON integer.",

            "",

            "The number MUST correspond exactly to one of the SOURCE numbers above.",

            "",

            "Valid examples:",

            "1",

            "2",

            "3",

            "",

            "Invalid examples:",

            '"1"',

            '"SOURCE 1"',

            '"source 1"',

            "0",

            "99",

            "",

            "NEVER invent a source number.",

            "",

            "NEVER create source_url in the AI response.",

            "",

            "The backend will create source_url from research_source_index.",

            "",


            // =====================================
            // SOURCE MATCHING
            // =====================================

            "SOURCE MATCHING RULE:",

            "",

            "The selected research_source_index must actually support the claims made in that post.",

            "",

            "Do not select a source simply because its topic is vaguely similar.",

            "",

            "The game, event, update, announcement, or development discussed must be supported by the selected source.",

            "",


            // =====================================
            // MONDAY
            // =====================================

            "MONDAY:",

            "",

            "Content Type: article",

            "Category: Games",

            "Theme: Game Spotlight",

            "",

            "Choose a specific game ONLY if that game appears in CURRENT RESEARCH DATA.",

            "",

            "The article must be supported by the selected research source.",

            "",

            "research_source_index is REQUIRED when a specific current game is discussed.",

            "",


            // =====================================
            // TUESDAY
            // =====================================

            "TUESDAY:",

            "",

            "Content Type: gaming_gear",

            "Category: Gear",

            "Theme: Gaming Gear Guide",

            "",

            "General gaming hardware advice is allowed.",

            "",

            "Do not claim a specific current product, price, specification, release, or announcement unless supported by research.",

            "",

            "research_source_index may be null for completely general advice.",

            "",


            // =====================================
            // WEDNESDAY
            // =====================================

            "WEDNESDAY:",

            "",

            "Content Type: poll",

            "Category: Community",

            "Theme: Community Poll",

            "",

            "Create an engaging question for gamers.",

            "",

            "The poll may be completely opinion-based.",

            "",

            "Avoid unsupported current factual claims.",

            "",

            "research_source_index may be null.",

            "",


            // =====================================
            // THURSDAY
            // =====================================

            "THURSDAY:",

            "",

            "Content Type: gaming_news",

            "Category: Games",

            "Theme: Gaming News & Updates",

            "",

            "This MUST be based directly on CURRENT RESEARCH DATA.",

            "",

            "Choose one meaningful current gaming development.",

            "",

            "research_source_index is REQUIRED.",

            "",

            "The selected source must directly support the article.",

            "",


            // =====================================
            // FRIDAY
            // =====================================

            "FRIDAY:",

            "",

            "Content Type: gaming_recommendation",

            "Category: Recommendations",

            "Theme: Weekend Gaming Picks",

            "",

            "Recommend a game only if you can safely support any current factual claims.",

            "",

            "If recommending a game from current research, use its correct research_source_index.",

            "",

            "Do not invent current availability, release status, updates, DLC, prices, or platform information.",

            "",

            "research_source_index is REQUIRED when the recommendation relies on current research.",

            "",


            // =====================================
            // SATURDAY
            // =====================================

            "SATURDAY:",

            "",

            "Content Type: gaming_tips",

            "Category: Games",

            "Theme: Gaming Tips & Tricks",

            "",

            "Provide useful general gaming advice.",

            "",

            "Do not invent game-specific mechanics.",

            "",

            "If game-specific advice is provided, the game must be supported by research.",

            "",

            "research_source_index may be null for generic advice.",

            "",


            // =====================================
            // SUNDAY
            // =====================================

            "SUNDAY:",

            "",

            "Content Type: weekly_roundup",

            "Category: Community",

            "Theme: Weekly Gaming Roundup",

            "",

            "Summarize ONLY developments appearing in CURRENT RESEARCH DATA.",

            "",

            "Do not add unrelated games or stories from general knowledge.",

            "",

            "research_source_index is REQUIRED.",

            "",

            "The selected source must support the main topic of the roundup.",

            "",


            // =====================================
            // CONTENT QUALITY
            // =====================================

            "=================================",

            "CONTENT QUALITY",

            "=================================",

            "",

            "Every item must be substantially different.",

            "",

            "Avoid generic filler.",

            "",

            "Write naturally for real gamers.",

            "",

            "Encourage genuine community discussion.",

            "",

            "Do not sensationalize.",

            "",

            "Do not fabricate quotes.",

            "",

            "Do not fabricate statistics.",

            "",

            "Do not fabricate community reactions.",

            "",


            // =====================================
            // SOCIAL CONTENT
            // =====================================

            "FACEBOOK:",

            "",

            "Create an engaging social caption for each item.",

            "",

            "The caption should encourage comments and discussion.",

            "",

            "Do not make unsupported factual claims in the social caption.",

            "",


            // =====================================
            // IMAGE PROMPTS
            // =====================================

            "IMAGE PROMPT:",

            "",

            "Create a cinematic gaming artwork prompt matching the PulsePlay dark/neon visual identity.",

            "",

            "Use dark backgrounds with neon purple and cyan lighting.",

            "",

            "Do not include text or logos.",

            "",


            // =====================================
            // HASHTAGS
            // =====================================

            "HASHTAGS:",

            "",

            "Return relevant gaming hashtags as a JSON array.",

            "",


            // =====================================
            // OUTPUT
            // =====================================

            "=================================",

            "OUTPUT FORMAT",

            "=================================",

            "",

            "Return ONLY valid JSON.",

            "",

            "{",

            '  "posts": [',

            "    {",

            '      "title": "",',

            '      "content_type": "",',

            '      "category": "",',

            '      "body": "",',

            '      "social_caption": "",',

            '      "image_prompt": "",',

            '      "hashtags": [],',

            '      "research_source_index": null',

            "    }",

            "  ]",

            "}",

            "",

            "The posts array MUST contain exactly 7 objects.",

            "",

            "The objects MUST appear in this order:",

            "",

            "1. Monday",

            "2. Tuesday",

            "3. Wednesday",

            "4. Thursday",

            "5. Friday",

            "6. Saturday",

            "7. Sunday",

            "",

            "Brand:",

            pulsePlayBrand

        ].join("\n");


        // =====================================
        // OpenAI Request
        // =====================================

        const response =
            await openai.chat.completions.create({

                model:
                    AI_MODEL,

                response_format: {
                    type: "json_object"
                },

                messages: [

                    {
                        role: "system",

                        content:
                            pulsePlayBrand

                    },

                    {
                        role: "user",

                        content:
                            weeklyPrompt

                    }

                ]

            });


        // =====================================
        // Parse Result
        // =====================================

        const result =
            parseAIResponse(

                response
                    .choices[0]
                    .message
                    .content

            );


        console.log(
            "AI RAW PARSED RESULT:",
            JSON.stringify(
                result,
                null,
                2
            )
        );


        // =====================================
        // Validate Seven Posts
        // =====================================

        const generatedPosts =
            Array.isArray(
                result.posts
            )

                ? result.posts.slice(
                    0,
                    7
                )

                : [];


        if (
            generatedPosts.length !== 7
        ) {

            throw new Error(

                `AI must generate exactly 7 posts. ` +
                `Received ${generatedPosts.length}.`

            );

        }


        // =====================================
        // Required Research Posts
        // =====================================

        /*
         * Monday
         * Thursday
         * Friday
         * Sunday
         *
         * These days must be research-backed.
         */

        const requiredResearchDays =
            new Set([

                0,
                3,
                4,
                6

            ]);


        // =====================================
        // Validate All Seven Posts
        // =====================================

        const posts =
            generatedPosts.map(

                (
                    post,
                    index
                ) => {


                    // =====================================
                    // Validate Generated Post
                    // =====================================

                    const validatedPost =
                        validateGeneratedPost(

                            post,
                            index,
                            validResearch

                        );


                    // =====================================
                    // Ensure Required Research
                    // =====================================

                    if (

                        requiredResearchDays.has(index) &&

                        !validatedPost.research_source_index

                    ) {

                        throw new Error(

                            `AI post ${index + 1} must be research-backed.`

                        );

                    }


                    // =====================================
                    // Final Post
                    // =====================================

                    return {

                        ...validatedPost,

                        scheduled_date:
                            Object.values(
                                dates
                            )[index],

                        status:
                            "pending"

                    };

                }

            );


        // =====================================
        // Final Weekly Validation
        // =====================================

        if (
            posts.length !== 7
        ) {

            throw new Error(

                `Weekly generation failed validation. ` +
                `Expected 7 posts, received ${posts.length}.`

            );

        }


        // =====================================
        // Validate Day Order
        // =====================================

        const expectedTypes = [

            "article",
            "gaming_gear",
            "poll",
            "gaming_news",
            "gaming_recommendation",
            "gaming_tips",
            "weekly_roundup"

        ];


        posts.forEach(

            (
                post,
                index
            ) => {

                if (
                    post.content_type !==
                    expectedTypes[index]
                ) {

                    throw new Error(

                        `AI post ${index + 1} has incorrect content_type. ` +
                        `Expected "${expectedTypes[index]}", ` +
                        `received "${post.content_type}".`

                    );

                }

            }

        );


        // =====================================
        // Log Validation Success
        // =====================================

        console.log(
            "================================="
        );

        console.log(
            "AI WEEKLY POSTS VALIDATED:",
            posts.length
        );

        console.log(
            "================================="
        );


        posts.forEach(

            (
                post,
                index
            ) => {

                console.log(

                    `POST ${index + 1}:`,
                    post.title,
                    "| source:",
                    post.research_source_index,
                    "| scheduled:",
                    post.scheduled_date

                );

            }

        );


        return posts;


    } catch (error) {

        console.error(
            "================================="
        );

        console.error(
            "WEEKLY AI ERROR:"
        );

        console.error(
            error
        );

        console.error(
            "================================="
        );

        throw error;

    }

}
// =====================================
// Generate Queue Image
// =====================================

export async function generateQueueImage(item) {

    if (!item) {

        throw new Error(
            "AI queue item is required."
        );

    }

    if (!item.id) {

        throw new Error(
            "AI queue item ID is required."
        );

    }

    const imagePrompt =
        item.image_prompt ||
        item.imagePrompt;

    if (!imagePrompt) {

        throw new Error(
            "AI queue item does not contain an image prompt."
        );

    }

    console.log(
        "Generating AI image for queue item:",
        item.id
    );

    try {

        const imageUrl =
            await generateImage(
                imagePrompt
            );

        if (!imageUrl) {

            throw new Error(
                "Image generation returned no image URL."
            );

        }

        const {
            data,
            error
        } =
            await supabase
                .from("ai_content_queue")
                .update({
                    image_url:
                        imageUrl
                })
                .eq(
                    "id",
                    item.id
                )
                .select()
                .single();

        if (error) {

            console.error(
                "AI queue image database update error:",
                error
            );

            throw new Error(
                `Failed to save generated image: ${error.message}`
            );

        }

        console.log(
            "AI queue image generated successfully:",
            item.id
        );

        return data;

    } catch (error) {

        console.error(
            "AI QUEUE IMAGE ERROR:",
            error
        );

        throw error;

    }

}

// =====================================
// Generate And Save Weekly Content
// =====================================

export async function generateAndSaveWeeklyContent() {

    console.log(
        "================================="
    );

    console.log(
        "GENERATING WEEKLY CONTENT"
    );

    console.log(
        "================================="
    );


    try {

        const posts =
            await generateWeeklyContent();


        if (
            !Array.isArray(posts) ||
            posts.length !== 7
        ) {

            throw new Error(
                `Weekly content generation failed. Expected 7 posts, received ${posts?.length || 0}.`
            );

        }


        const savedPosts = [];


        // =====================================
        // Save To AI Queue
        // =====================================

        for (
            const post of posts
        ) {

            console.log(
                "Saving weekly post:",
                post.title
            );


            const {
                data,
                error
            } =
                await supabase
                    .from("ai_content_queue")
                    .insert({

                        title:
                            post.title,

                        content_type:
                            post.content_type,

                        category:
                            post.category,

                        body:
                            post.body,

                        social_caption:
                            post.social_caption || null,

                        image_prompt:
                            post.image_prompt || null,

                        hashtags:
                            post.hashtags || null,

                        research_source_index:
                            post.research_source_index || null,

                        source_url:
                            post.source_url || null,

                        scheduled_date:
                            post.scheduled_date,

                        status:
                            "pending",

                        image_url:
                            post.image_url || null

                    })
                    .select()
                    .single();


            if (error) {

                console.error(
                    "================================="
                );

                console.error(
                    "SUPABASE AI QUEUE SAVE ERROR"
                );

                console.error(
                    "================================="
                );

                console.error(
                    "POST TITLE:",
                    post.title
                );

                console.error(
                    "POST KEYS:",
                    Object.keys(post)
                );

                console.error(
                    "POST OBJECT:",
                    JSON.stringify(post, null, 2)
                );

                console.error(
                    "SUPABASE ERROR MESSAGE:",
                    error.message
                );

                console.error(
                    "SUPABASE ERROR CODE:",
                    error.code
                );

                console.error(
                    "SUPABASE ERROR DETAILS:",
                    error.details
                );

                console.error(
                    "SUPABASE ERROR HINT:",
                    error.hint
                );

                throw new Error(
                    `Failed to save AI post "${post.title}": ${error.message}`
                );

            }


            savedPosts.push(
                data
            );

        }


        console.log(
            "================================="
        );

        console.log(
            "PULSEAI WEEKLY CONTENT SAVED:",
            savedPosts.length
        );

        console.log(
            "================================="
        );


        return savedPosts;


    } catch (error) {

        console.error(
            "================================="
        );

        console.error(
            "GENERATE AND SAVE WEEKLY CONTENT ERROR:"
        );

        console.error(
            error
        );

        console.error(
            "================================="
        );

        throw error;

    }

}
