function normalizeTitle(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[’']/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\\s+/g, " ")
        .trim();
}

function normalizePlatform(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\\s+/g, " ")
        .trim();
}

function compatible(candidate, existing) {
    const candidateDate = String(candidate.release_date || "").slice(0, 10);
    const existingDate = String(existing.release_date || "").slice(0, 10);
    const datesCompatible =
        !candidateDate || !existingDate || candidateDate === existingDate;

    const candidatePlatform = normalizePlatform(candidate.platform);
    const existingPlatform = normalizePlatform(existing.platform);
    const platformsCompatible =
        !candidatePlatform ||
        !existingPlatform ||
        candidatePlatform === existingPlatform ||
        candidatePlatform.includes(existingPlatform) ||
        existingPlatform.includes(candidatePlatform);

    return datesCompatible && platformsCompatible;
}

function tokenSimilarity(left, right) {
    const leftTokens = new Set(normalizeTitle(left).split(" ").filter(Boolean));
    const rightTokens = new Set(normalizeTitle(right).split(" ").filter(Boolean));

    if (!leftTokens.size || !rightTokens.size) return 0;

    let overlap = 0;
    for (const token of leftTokens) {
        if (rightTokens.has(token)) overlap += 1;
    }

    return overlap / Math.min(leftTokens.size, rightTokens.size);
}

export function findGameDuplicate(candidate, games = []) {
    const title = normalizeTitle(candidate?.title);

    if (!title) {
        return { status: "new", match: null };
    }

    const exact = games.find((game) =>
        normalizeTitle(game?.title) === title
    );

    if (exact) {
        return {
            status: compatible(candidate, exact)
                ? "already_listed"
                : "possible_match",
            match: {
                id: exact.id,
                title: exact.title,
                release_date: exact.release_date || null,
                platform: exact.platform || null
            }
        };
    }

    const possible = games
        .map((game) => ({
            game,
            similarity: tokenSimilarity(candidate.title, game?.title)
        }))
        .filter(({ game, similarity }) =>
            similarity >= 0.8 &&
            normalizeTitle(game?.title).split(" ").filter(Boolean).length >= 2 &&
            compatible(candidate, game)
        )
        .sort((a, b) => b.similarity - a.similarity)[0];

    if (!possible) {
        return { status: "new", match: null };
    }

    return {
        status: "possible_match",
        match: {
            id: possible.game.id,
            title: possible.game.title,
            release_date: possible.game.release_date || null,
            platform: possible.game.platform || null
        }
    };
}
