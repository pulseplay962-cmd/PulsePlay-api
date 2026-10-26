import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNewsUrl, normalizeNewsTitle, selectWeeklyCandidates } from "../services/ai/newsDeduplication.js";

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
