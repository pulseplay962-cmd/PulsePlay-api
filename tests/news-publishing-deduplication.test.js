import test from "node:test";
import assert from "node:assert/strict";
import { findDuplicateArticle } from "../services/ai/newsPublishingDeduplication.js";

test("detects the same source URL despite tracking parameters and trailing slash", () => {
    const result = findDuplicateArticle(
        { title: "A different headline", source_url: "https://example.com/story/?utm_source=feed#top" },
        [{ title: "Original headline", source_url: "https://example.com/story" }]
    );
    assert.equal(result?.code, "DUPLICATE_ARTICLE");
    assert.equal(result?.match, "source_url");
});

test("detects exact titles despite punctuation and capitalization differences", () => {
    const result = findDuplicateArticle(
        { title: "New Game: Launch Date Revealed!", source_url: "https://example.com/new" },
        [{ title: "NEW GAME LAUNCH DATE REVEALED", source_url: "https://example.com/old" }]
    );
    assert.equal(result?.match, "title");
});

test("detects near-duplicate titles with minor wording differences", () => {
    const result = findDuplicateArticle(
        { title: "Studio announces major update for popular fantasy adventure game", source_url: "https://example.com/new" },
        [{ title: "Studio announces a major update for popular fantasy adventure game", source_url: "https://example.com/old" }]
    );
    assert.equal(result?.match, "similar_title");
});

test("does not treat two empty source URLs as a duplicate", () => {
    const result = findDuplicateArticle(
        { title: "A completely new gaming story headline", source_url: "" },
        [{ title: "An unrelated hardware review article", source_url: "" }]
    );
    assert.equal(result, null);
});

test("allows a genuinely different article", () => {
    const result = findDuplicateArticle(
        { title: "Indie studio announces new cooperative survival game", source_url: "https://example.com/new-game" },
        [{ title: "Portable monitor review with touch support and hub", source_url: "https://example.com/monitor" }]
    );
    assert.equal(result, null);
});
