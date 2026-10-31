import test from "node:test";
import assert from "node:assert/strict";
import { findGameDuplicate } from "./gameDuplicateService.js";

test("flags punctuation and case variants as already listed", () => {
    const result = findGameDuplicate(
        { title: "Spider-Man 2", release_date: "2026-10-01", platform: "PS5" },
        [{ id: "1", title: "Spider Man 2", release_date: "2026-10-01", platform: "PS5" }]
    );

    assert.equal(result.status, "already_listed");
    assert.equal(result.match.id, "1");
});

test("flags a similar title as a possible match without calling it exact", () => {
    const result = findGameDuplicate(
        { title: "The Last of Us Part II Remastered", release_date: "2026-09-01" },
        [{ id: "2", title: "The Last of Us Part II", release_date: "2026-09-01" }]
    );

    assert.equal(result.status, "possible_match");
});

test("treats an exact title with a conflicting release date as a possible match", () => {
    const result = findGameDuplicate(
        { title: "Example Game", release_date: "2026-10-01", platform: "PS5" },
        [{ id: "3", title: "Example Game", release_date: "2010-10-01", platform: "PS5" }]
    );

    assert.equal(result.status, "possible_match");
});

test("leaves unrelated titles as new", () => {
    const result = findGameDuplicate(
        { title: "Hollow Knight Silksong", release_date: "2026-10-01" },
        [{ id: "4", title: "Grand Theft Auto VI", release_date: "2026-10-01" }]
    );

    assert.equal(result.status, "new");
});
