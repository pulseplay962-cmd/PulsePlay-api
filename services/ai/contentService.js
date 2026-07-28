import openai from "./openaiService.js";
import { pulsePlayBrand } from "./prompts.js";



const weeklySchedule = {

    Monday: {
        website: "Game Spotlight",
        facebook: "Promote article + discussion"
    },

    Tuesday: {
        website: "Gaming Gear Guide",
        facebook: "Gear teaser"
    },

    Wednesday: {
        website: "Homepage update",
        facebook: "Community poll"
    },

    Thursday: {
        website: "Stream announcement",
        facebook: "Go-live announcement"
    },

    Friday: {
        website: "Weekend game recommendations",
        facebook: "Weekend picks"
    },

    Saturday: {
        website: "Live banner",
        facebook: "Live reminder"
    },

    Sunday: {
        website: "Weekly recap",
        facebook: "Community thank-you"
    }

};







// ================================
// Single Article Generator
// ================================

export async function generateArticle(topic) {


    const today =
        new Date().toLocaleDateString(
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

Today's schedule:

Day:
${today}

Website Content:
${schedule?.website || "Gaming article"}

Facebook Content:
${schedule?.facebook || "Community post"}


Topic:

${topic}


Create content for PulsePlay.online.


Return ONLY valid JSON.


Format:

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
Create an SEO friendly gaming title.


META:
Create a search optimized description.


ARTICLE:
Create an 800-1200 word gaming article.

Include:
- engaging introduction
- multiple sections
- gaming insights
- community discussion question


FACEBOOK:
Create an engaging Facebook post.


IMAGE PROMPT:
Create a detailed AI image generation prompt.


HASHTAGS:
Create gaming related hashtags.


Brand voice:

${pulsePlayBrand}

`

                }

            ]

        });





    return JSON.parse(
        response.choices[0].message.content
    );


}









// ================================
// Weekly AI Content Generator
// ================================

export async function generateWeeklyContent(){


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


Create a complete 7-day gaming media content package.


Return ONLY valid JSON.



Create exactly these posts:



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





Return this exact format:



{
"posts":[

{
"title":"",
"content_type":"",
"category":"",
"body":"",
"social_caption":"",
"image_prompt":"",
"scheduled_date":""
}

]
}





Requirements:



TITLE:

Create an engaging gaming headline.



CONTENT TYPE:

Use one of:

article

facebook_post

poll

stream_announcement



CATEGORY:

Use one of:

Games

Gear

Community

Streaming

Recommendations



BODY:

Create the main content.



SOCIAL CAPTION:

Create a Facebook-ready gaming post.



IMAGE PROMPT:

Create a detailed AI image generation prompt.



SCHEDULED DATE:

Return ISO date format only:

YYYY-MM-DD


Use the next upcoming occurrence for each scheduled day.



Brand style:

${pulsePlayBrand}



Make the content exciting for the PulsePlay gaming community.

`

                }

            ]

        });







    const result =
        JSON.parse(
            response.choices[0].message.content
        );



    console.log(
        "AI WEEKLY RESULT:",
        result
    );



    return result.posts || [];


}