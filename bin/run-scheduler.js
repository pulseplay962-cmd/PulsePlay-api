#!/usr/bin/env node
import dotenv from "dotenv";
dotenv.config();

// Publishing must be explicitly enabled; default to safe, review-first behavior.
if (typeof process.env.AUTO_PUBLISH === "undefined") {
  process.env.AUTO_PUBLISH = "false";
}

import scheduler from "../services/workers/scheduler.js";

async function main(){
  try{
    await scheduler.runOnce();
    process.exit(0);
  }catch(err){
    console.error(err);
    process.exit(1);
  }
}

main();
