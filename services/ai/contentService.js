import openai from "./openaiService.js";
import { pulsePlayBrand } from "./prompts.js";
import { generateImage } from "./imageService.js";
import { supabase } from "../../lib/supabase.js";




// =====================================
// PulsePlay Weekly Content Schedule
// =====================================

const weeklySchedule = {

    Monday:{
        website:"Game Spotlight",
        facebook:"Promote article + discussion"
    },

    Tuesday:{
        website:"Gaming Gear Guide",
        facebook:"Gear teaser"
    },

    Wednesday:{
        website:"Community Poll",
        facebook:"Community discussion"
    },

    Thursday:{
        website:"Stream Announcement",
        facebook:"Go-live announcement"
    },

    Friday:{
        website:"Weekend Recommendations",
        facebook:"Weekend picks"
    },

    Saturday:{
        website:"Stream Reminder",
        facebook:"Live reminder"
    },

    Sunday:{
        website:"Weekly Recap",
        facebook:"Community thank-you"
    }

};







// =====================================
// Get Upcoming Dates
// =====================================

function getUpcomingDates(){

    const dates = {};

    const today = new Date();


    Object.keys(weeklySchedule)
    .forEach(day=>{


        const date =
            new Date(today);


        const currentDay =
            date.getDay();


        const targetDay =
            [
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday"
            ]
            .indexOf(day);



        let difference =
            targetDay - currentDay;



        if(difference <= 0){

            difference += 7;

        }



        date.setDate(
            date.getDate() + difference
        );



        dates[day] =
            date.toISOString()
            .split("T")[0];


    });


    return dates;

}







// =====================================
// Parse AI JSON Safely
// =====================================

function parseAIResponse(content){


    try{

        return JSON.parse(content);


    }catch(error){


        console.error(
            "AI JSON FAILURE:",
            content
        );


        throw new Error(
            "AI returned invalid JSON"
        );

    }

}









// =====================================
// Generate Single Article
// =====================================

export async function generateArticle(topic){


    const today =
        new Date()
        .toLocaleDateString(
            "en-US",
            {
                weekday:"long"
            }
        );


    const schedule =
        weeklySchedule[today];




    const response =
        await openai.chat.completions.create({


            model:"gpt-4.1-mini",


            response_format:{
                type:"json_object"
            },


            messages:[


                {
                    role:"system",
                    content:pulsePlayBrand
                },


                {
                    role:"user",

                    content:`

You are the PulsePlay AI Content Manager.

Create premium gaming content.

Schedule:

Day:
${today}

Website:
${schedule?.website}

Facebook:
${schedule?.facebook}


Topic:

${topic}


Return JSON ONLY.


FORMAT:

{
"title":"",
"metaDescription":"",
"article":"",
"facebookPost":"",
"imagePrompt":"",
"hashtags":[]
}


Requirements:

TITLE:
SEO optimized gaming headline.

ARTICLE:
800-1200 words.

Include:

- Introduction
- Gaming analysis
- Community discussion question
- SEO keywords


FACEBOOK:
Create engagement focused post.


IMAGE PROMPT:
Create detailed AI artwork prompt.


HASHTAGS:
Return gaming hashtags.



Brand:

${pulsePlayBrand}

`

                }

            ]

        });



    return parseAIResponse(
        response.choices[0]
        .message
        .content
    );

}









// =====================================
// Generate Weekly Package
// =====================================

export async function generateWeeklyContent(){


    try{


        const dates =
            getUpcomingDates();




        const response =
            await openai.chat.completions.create({


                model:"gpt-4.1-mini",


                response_format:{
                    type:"json_object"
                },


                messages:[


                    {
                        role:"system",
                        content:pulsePlayBrand
                    },


                    {
                        role:"user",

                        content:`

You are the PulsePlay AI Weekly Content Manager.


Create 7 gaming posts.


Return ONLY JSON.



FORMAT:

{
"posts":[

{
"title":"",
"content_type":"",
"category":"",
"body":"",
"social_caption":"",
"image_prompt":"",
"hashtags":[]
}

]

}



Schedule:


Monday:
Game Spotlight

Tuesday:
Gaming Gear Guide

Wednesday:
Community Poll

Thursday:
Stream Announcement

Friday:
Weekend Recommendations

Saturday:
Stream Reminder

Sunday:
Weekly Recap



Allowed content types:

article
facebook_post
poll
stream_announcement



Allowed categories:

Games
Gear
Community
Streaming
Recommendations



Brand:

${pulsePlayBrand}

`

                    }

                ]

            });






        const result =
            parseAIResponse(
                response.choices[0]
                .message
                .content
            );







        const posts =
            (result.posts || [])
            .map((post,index)=>({


                ...post,


                scheduled_date:
                    Object.values(dates)[index],


                status:
                    "pending"


            }));







        console.log(
            "AI POSTS CREATED:",
            posts.length
        );



        return posts;



    }catch(error){


        console.error(
            "WEEKLY AI ERROR:",
            error
        );


        throw error;

    }

}









