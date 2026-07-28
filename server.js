import express from "express";
import cors from "cors";
import "dotenv/config";

import twitchRouter from "./routes/twitch.js";
import aiRoutes from "./routes/aiRoutes.js";


const app = express();


app.use(cors({
  origin:[
    "http://localhost:5173",
    "https://pulseplay-v2-f0wz.onrender.com",
    "https://pulseplay.online",
    "https://www.pulseplay.online"
  ],
  credentials:true
}));


app.use(express.json());



app.get("/", (req,res)=>{
  res.json({
    success:true,
    message:"PulsePlay API is running 🚀"
  });
});


app.get("/api/health",(req,res)=>{
  res.json({
    status:"ok"
  });
});



console.log("Loading Twitch routes...");
app.use("/api/twitch", twitchRouter);


console.log("Loading AI routes...");
app.use("/api/ai", aiRoutes);



const PORT = process.env.PORT || 3000;


app.listen(PORT,()=>{
  console.log(`PulsePlay API running on port ${PORT}`);
});