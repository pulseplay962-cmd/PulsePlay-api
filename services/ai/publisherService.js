import { supabase } from "../../lib/supabase.js";

import { generateImage } from "./imageService.js";

import {
    createSocialPost
} from "../socialQueue.js";

import { applyAmazonAffiliate } from "../affiliate.js";



// =====================================
// Create URL Slug
// =====================================

function createSlug(text = ""){

    return text

        .toLowerCase()

        .trim()

        .replace(
            /[^a-z0-9]+/g,
            "-"
        )

        .replace(
            /^-+|-+$/g,
            "");

}






// =====================================
// Create Unique Slug
// =====================================

async function createUniqueSlug(title){


    let slug =
        createSlug(title);



    if(!slug){

        slug =
        `pulseplay-ai-${Date.now()}`;

    }




    const { data } = await supabase

        .from("news")

        .select("id")

        .eq(
            "slug",
            slug
        )

        .limit(1);





    if(data && data.length > 0){

        slug =
            `${slug}-${Date.now()}`;

    }




    return slug;


}







// =====================================
// Normalize source URLs for duplicate checks
// =====================================

function normalizeSourceUrl(value = "") {
    try {
        const parsed = new URL(String(value).trim());
        [
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "utm_term",
            "utm_content",
            "fbclid",
            "gclid"
        ].forEach((key) => parsed.searchParams.delete(key));
        parsed.hash = "";
        return parsed.toString().replace(/\/$/, "");
    } catch {
        return String(value || "").trim().replace(/\/$/, "");
    }
}


// Normalize titles so punctuation/capitalization differences do not bypass deduplication.
function normalizeNewsTitle(value = "") {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9\\s]/g, " ")
        .replace(/\\s+/g, " ")
        .trim();
}

function hasNearDuplicateTitle(title, existingTitles) {
    const words = new Set(normalizeNewsTitle(title).split(" ").filter(word => word.length > 2));
    if (words.size < 5) return false;

    for (const existingTitle of existingTitles) {
        const existingWords = new Set(normalizeNewsTitle(existingTitle).split(" ").filter(word => word.length > 2));
        if (existingWords.size < 5) continue;

        let overlap = 0;
        for (const word of words) {
            if (existingWords.has(word)) overlap++;
        }

        if (overlap / Math.max(words.size, existingWords.size) >= 0.88) {
            return true;
        }
    }

    return false;
}


// =====================================
// Publish AI Content
// =====================================

export async function publishAIContent(item){


    try{


        console.log(
            "Publishing AI content:",
            item.title
        );








        // =====================================
        // Prevent Duplicate Publishing
        // =====================================


        if(item.id){


            const {

                data:queueItem

            } = await supabase

                .from("ai_content_queue")

                .select("status")

                .eq(
                    "id",
                    item.id
                )

                .maybeSingle();




            if(
                queueItem?.status === "published"
            ){

                throw new Error(
                    "This content has already been published"
                );

            }


        }








        // =====================================
        // Prevent duplicate source publication
        // =====================================

        const normalizedSourceUrl = normalizeSourceUrl(item.source_url);
        const normalizedTitle = normalizeNewsTitle(item.title);
        const { data: existingNews, error: existingNewsError } = await supabase
            .from("news")
            .select("id, title, source_url")
            .limit(2000);

        if (existingNewsError) {
            throw existingNewsError;
        }

        const existingArticles = existingNews || [];
        const duplicateSource = normalizedSourceUrl && existingArticles.some(
            article => normalizeSourceUrl(article.source_url) === normalizedSourceUrl
        );
        const duplicateTitle = normalizedTitle && existingArticles.some(
            article => normalizeNewsTitle(article.title) === normalizedTitle
        );
        const similarTitle = hasNearDuplicateTitle(
            item.title,
            existingArticles.map(article => article.title || "")
        );

        if (duplicateSource || duplicateTitle || similarTitle) {
            const reason = duplicateSource
                ? "An article from this source URL already exists."
                : "A news article with the same or a very similar title already exists.";
            const duplicateError = new Error(reason);
            duplicateError.code = "DUPLICATE_ARTICLE";
            throw duplicateError;
        }


        // =====================================
// Generate Image (Optional)
// =====================================

let imageUrl =
    item.image_url || "";


if(
    !imageUrl &&
    item.image_prompt
){

    try{


        imageUrl =
            await generateImage(
                item.image_prompt
            );


        console.log(
            "IMAGE GENERATED:",
            imageUrl
        );


    }catch(error){


        console.error(
            "IMAGE GENERATION SKIPPED:",
            error.message
        );


        // Continue publishing without image
        imageUrl = "";

    }

}







        // =====================================
        // Create Slug
        // =====================================


        const slug =
            await createUniqueSlug(
                item.title
            );









        // =====================================
        // Insert News Article
        // =====================================


        const processedBody = applyAmazonAffiliate(item.body || "", process.env.AMAZON_AFFILIATE_TAG?.trim());

        let sourceName = item.source_name || "";

        if (!sourceName && item.source_url) {
            try {
                sourceName = new URL(item.source_url).hostname.replace(/^www\\./, "");
            } catch {
                sourceName = "Original Source";
            }
        }

        const {

            data:article,

            error

        } = await supabase

            .from("news")

            .insert({

                title:
                item.title,


                slug,


                excerpt:

                item.social_caption ||

                item.body?.substring(
                    0,
                    160
                ) || "",



                content:

                processedBody || "",



                image:

                imageUrl || "",



                category:

                item.category ||

                "Games",



                featured:false,


                published:"true",

                status:"published",


                author:

                "PulsePlay AI",



                meta_description:

                item.body?.substring(
                    0,
                    160
                ) || "",



                facebook_post:

                item.social_caption || "",



                image_prompt:

                item.image_prompt || "",



                hashtags:

                item.hashtags || [],

                source_url:
                item.source_url || "",

                source_name:
                sourceName || "",

                published_at:

                new Date()
                .toISOString()



            })

            .select()

            .single();







        if(error){


            console.error(
                "NEWS INSERT ERROR:",
                error
            );


            throw error;


        }








        // =====================================
        // Update AI Queue
        // =====================================


        if(item.id){


            const {error:updateError} =

            await supabase

            .from("ai_content_queue")

            .update({

                status:
                "published",


                published_at:

                new Date()
                .toISOString()


            })

            .eq(
                "id",
                item.id
            );



            if(updateError){

                console.error(
                    "QUEUE UPDATE FAILED:",
                    updateError
                );

            }


        }









// =====================================
// Create Social Queue Post
// =====================================

console.log(
    "STARTING SOCIAL QUEUE CREATION"
);


try{


    const socialContent =

        item.social_caption ||

        item.body?.substring(
            0,
            500
        ) ||

        article.title;



    console.log(
        "SOCIAL CONTENT:",
        socialContent
    );



    const socialPost =

        await createSocialPost({

            newsId:

            article.id,


            platform:

            "facebook",


            postText:

            socialContent,


            imageUrl:

            imageUrl || "",


            hashtags:

            item.hashtags || [],


            scheduledAt:

            null

        });



    console.log(
        "SOCIAL POST QUEUED:",
        socialPost.id
    );



}catch(error){


    console.error(
        "SOCIAL QUEUE FAILED:",
        error
    );


}







// =====================================
// Return Published Article
// =====================================

console.log(
    "PUBLISHED ARTICLE:",
    article.id
);



return {

    success:true,

    article

};





}catch(error){


    console.error(
        "PUBLISH SERVICE ERROR:",
        error
    );


    throw error;


}

}