import openai from "./openaiService.js";
import { supabase } from "../../lib/supabase.js";





export async function generateImage(prompt) {


    try {


        console.log(
            "Generating AI image..."
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
                "AI image generation returned no image"
            );

        }





        /*
            gpt-image-1 returns base64 image data
            We convert it into a buffer
        */


        const base64Image =
            imageData.b64_json;



        if(!base64Image){

            throw new Error(
                "No base64 image returned"
            );

        }






        const imageBuffer =
            Buffer.from(
                base64Image,
                "base64"
            );







        const filename =

            `pulseplay-ai-${Date.now()}.png`;








        console.log(
            "Uploading image:",
            filename
        );







        const {error:uploadError}=

            await supabase.storage

            .from("ai-images")

            .upload(

                filename,

                imageBuffer,

                {

                    contentType:
                    "image/png",

                    upsert:false

                }

            );







        if(uploadError){

            console.error(
                "SUPABASE IMAGE UPLOAD ERROR:",
                uploadError
            );


            throw uploadError;

        }









        const {data}=

            supabase.storage

            .from("ai-images")

            .getPublicUrl(

                filename

            );







        if(!data?.publicUrl){

            throw new Error(
                "Could not create image URL"
            );

        }







        console.log(
            "AI IMAGE URL:",
            data.publicUrl
        );







        return data.publicUrl;






    }catch(error){


        console.error(

            "IMAGE GENERATION ERROR:",

            error

        );


        throw error;


    }


}