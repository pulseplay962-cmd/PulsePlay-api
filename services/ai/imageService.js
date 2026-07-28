import openai from "./openaiService.js";



export async function generateImage(prompt) {


    try {


        const response =
            await openai.images.generate({

                model: "gpt-image-1",

                prompt,

                size: "1536x864",

            });





        const imageUrl =
            response.data?.[0]?.url;





        if(!imageUrl){

            throw new Error(
                "AI image generation returned no image URL"
            );

        }





        return imageUrl;



    } catch(error){


        console.error(
            "IMAGE GENERATION ERROR:",
            error
        );


        throw error;


    }


}