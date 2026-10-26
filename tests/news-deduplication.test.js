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
        {title:"Gaming keyboard review alpine quartz vivid orchid results",url:"https://hardware.test/0",source_type:"hardware"},
        {title:"Gaming monitor review bronze willow cosmic lantern results",url:"https://hardware.test/1",source_type:"hardware"},
        {title:"Gaming mouse review crimson maple silent glacier results",url:"https://hardware.test/2",source_type:"hardware"}
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
        new Set()
    );
    assert.equal(result.counts.researched, 3);
    assert.equal(result.counts.rejected_exact_title, 1);
    assert.equal(result.counts.rejected_duplicate_in_batch, 1);
    assert.equal(result.counts.fresh_candidates, 1);
    assert.equal(result.counts.selected_candidates, 1);
});


test("prefers a distinct gaming topic over a second BioWare story when alternatives exist", () => {
    const rows = [
        { title: "Almost 200000 Mass Effect fans sign petition to save the series after BioWare demise", url: "https://example.com/mass-effect-petition", source_type: "gaming" },
        { title: "Commander Shepard actors Jennifer Hale and Mark Meer mourn BioWare after studio news", url: "https://example.com/actors-mourn-bioware", source_type: "gaming" },
        { title: "Indies and non sequels have exploded in the last year", url: "https://example.com/indie-growth", source_type: "gaming" },
        { title: "New fantasy adventure reveals its first gameplay trailer", url: "https://example.com/fantasy-adventure", source_type: "gaming" },
        { title: "Handheld gaming PC battery tests show a major improvement", url: "https://example.com/handheld-battery", source_type: "hardware" },
        { title: "Mechanical keyboard review highlights quiet switches", url: "https://example.com/keyboard-review", source_type: "hardware" }
    ];
    const result = selectWeeklyCandidates(rows, new Set(), new Set());
    assert.equal(result.selected.length, 5);
    assert.ok(result.selected.some(item => item.url === "https://example.com/mass-effect-petition"));
    assert.ok(result.selected.some(item => item.url === "https://example.com/indie-growth"));
    assert.ok(!result.selected.some(item => item.url === "https://example.com/actors-mourn-bioware"));
    assert.equal(result.selected.filter(item => item.source_type === "gaming").length, 3);
    assert.equal(result.selected.filter(item => item.source_type === "hardware").length, 2);
});

test("keeps related follow-up coverage eligible when there are not enough alternatives", () => {
    const rows = [
        { title: "Mass Effect fans sign petition after BioWare news", url: "https://example.com/mass-effect-petition", source_type: "gaming" },
        { title: "BioWare veterans respond to Mass Effect fan petition", url: "https://example.com/bioware-response", source_type: "gaming" }
    ];
    const result = selectWeeklyCandidates(rows, new Set(), new Set());
    assert.equal(result.selected.length, 2);
    assert.ok(result.selected.some(item => item.url === "https://example.com/mass-effect-petition"));
    assert.ok(result.selected.some(item => item.url === "https://example.com/bioware-response"));
});

test("unrelated stories remain eligible even when they share generic gaming terms", () => {
    const rows = [
        { title: "PlayStation game update improves accessibility settings", url: "https://example.com/accessibility", source_type: "gaming" },
        { title: "PlayStation game release adds a new co-op mode", url: "https://example.com/coop", source_type: "gaming" }
    ];
    const result = selectWeeklyCandidates(rows, new Set(), new Set());
    assert.equal(result.selected.length, 2);
});


test("filters general corporate AI business stories from the hardware lane", () => {
    const rows = [
        {
            title: "Big Tech is cashing in on AI while the rest of corporate America sees no financial returns",
            summary: "Revenue per employee at the Magnificent Seven has outpaced the S&P 493.",
            url: "https://example.com/ai-corporate-profits",
            source_type: "hardware"
        },
        {
            title: "IQUNIX MQ80 low profile mechanical keyboard review",
            summary: "A low-profile keyboard review focused on switches and typing feel.",
            url: "https://example.com/keyboard-review",
            source_type: "hardware"
        },
        {
            title: "New gaming GPU improves ray tracing frame rates",
            summary: "A graphics card review tests performance in modern games.",
            url: "https://example.com/gpu-review",
            source_type: "hardware"
        }
    ];
    const result = selectWeeklyCandidates(rows, new Set(), new Set());
    assert.equal(result.counts.rejected_off_topic_hardware, 1);
    assert.equal(result.counts.fresh_candidates, 2);
    assert.equal(result.selected.length, 2);
    assert.ok(!result.selected.some(item => item.url === "https://example.com/ai-corporate-profits"));
    assert.ok(result.selected.some(item => item.url === "https://example.com/keyboard-review"));
    assert.ok(result.selected.some(item => item.url === "https://example.com/gpu-review"));
});

test("keeps gaming-related AI hardware coverage eligible", () => {
    const rows = [
        {
            title: "AI upscaling improves frame rates on gaming GPUs",
            summary: "A graphics technology update focuses on gaming performance.",
            url: "https://example.com/ai-upscaling-gpu",
            source_type: "hardware"
        }
    ];
    const result = selectWeeklyCandidates(rows, new Set(), new Set());
    assert.equal(result.selected.length, 1);
    assert.equal(result.counts.rejected_off_topic_hardware, 0);
});
