import express from "express";
import { generateArticle } from "../services/ai/contentService.js";


const router = express.Router();


router.get("/generate", async (req, res) => {

    try {

        const content = await generateArticle(
    "Assassin's Creed Odyssey returns to the spotlight"
);


res.json({
    success:true,
    content
});


    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            error: error.message
        });

    }

});


export default router;