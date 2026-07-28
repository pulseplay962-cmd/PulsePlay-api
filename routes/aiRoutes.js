import express from "express";

import {
    generateArticle,
    generateWeeklyContent,
    generateAndSaveWeeklyContent,
    publishAIContent
} from "../services/ai/contentService.js";

import { supabase } from "../lib/supabase.js";


const router = express.Router();


console.log("🔥 LOADED aiRoutes.js");




// =====================================
// AI Route Test
// =====================================

router.get("/test", (req,res)=>{

    console.log("✅ AI TEST ROUTE HIT");

    res.json({

        success:true,

        message:"PulsePlay AI routes are working 🚀"

    });

});




// =====================================
// Supabase Test
// =====================================

router.get("/supabase-test", async(req,res)=>{

    try{

        const {data,error} =
            await supabase
            .from("ai_content_queue")
            .select("id")
            .limit(1);



        res.json({

            success:true,

            message:"Supabase connection working",

            data,

            error

        });



    }catch(error){

        res.status(500).json({

            success:false,

            error:error.message

        });

    }

});




// =====================================
// Generate Single Article
// =====================================

router.get("/generate", async(req,res)=>{

    try{


        const topic =
            req.query.topic ||
            "Assassin's Creed Odyssey returns to the spotlight";



        console.log(
            "Generating article:",
            topic
        );



        const content =
            await generateArticle(topic);



        res.json({

            success:true,

            content

        });



    }catch(error){


        console.error(
            "AI ARTICLE ERROR:",
            error
        );


        res.status(500).json({

            success:false,

            error:error.message

        });

    }

});




// =====================================
// Generate Weekly Preview
// =====================================

router.post("/generate-weekly", async(req,res)=>{

    try{


        console.log(
            "Generating AI weekly preview..."
        );


        const posts =
            await generateWeeklyContent();



        res.json({

            success:true,

            count:posts.length,

            posts

        });



    }catch(error){


        console.error(
            "AI WEEKLY ERROR:",
            error
        );


        res.status(500).json({

            success:false,

            error:error.message

        });

    }

});




// =====================================
// Generate + Save Weekly Queue
// =====================================

router.post("/generate-weekly-save", async(req,res)=>{

    try{


        console.log(
            "Generating and saving AI weekly queue..."
        );



        const posts =
            await generateAndSaveWeeklyContent();



        res.json({

            success:true,

            message:
            "Weekly AI content queued successfully",

            count:
            posts.length,

            posts

        });



    }catch(error){


        console.error(
            "AI QUEUE SAVE ERROR:",
            error
        );


        res.status(500).json({

            success:false,

            error:error.message

        });

    }

});




// =====================================
// Get AI Queue
// =====================================

router.get("/queue", async(req,res)=>{

    try{


        const {data,error} =
            await supabase
            .from("ai_content_queue")
            .select("*")
            .order(
                "scheduled_date",
                {
                    ascending:true
                }
            );



        if(error){

            throw error;

        }



        res.json({

            success:true,

            count:data.length,

            queue:data

        });



    }catch(error){


        console.error(
            "QUEUE ERROR:",
            error
        );


        res.status(500).json({

            success:false,

            error:error.message

        });

    }

});




// =====================================
// Approve AI Queue Item
// =====================================

router.post("/approve/:id", async(req,res)=>{

    try{


        console.log(
            "Approving AI item:",
            req.params.id
        );



        const {data,error} =
            await supabase
            .from("ai_content_queue")
            .update({

                status:"approved"

            })
            .eq(
                "id",
                req.params.id
            )
            .select()
            .single();



        if(error){

            throw error;

        }



        res.json({

            success:true,

            message:
            "AI content approved",

            item:data

        });



    }catch(error){


        console.error(
            "APPROVE ERROR:",
            error
        );


        res.status(500).json({

            success:false,

            error:error.message

        });

    }

});




// =====================================
// Publish AI Queue Item
// =====================================

router.post("/publish/:id", async(req,res)=>{

    try{


        console.log(
            "Publishing AI item:",
            req.params.id
        );



        const {data:item,error} =
            await supabase
            .from("ai_content_queue")
            .select("*")
            .eq(
                "id",
                req.params.id
            )
            .single();



        if(error){

            throw error;

        }



        const published =
            await publishAIContent(item);



        res.json({

            success:true,

            message:
            "AI content published",

            article:published

        });



    }catch(error){


        console.error(
            "PUBLISH ERROR:",
            error
        );


        res.status(500).json({

            success:false,

            error:error.message

        });

    }

});




// =====================================
// Delete AI Queue Item
// =====================================

router.delete("/queue/:id", async(req,res)=>{

    try{


        const {error} =
            await supabase
            .from("ai_content_queue")
            .delete()
            .eq(
                "id",
                req.params.id
            );



        if(error){

            throw error;

        }



        res.json({

            success:true,

            message:
            "AI queue item deleted"

        });



    }catch(error){


        console.error(
            "DELETE QUEUE ERROR:",
            error
        );


        res.status(500).json({

            success:false,

            error:error.message

        });

    }

});




// =====================================
// Manual Publish Test
// =====================================

router.post("/publish-test", async(req,res)=>{

    try{


        const testItem = {

            title:
            "PulsePlay AI Test Article",


            body:
            "This is a test article generated by PulsePlay AI.",


            social_caption:
            "Testing PulsePlay AI publishing system.",


            category:
            "Community",


            image_prompt:
            "Dark futuristic gaming setup with neon purple and cyan lighting"

        };



        const article =
            await publishAIContent(testItem);



        res.json({

            success:true,

            article

        });



    }catch(error){


        console.error(
            "PUBLISH TEST ERROR:",
            error
        );


        res.status(500).json({

            success:false,

            error:error.message

        });

    }

});




console.log(
    "🔥 AI ROUTES READY"
);


export default router;