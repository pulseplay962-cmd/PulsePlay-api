import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNewsUrl, normalizeNewsTitle, recurringPuzzleKey, selectWeeklyCandidates } from "../services/ai/newsDeduplication.js";

test("normalizes tracking parameters and fragments", () => {
    assert.equal(normalizeNewsUrl("https://example.com/story/?utm_source=feed&fbclid=abc#section"), "https://example.com/story");
});
test("normalizes title punctuation and whitespace", () => {
    assert.equal(normalizeNewsTitle(" New: GAME Update! "), "new game update");
});
test("filters source URL duplicates after URL normalization", () => {
    assert.equal(selectWeeklyCandidates([{title:"A new game update arrives today",url:"https://example.com/story?utm_source=rss",source_type:"gaming"}],new Set(),new Set(["https://example.com/story"])).selected.length, 0);
});
test("filters exact normalized title duplicates", () => {
    assert.equal(selectWeeklyCandidates([{title:"New Game Update Arrives Today!",url:"https://example.com/new",source_type:"gaming"}],new Set(["new game update arrives today"]),new Set()).selected.length, 0);
});
test("filters likely near-duplicate titles", () => {
    assert.equal(selectWeeklyCandidates([{title:"Major update brings new features to popular game today",url:"https://example.com/new",source_type:"gaming"}],new Set(["major update brings new features to popular game today announced"]),new Set()).selected.length, 0);
});
test("deduplicates candidates within a research batch", () => {
    assert.equal(selectWeeklyCandidates([{title:"Brand new gaming update revealed today",url:"https://example.com/story",source_type:"gaming"},{title:"Brand new gaming update revealed today",url:"https://example.com/story?utm_campaign=feed",source_type:"gaming"}],new Set(),new Set()).selected.length, 1);
});
test("limits weekly mix to three gaming and two hardware candidates", () => {
    const rows = [
        {title:"Gaming release amber comet silver river details",url:"https://game.test/0",source_type:"gaming"},
        {title:"Gaming release birch canyon golden meadow details",url:"https://game.test/1",source_type:"gaming"},
        {title:"Gaming release copper forest lunar harbor details",url:"https://game.test/2",source_type:"gaming"},
        {title:"Gaming release dusty ember velvet sunrise details",url:"https://game.test/3",source_type:"gaming"},
        {title:"Hardware review alpine quartz vivid orchid results",url:"https://hardware.test/0",source_type:"hardware"},
        {title:"Hardware review bronze willow cosmic lantern results",url:"https://hardware.test/1",source_type:"hardware"},
        {title:"Hardware review crimson maple silent glacier results",url:"https://hardware.test/2",source_type:"hardware"}
    ];
    const result = selectWeeklyCandidates(rows, new Set(), new Set());
    assert.equal(result.selected.length, 5);
    assert.equal(result.selected.filter(x => x.source_type === "gaming").length, 3);
    assert.equal(result.selected.filter(x => x.source_type === "hardware").length, 2);
});


test("recognizes recurring daily puzzle answer formats across dates", () => {
    assert.equal(recurringPuzzleKey("Quordle #1736 hints and answers for October 26"), "quordle-daily-answers");
    assert.equal(recurringPuzzleKey("NYT Connections hints and answers for Monday, October 26"), "nyt-connections-daily-answers");
    assert.equal(recurringPuzzleKey("NYT Strands clues and answers for October 26"), "nyt-strands-daily-answers");
    assert.equal(recurringPuzzleKey("New action game announced today"), null);
});

test("rejects a new daily puzzle edition when that recurring format already exists", () => {
    const result = selectWeeklyCandidates(
        [{title:"Quordle hints and answers for October 26 game 1736",url:"https://example.com/quordle-26",source_type:"gaming"}],
        new Set(["Quordle hints and answers for October 23 game 1733"]),
        new Set(["https://example.com/quordle-23"])
    );
    assert.equal(result.selected.length, 0);
    assert.equal(result.counts.rejected_recurring_puzzle_format, 1);
    assert.equal(result.counts.researched, 1);
    assert.equal(result.counts.rejected_total, 1);
});

test("reports why candidates were rejected and how many were selected", () => {
    const result = selectWeeklyCandidates(
        [
            {title:"A known story title",url:"https://example.com/known",source_type:"gaming"},
            {title:"Brand new gaming release arrives this week",url:"https://example.com/fresh",source_type:"gaming"},
            {title:"Brand new gaming release arrives this week",url:"https://example.com/fresh?utm_source=rss",source_type:"gaming"}
        ],
        new Set(["a known story title"]),
        new Set(["https://example.com/known"])
    );
    assert.equal(result.counts.researched, 3);
    assert.equal(result.counts.rejected_exact_title, 1);
    assert.equal(result.counts.rejected_duplicate_in_batch, 1);
    assert.equal(result.counts.fresh_candidates, 1);
    assert.equal(result.counts.selected_candidates, 1);
});
