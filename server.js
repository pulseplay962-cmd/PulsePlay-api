import express from "express";
import cors from "cors";
import "dotenv/config";

import twitchRouter from "./routes/twitch.js";
import aiRoutes from "./routes/aiRoutes.js";


const app = express();


// =========================
// CORS
// =========================

const allowedOrigins = [
  "http://localhost:5173",
  "https://pulseplay-v2-f0wz.onrender.com",
  "https://pulseplay.online",
  "https://www.pulseplay.online"
];


app.use(
  cors({

    origin: function(origin, callback) {

      // Allow server-to-server requests
      if(!origin) {
        return callback(null, true);
      }


      if(allowedOrigins.includes(origin)) {

        return callback(null, true);

      }


      return callback(
        new Error("Not allowed by CORS")
      );

    },

    credentials: true

  })
);



app.use(express.json());





// =========================
// API Status
// =========================


app.get("/", (req,res)=>{

  res.json({

    success:true,

    message:"PulsePlay API is running 🚀",

    environment:
      process.env.NODE_ENV || "development"

  });

});





app.get("/api/health",(req,res)=>{

  res.json({

    success:true,

    status:"ok",

    service:"PulsePlay API"

  });

});





// =========================
// Routes
// =========================


app.use(
  "/api/twitch",
  twitchRouter
);


app.use(
  "/api/ai",
  aiRoutes
);






// =========================
// Unknown Routes
// =========================


app.use((req,res)=>{

  res.status(404).json({

    success:false,

    error:"Route not found",

    path:req.originalUrl

  });

});






// =========================
// Error Handler
// =========================


app.use((err,req,res,next)=>{


  console.error(
    "API ERROR:",
    err
  );


  res.status(500).json({

    success:false,

    error:
      err.message || "Server error"

  });


});






const PORT =
  process.env.PORT || 3000;



app.listen(PORT,()=>{


  console.log(
    `PulsePlay API running on port ${PORT}`
  );


  console.log(
    "AI Route: /api/ai/generate"
  );


});