// =====================================
// Save AI Queue
// =====================================

export async function saveAIQueue(posts){


    if(!posts || posts.length === 0){

        console.log(
            "No AI posts to save"
        );

        return [];

    }



    console.log(
        "Saving AI queue items:",
        posts.length
    );



    const queueItems = posts.map(post => ({

        title:
            post.title,


        content_type:
            post.content_type,


        category:
            post.category,


        body:
            post.body,


        social_caption:
            post.social_caption,


        image_prompt:
            post.image_prompt,


        scheduled_date:
            post.scheduled_date,


        status:
            "pending"

    }));




    console.log(
        "QUEUE INSERT DATA:",
        queueItems[0]
    );





    const {data,error} = await supabase

        .from("ai_content_queue")

        .insert(queueItems)

        .select();






    if(error){


        console.error(
            "QUEUE INSERT FAILED:",
            error
        );


        throw error;

    }




    console.log(
        "QUEUE SAVED:",
        data.length
    );



    return data;

}









// =====================================
// Generate + Save Weekly
// =====================================

export async function generateAndSaveWeeklyContent(){


    console.log(
        "Starting weekly AI generation..."
    );


    const posts =
        await generateWeeklyContent();



    console.log(
        "Generated posts:",
        posts.length
    );



    const saved =
        await saveAIQueue(posts);



    console.log(
        "Saved queue:",
        saved.length
    );



    return saved;

}









/// =====================================
// Publish AI Content
// =====================================

export async function publishAIContent(item){


    try{


        console.log(
            "Publishing:",
            item.title
        );



        // Prevent duplicate publishing

        if(item.id){


            const {data:existing} =
                await supabase

                .from("news")

                .select("id")

                .eq(
                    "title",
                    item.title
                )

                .maybeSingle();



            if(existing){


                throw new Error(
                    "This article has already been published"
                );

            }

        }





        let imageUrl = "";





        // Generate AI artwork

        if(item.image_prompt){


            try{


                imageUrl =
                    await generateImage(
                        item.image_prompt
                    );


                console.log(
                    "IMAGE CREATED:",
                    imageUrl
                );


            }catch(error){


                console.error(
                    "IMAGE GENERATION FAILED:",
                    error.message
                );


                // Continue without image

                imageUrl = "";

            }

        }







        // Create SEO slug

        const slug =
            item.title

            .toLowerCase()

            .trim()

            .replace(
                /[^a-z0-9]+/g,
                "-"
            )

            .replace(
                /^-|-$/g,
                ""
            );







        // Insert News Article

        const {data,error} =

            await supabase

            .from("news")

            .insert({

                title:
                    item.title,


                slug,


                excerpt:
                    item.social_caption,


                content:
                    item.body,


                image:
                    imageUrl,


                category:
                    item.category,


                featured:false,


                published:true,


                author:
                    "PulsePlay AI",


                meta_description:
                    item.body
                    ?.substring(
                        0,
                        160
                    ),



                facebook_post:
                    item.social_caption,



                image_prompt:
                    item.image_prompt,



                hashtags:
                    item.hashtags || []

            })

            .select()

            .single();






        if(error){

            throw error;

        }






        // Update AI Queue

        if(item.id){


            const {error:updateError}=

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







        console.log(
            "PUBLISHED NEWS:",
            data.id
        );



        return data;



    }catch(error){


        console.error(
            "PUBLISH FAILED:",
            error
        );


        throw error;

    }

}

// =====================================
// Generate Queue Image Preview
// =====================================

export async function generateQueueImage(item){


    try{


        console.log(
            "Generating preview image:",
            item.title
        );



        const imageUrl =
            await generateImage(
                item.image_prompt
            );



        const {data,error} =

            await supabase

            .from("ai_content_queue")

            .update({

                image_url:imageUrl

            })

            .eq(
                "id",
                item.id
            )

            .select()

            .single();





        if(error){

            throw error;

        }



        return data;



    }catch(error){


        console.error(
            "QUEUE IMAGE ERROR:",
            error
        );


        throw error;


    }

}

// =====================================
// Generate Image For Queue Item
// =====================================

export async function generateImageForQueueItem(item){


    const imageUrl =
        await generateImage(
            item.image_prompt
        );



    const {data,error} =

        await supabase

        .from("ai_content_queue")

        .update({

            image_url:imageUrl

        })

        .eq(
            "id",
            item.id
        )

        .select()

        .single();




    if(error){

        throw error;

    }



    return data;

}