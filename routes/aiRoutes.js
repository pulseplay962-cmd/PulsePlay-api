import express from "express";

import {
    generateArticle,
    generateWeeklyContent
} from "../services/ai/contentService.js";


const router = express.Router();




// Generate Single Article

router.get("/generate", async (req, res) => {

    try {


        const content =
            await generateArticle(
                "Assassin's Creed Odyssey returns to the spotlight"
            );



        res.json({

            success:true,

            content

        });



    } catch(error){


        console.error(
            "AI ARTICLE ERROR:",
            error
        );


        res.status(500).json({

            success:false,

            error:
                error.message ||
                "AI article generation failed"

        });


    }

});







// Generate Weekly PulsePlay Content

router.post("/generate-weekly", async (req,res)=>{


    try{


        const posts =
            await generateWeeklyContent();



        console.log(
            "Generated weekly posts:",
            posts
        );



        res.json({

            success:true,

            posts

        });



    }catch(error){


        console.error(
            "AI WEEKLY GENERATION ERROR:",
            error
        );



        res.status(500).json({

            success:false,

            error:
                error.message ||
                "AI generation failed"

        });


    }


});





export default router;