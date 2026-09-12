import { supabase } from "../../lib/supabase.js";

function slugify(value = "") {
    return value
        .toString()
        .normalize("NFKD")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function normalizeTitle(title = "") {
    return title
        .toLowerCase()
        .replace(/[’']/g, "")
        .replace(/[:\-–—]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function isValidDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Publish an approved AI-generated game package.
 *
 * This function:
 * 1. Validates the package.
 * 2. Prevents duplicate games.
 * 3. Creates or updates the games record.
 * 4. Queues the Facebook post.
 *
 * Facebook is NOT posted immediately.
 */
export async function publishGamePackage({
    packageData,
    selectedYear,
    selectedMonth,
    maxGames = 10
}) {
    if (!packageData?.title) {
        throw new Error("Game package title is required.");
    }

    if (!packageData?.release_date) {
        throw new Error("Game release date is required.");
    }

    if (!isValidDate(packageData.release_date)) {
        throw new Error(
            `Invalid release date: ${packageData.release_date}`
        );
    }

    const releaseDate = new Date(
        `${packageData.release_date}T00:00:00Z`
    );

    if (Number.isNaN(releaseDate.getTime())) {
        throw new Error("Invalid release date.");
    }

    const releaseYear = releaseDate.getUTCFullYear();
    const releaseMonth = releaseDate.getUTCMonth() + 1;

    /*
     * Enforce the selected calendar month.
     */
    if (
        selectedYear !== undefined &&
        selectedYear !== null &&
        selectedMonth !== undefined &&
        selectedMonth !== null
    ) {
        if (
            releaseYear !== Number(selectedYear) ||
            releaseMonth !== Number(selectedMonth)
        ) {
            throw new Error(
                `Game release date ${packageData.release_date} is outside the selected month.`
            );
        }
    }

    /*
     * Enforce monthly game limit.
     */
    if (
        selectedYear !== undefined &&
        selectedYear !== null &&
        selectedMonth !== undefined &&
        selectedMonth !== null
    ) {
        const monthStart =
            `${String(selectedYear).padStart(4, "0")}-` +
            `${String(selectedMonth).padStart(2, "0")}-01`;

        const nextMonthDate = new Date(
            Date.UTC(Number(selectedYear), Number(selectedMonth), 1)
        );

        const nextMonthStart =
            `${nextMonthDate.getUTCFullYear()}-` +
            `${String(nextMonthDate.getUTCMonth() + 1).padStart(2, "0")}-01`;

        const { count, error: countError } = await supabase
            .from("games")
            .select("id", {
                count: "exact",
                head: true
            })
            .gte("release_date", monthStart)
            .lt("release_date", nextMonthStart)
            .neq("status", "archived");

        if (countError) {
            throw new Error(
                `Unable to check monthly game limit: ${countError.message}`
            );
        }

        /*
         * If this game already exists, updating it should not consume
         * another slot.
         */
        const normalizedIncomingTitle =
            normalizeTitle(packageData.title);

        const { data: existingByTitle, error: titleCheckError } =
            await supabase
                .from("games")
                .select("id,title,release_date,status,slug")
                .ilike("title", packageData.title)
                .limit(10);

        if (titleCheckError) {
            throw new Error(
                `Unable to check existing game: ${titleCheckError.message}`
            );
        }

        const isExistingGame = (existingByTitle || []).some(
            (game) =>
                normalizeTitle(game.title) === normalizedIncomingTitle
        );

        if (!isExistingGame && Number(count || 0) >= Number(maxGames)) {
            throw new Error(
                `The selected month already has ${count} approved games. Maximum allowed is ${maxGames}.`
            );
        }
    }

    /*
     * Find existing game by normalized title.
     */
    const { data: existingGames, error: existingError } =
        await supabase
            .from("games")
            .select("*")
            .ilike("title", packageData.title)
            .limit(20);

    if (existingError) {
        throw new Error(
            `Unable to check for duplicate game: ${existingError.message}`
        );
    }

    const normalizedIncomingTitle =
        normalizeTitle(packageData.title);

    const existingGame = (existingGames || []).find(
        (game) =>
            normalizeTitle(game.title) === normalizedIncomingTitle
    );

    /*
     * Build the base slug.
     */
    let baseSlug = slugify(packageData.title);

    if (!baseSlug) {
        baseSlug = `game-${packageData.release_date}`;
    }

    let slug = baseSlug;

    /*
     * Check slug collision.
     */
    const { data: slugMatches, error: slugError } =
        await supabase
            .from("games")
            .select("id,slug")
            .eq("slug", slug)
            .limit(20);

    if (slugError) {
        throw new Error(
            `Unable to check game slug: ${slugError.message}`
        );
    }

    const slugBelongsToAnotherGame = (slugMatches || []).some(
        (game) =>
            !existingGame ||
            game.id !== existingGame.id
    );

    if (slugBelongsToAnotherGame) {
        slug = `${baseSlug}-${packageData.release_date}`;

        const { data: secondSlugMatches, error: secondSlugError } =
            await supabase
                .from("games")
                .select("id")
                .eq("slug", slug)
                .limit(1);

        if (secondSlugError) {
            throw new Error(
                `Unable to verify alternate slug: ${secondSlugError.message}`
            );
        }

        if (secondSlugMatches?.length) {
            slug = `${baseSlug}-${Date.now()}`;
        }
    }

    const gamePayload = {
        title: packageData.title,
        description: packageData.description || "",
        image: packageData.image || "",
        release_date: packageData.release_date,
        genre: packageData.genre || null,
        platform: packageData.platform || null,
        category: packageData.category || "Games",
        status: packageData.status || "upcoming",
        featured: Boolean(packageData.featured),
        slug,
        article_title: packageData.article_title || null,
        meta_description: packageData.meta_description || null,
        article_content: packageData.article_content || null,
        facebook_post: packageData.facebook_post || null,
        image_prompt: packageData.image_prompt || null,
        hashtags: packageData.hashtags || null
    };

    let game;
    let action;

    /*
     * Update existing game.
     */
    if (existingGame) {
        const { data, error } = await supabase
            .from("games")
            .update(gamePayload)
            .eq("id", existingGame.id)
            .select()
            .single();

        if (error) {
            throw new Error(
                `Unable to update existing game: ${error.message}`
            );
        }

        game = data;
        action = "updated";
    } else {
        /*
         * Create new game.
         */
        const { data, error } = await supabase
            .from("games")
            .insert(gamePayload)
            .select()
            .single();

        if (error) {
            throw new Error(
                `Unable to publish game: ${error.message}`
            );
        }

        game = data;
        action = "created";
    }

    /*
     * Prevent duplicate scheduled Facebook entries for the same game.
     *
     * social_queue currently uses news_id for news articles, but it is
     * nullable. Game posts therefore remain independent of news records.
     */
    let socialQueue = null;

    const postText = packageData.facebook_post || "";

    if (postText.trim()) {
        const { data: existingQueueItems, error: queueCheckError } =
            await supabase
                .from("social_queue")
                .select("*")
                .is("news_id", null)
                .eq("platform", "facebook")
                .eq("post_text", postText)
                .in("status", ["scheduled", "pending"])
                .limit(10);

        if (queueCheckError) {
            throw new Error(
                `Unable to check social queue: ${queueCheckError.message}`
            );
        }

        if (existingQueueItems?.length) {
            socialQueue = existingQueueItems[0];
        } else {
            const hashtags = packageData.hashtags
                ? packageData.hashtags
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean)
                      .join(" ")
                : "";

            const finalPostText = hashtags
                ? `${postText}\n\n${hashtags
                    .split(" ")
                    .map((tag) =>
                        tag.startsWith("#") ? tag : `#${tag}`
                    )
                    .join(" ")}`
                : postText;

            const { data, error } = await supabase
                .from("social_queue")
                .insert({
                    news_id: null,
                    platform: "facebook",
                    post_text: finalPostText,
                    image_url: packageData.image || "",
                    hashtags: packageData.hashtags || "",
                    status: "scheduled",
                    scheduled_at: null
                })
                .select()
                .single();

            if (error) {
                throw new Error(
                    `Game was published, but Facebook queue creation failed: ${error.message}`
                );
            }

            socialQueue = data;
        }
    }

    return {
        success: true,
        action,
        game,
        social_queue: socialQueue
    };
}
