import fetch from "node-fetch";

/**
 * PulseAI Gaming Research Service
 *
 * Fetches current gaming news and release information
 * from multiple public RSS feeds.
 *
 * This service researches facts.
 * It does NOT generate content.
 */

const NEWS_SOURCES = [
    {
        name: "Gematsu",
        url: "https://www.gematsu.com/feed"
    },
    {
        name: "Eurogamer",
        url: "https://www.eurogamer.net/feed"
    },
    {
        name: "PlayStation Blog",
        url: "https://blog.playstation.com/feed/"
    },
    {
        name: "Xbox Wire",
        url: "https://news.xbox.com/en-us/feed/"
    },
    {
        name: "PC Gamer",
        url: "https://www.pcgamer.com/rss/"
    },
    {
        name: "GamesRadar",
        url: "https://www.gamesradar.com/rss/"
    },
    {
        name: "Nintendo Life",
        url: "https://www.nintendolife.com/feeds/latest"
    }
];

const ARTICLES_PER_SOURCE = 75;

function decodeHtml(text = "") {

    return text
        .replace(/<!\[CDATA\[|\]\]>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#8220;/gi, '"')
        .replace(/&#8221;/gi, '"')
        .replace(/&#8216;/gi, "'")
        .replace(/&#8217;/gi, "'")
        .replace(/&#8230;/gi, "...")
        .replace(/&#39;/gi, "'")
        .replace(/&apos;/gi, "'")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function getTag(xml, tag) {

    const match =
        xml.match(
            new RegExp(
                `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
                "i"
            )
        );

    return match
        ? decodeHtml(match[1])
        : "";
}

function getItems(xml) {

    return (
        xml.match(
            /<item[\s\S]*?<\/item>/gi
        ) || []
    );
}

function normalizeUrl(url = "") {

    return String(url)
        .trim()
        .replace(/&amp;/gi, "&");
}

async function fetchSource(source) {

    try {

        console.log(
            `RESEARCH SOURCE: ${source.name}`
        );

        const response =
            await fetch(
                source.url,
                {
                    headers: {
                        "User-Agent":
                            "PulsePlay-PulseAI/1.0"
                    }
                }
            );

        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );

        }

        const xml =
            await response.text();

        const items =
            getItems(xml)
                .slice(
                    0,
                    ARTICLES_PER_SOURCE
                );

        const articles =
            items
                .map(item => ({

                    source:
                        source.name,

                    title:
                        getTag(
                            item,
                            "title"
                        ),

                    url:
                        normalizeUrl(
                            getTag(
                                item,
                                "link"
                            )
                        ),

                    published_at:
                        getTag(
                            item,
                            "pubDate"
                        ),

                    summary:
                        getTag(
                            item,
                            "description"
                        )

                }))
                .filter(item =>
                    item.title &&
                    item.url
                );

        console.log(
            `${source.name}: ${articles.length} articles`
        );

        return articles;

    } catch (error) {

        console.error(
            `Research source failed: ${source.name}`,
            error.message
        );

        return [];
    }
}

function deduplicateArticles(articles) {

    const seen = new Set();

    return articles.filter(article => {

        const key =
            article.url ||
            article.title
                .toLowerCase()
                .trim();

        if (seen.has(key)) {

            return false;
        }

        seen.add(key);

        return true;
    });
}

export async function researchGamingNews() {

    console.log(
        "================================="
    );

    console.log(
        "PULSEAI GAMING RESEARCH"
    );

    console.log(
        "================================="
    );

    console.log(
        "RESEARCH SOURCES:",
        NEWS_SOURCES.length
    );

    const results =
        await Promise.all(
            NEWS_SOURCES.map(
                fetchSource
            )
        );

    const articles =
        deduplicateArticles(
            results
                .flat()
                .filter(article =>
                    article.title &&
                    article.url
                )
        );

    console.log(
        "RESEARCH ARTICLES:",
        articles.length
    );

    return articles;
}
