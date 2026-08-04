import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createClient } from "@supabase/supabase-js";

console.log("🔥 NEWS ROUTES FILE LOADED");

const router = express.Router();

router.get(
    "/test",
    (req,res)=>{

        console.log("🔥 NEWS TEST ROUTE HIT");

        res.json({

            success:true,

            message:"News route is working"

        });

    }
);

console.log(
    "NEWS ROUTE ENV CHECK:",
    process.env.SUPABASE_URL
);


const supabase = createClient(

    process.env.SUPABASE_URL,

    process.env.SUPABASE_SERVICE_ROLE_KEY

);




// ==================================
// Publish Article From PulseAI
// ==================================

router.post(
    "/publish",
    async (req,res)=>{


        try{


            const {

                title,

                slug,

                excerpt,

                content,

                image,

                category,

                author

            } = req.body;




            if(!title || !content){


                return res.status(400).json({

                    success:false,

                    error:
                    "Title and content are required."

                });


            }






            const { data,error } =

            await supabase

                .from("news")

                .insert([

                    {

                        title,

                        slug,

                        excerpt,

                        content,

                        image:
                        image || "",

                        category:
                        category || "Gaming",

                        author:
                        author || "PulseAI",

                        published:true,

                        status:"published"

                    }

                ])

                .select()

                .single();







            if(error){


                console.error(
                    "Publish insert error:",
                    error
                );


                return res.status(500).json({

                    success:false,

                    error:error.message

                });


            }







            return res.json({

                success:true,

                article:data

            });



        }
        catch(error){


            console.error(
                "Publish route error:",
                error
            );



            return res.status(500).json({

                success:false,

                error:
                "Unable to publish article."

            });


        }


    }

);

console.log(
    "NEWS ROUTER READY"
);

export default router;