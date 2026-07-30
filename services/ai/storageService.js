import { supabase } from "../../lib/supabase.js";


export async function uploadAIImage(
    imageBuffer,
    filename
){

    try{


        const {
            data,
            error
        } =
        await supabase
        .storage
        .from("ai-images")
        .upload(
            filename,
            imageBuffer,
            {
                contentType:
                "image/png",

                upsert:true
            }
        );



        if(error){

            throw error;

        }



        const {
            data:urlData
        } =
        supabase
        .storage
        .from("ai-images")
        .getPublicUrl(
            filename
        );



        return urlData.publicUrl;



    }catch(error){


        console.error(
            "SUPABASE IMAGE UPLOAD ERROR:",
            error
        );


        throw error;

    }

}