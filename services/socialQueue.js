import { supabase } from "../lib/supabase.js";



// =====================================
// Create Social Queue Post
// =====================================

export async function createSocialPost({

    newsId,

    platform = "facebook",

    postText = "",

    imageUrl = "",

    hashtags = [],

    scheduledAt = null

}){


    try{


        console.log(
            "Creating social queue post:",
            {
                newsId,
                platform,
                postText
            }
        );






        const { data,error } =

            await supabase

            .from("social_queue")

            .insert({

                news_id:
                newsId,


                platform,


                post_text:
                postText,


                image_url:
                imageUrl,


                hashtags,


                status:
                "scheduled",


                scheduled_at:
                scheduledAt


            })

            .select()

            .single();







        if(error){


            console.error(
                "SOCIAL QUEUE INSERT ERROR:",
                error
            );


            throw error;


        }








        console.log(

            "SOCIAL POST QUEUED:",

            data.id

        );





        return data;




    }catch(error){


        console.error(

            "SOCIAL QUEUE ERROR:",

            error

        );


        throw error;


    }


}