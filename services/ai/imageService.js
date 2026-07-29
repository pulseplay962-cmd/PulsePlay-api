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

                model:"gpt-image-1",

                prompt,

                size:"1536x1024",

            });






        const imageData =
            response.data?.[0];






        if(!imageData){

            throw new Error(
                "No image returned from OpenAI"
            );

        }







        let imageBuffer;






        /*
            GPT-IMAGE-1 usually returns
            base64 image data
        */


        if(imageData.b64_json){


            console.log(
                "Using base64 image data"
            );


            imageBuffer =
                Buffer.from(
                    imageData.b64_json,
                    "base64"
                );


        }






        /*
            Fallback if URL is returned
        */


        else if(imageData.url){


            console.log(
                "Downloading image URL..."
            );


            const imageResponse =
                await fetch(
                    imageData.url
                );



            if(!imageResponse.ok){

                throw new Error(
                    "Failed downloading AI image"
                );

            }



            imageBuffer =
                Buffer.from(
                    await imageResponse.arrayBuffer()
                );


        }






        else{


            throw new Error(
                "No usable image data returned"
            );


        }









        const now =
            new Date();



        const year =
            now.getFullYear();



        const month =
            String(
                now.getMonth()+1
            )
            .padStart(
                2,
                "0"
            );







        const fileName =

            `ai-images/${year}/${month}/pulseplay-ai-${Date.now()}.png`;







        console.log(
            "Uploading:",
            fileName
        );








        const {
            error:uploadError
        } =

            await supabase

            .storage

            .from("ai-images")

            .upload(

                fileName,

                imageBuffer,

                {

                    contentType:
                    "image/png",

                    upsert:false

                }

            );








        if(uploadError){

            console.error(
                "UPLOAD ERROR:",
                uploadError
            );


            throw uploadError;

        }









        const {
            data:urlData
        } =

            supabase

            .storage

            .from("ai-images")

            .getPublicUrl(

                fileName

            );








        if(!urlData?.publicUrl){

            throw new Error(
                "Failed creating public image URL"
            );

        }








        console.log(
            "AI IMAGE STORED:",
            urlData.publicUrl
        );







        return urlData.publicUrl;







    }catch(error){


        console.error(

            "IMAGE GENERATION ERROR:",

            error

        );


        throw error;


    }


}