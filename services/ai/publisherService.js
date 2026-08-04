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


                published:true,



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