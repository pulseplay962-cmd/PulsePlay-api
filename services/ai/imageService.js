import openai from "./openaiService.js";
import { supabase } from "../../lib/supabase.js";



export async function generateImage(prompt) {


    try {


        console.log(
            "Generating AI image:",
            prompt
        );



        const response =
            await openai.images.generate({

                model: "gpt-image-1",

                prompt,

                size: "1536x864",

            });





        const imageData =
            response.data?.[0];





        if(!imageData){

            throw new Error(
                "AI image generation returned no image"
            );

        }





        /*
            GPT image models may return
            base64 data instead of a URL
        */

        if(imageData.b64_json){


            const buffer =
                Buffer.from(
                    imageData.b64_json,
                    "base64"
                );



            const fileName =
                `ai-${Date.now()}.png`;



            const { error:uploadError } =
                await supabase.storage
                .from("news-images")
                .upload(

                    fileName,

                    buffer,

                    {
                        contentType:
                        "image/png",

                        upsert:false,

                    }

                );



            if(uploadError){

                throw uploadError;

            }





            const {data:urlData} =
                supabase.storage
                .from("news-images")
                .getPublicUrl(
                    fileName
                );





            return urlData.publicUrl;


        }





        /*
            Fallback if API returns URL
        */

        if(imageData.url){

            return imageData.url;

        }





        throw new Error(
            "No usable image returned"
        );



    } catch(error){


        console.error(
            "IMAGE GENERATION ERROR:",
            error
        );


        throw error;


    }


}