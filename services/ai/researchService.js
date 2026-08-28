import fetch from "node-fetch";

/**
 * PulseAI Gaming Research Service
 *
 * Fetches current gaming news from public RSS feeds.
 * This service researches facts; it does NOT generate content.
 */

const NEWS_SOURCES = [
    {
        name: "Gematsu",
        url: "https://www.gematsu.com/feed"
    },
    {
        name: "Eurogamer",
        url: "https://www.eurogamer.net/feed"
    }
];

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

async function fetchSource(source) {

    try {

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

        return getItems(xml)
            .slice(0, 15)
            .map(item => ({

                source:
                    source.name,

                title:
                    getTag(item, "title"),

                url:
                    getTag(item, "link"),

                published_at:
                    getTag(item, "pubDate"),

                summary:
                    getTag(item, "description")

            }))
            .filter(item =>
                item.title &&
                item.url
            );

    } catch (error) {

        console.error(
            `Research source failed: ${source.name}`,
            error.message
        );

        return [];
    }
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

    const results =
        await Promise.all(
            NEWS_SOURCES.map(fetchSource)
        );

    const articles =
        results
            .flat()
            .filter(article =>
                article.title &&
                article.url
            );

    console.log(
        "RESEARCH ARTICLES:",
        articles.length
    );

    return articles;
}
