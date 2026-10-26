import test from "node:test";
import assert from "node:assert/strict";
import { assessNewsQuality } from "../services/ai/newsQualityReview.js";

const now = Date.parse("2026-10-26T12:00:00Z");
const freshDate = "2026-10-25T12:00:00Z";
const usefulSummary = "The publisher announced updated sales figures and shared details about the game's current worldwide performance.";

test("flags missing or invalid publication dates for human review", () => {
    assert.ok(assessNewsQuality({ title: "New game update announced", summary: usefulSummary }, { now }).flags.some(flag => flag.code === "missing_publish_date"));
    assert.ok(assessNewsQuality({ title: "New game update announced", summary: usefulSummary, published_at: "not-a-date" }, { now }).flags.some(flag => flag.code === "invalid_publish_date"));
});

test("flags stories older than the configured freshness window", () => {
    const result = assessNewsQuality({
        title: "Game update announced",
        summary: usefulSummary,
        published_at: "2026-10-10T12:00:00Z"
    }, { now });
    assert.ok(result.flags.some(flag => flag.code === "stale_story"));
});

test("flags summaries that are too thin to support headline review", () => {
    const result = assessNewsQuality({
        title: "Phantom Blade Zero review",
        summary: "Kungfupunk might be my next favorite genre",
        published_at: freshDate
    }, { now });
    assert.ok(result.flags.some(flag => flag.code === "thin_summary"));
});

test("flags dramatic headlines without asserting that the claim is false", () => {
    const result = assessNewsQuality({
        title: "Fans petition to save the series after studio demise",
        summary: usefulSummary,
        published_at: freshDate
    }, { now });
    assert.ok(result.flags.some(flag => flag.code === "strong_headline_claim"));
    assert.equal(result.flags.every(flag => flag.severity === "review"), true);
});

test("flags time-sensitive discounts for price verification", () => {
    const result = assessNewsQuality({
        title: "Samsung SSD is 38% off today",
        summary: usefulSummary,
        published_at: freshDate
    }, { now });
    assert.ok(result.flags.some(flag => flag.code === "time_sensitive_deal"));
});

test("leaves a recent, adequately summarized neutral story unflagged", () => {
    const result = assessNewsQuality({
        title: "Sonic X Shadow Generations sales pass three million",
        summary: usefulSummary,
        published_at: freshDate
    }, { now });
    assert.equal(result.flagged, false);
    assert.deepEqual(result.flags, []);
});
