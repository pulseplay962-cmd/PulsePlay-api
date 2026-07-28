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



export async function generateArticle(topic) {


    const today = new Date().toLocaleDateString(
        "en-US",
        {
            weekday: "long"
        }
    );


    const schedule =
        weeklySchedule[today];



    const response =
        await openai.chat.completions.create({

            model: "gpt-4.1-mini",

            response_format: {
                type: "json_object"
            },


            messages: [

                {
                    role: "system",
                    content: pulsePlayBrand
                },


                {
                    role: "user",
                    content: `

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
800-1200 word gaming article.
Include:
- engaging introduction
- multiple sections
- gaming insights
- community discussion question

FACEBOOK:
Create an engaging Facebook post that promotes discussion.

IMAGE PROMPT:
Create an AI image generation prompt matching the article.

HASHTAGS:
Create gaming related hashtags.

Brand voice:
${pulsePlayBrand}

Topic:
${topic}

`
                }

            ]

        });



    return JSON.parse(
        response.choices[0].message.content
    );

}