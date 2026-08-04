import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

import twitchRoutes from "./routes/twitch.js";
import aiRoutes from "./routes/aiRoutes.js";
import newsRoutes from "./routes/newsRoutes.js";


const app = express();


const PORT = process.env.PORT || 5000;




// ========================
// Middleware
// ========================


app.use(
    cors({

        origin:[
            "http://localhost:5173",
            "http://localhost:5174",
            "https://pulseplay-v2-f0wz.onrender.com",
            "https://pulseplay.online",
            "https://www.pulseplay.online"
        ],

        credentials:true,

        methods:[
            "GET",
            "POST",
            "PUT",
            "DELETE",
            "OPTIONS"
        ],

        allowedHeaders:[
            "Content-Type",
            "Authorization"
        ]

    })
);



app.use(
    express.json()
);






// ========================
// Health Checks
// ========================


app.get(
    "/",
    (req,res)=>{

        res.json({

            success:true,

            message:"PulsePlay API is running 🚀"

        });

    }
);





app.get(
    "/api/health",
    (req,res)=>{

        res.json({

            status:"ok",

            service:"PulsePlay API"

        });

    }
);







// ========================
// Routes
// ========================


console.log(
    "Loading Twitch routes..."
);


app.use(
    "/api/twitch",
    twitchRoutes
);





console.log(
    "Loading AI routes..."
);


app.use(
    "/api/ai",
    aiRoutes
);


console.log(
    "AI routes mounted at /api/ai"
);





console.log(
    "Loading News routes..."
);


// TEMP TEST ROUTE
app.get(
    "/api/news/direct-test",
    (req,res)=>{

        res.json({

            success:true,

            message:"Direct server news route works"

        });

    }
);



app.use(
    "/api/news",
    newsRoutes
);



console.log(
    "News routes mounted at /api/news"
);







// ========================
// Error Handler
// ========================


app.use(
    (err,req,res,next)=>{

        console.error(
            "Server Error:",
            err
        );


        res.status(500).json({

            success:false,

            error:
            err.message ||
            "Internal server error"

        });

    }
);







// ========================
// Start Server
// ========================


app.listen(
    PORT,
    ()=>{

        console.log(
            `PulsePlay API running on port ${PORT}`
        );

    }
);