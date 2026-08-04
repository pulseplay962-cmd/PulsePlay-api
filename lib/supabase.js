import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();


console.log(
    "SUPABASE URL:",
    supabaseUrl
);




if (!supabaseUrl) {
    throw new Error(
        "Missing SUPABASE_URL"
    );
}


if (!supabaseServiceKey) {
    throw new Error(
        "Missing SUPABASE_SERVICE_ROLE_KEY"
    );
}


export const supabase =
    createClient(
        supabaseUrl,
        supabaseServiceKey,
        {
            auth:{
                autoRefreshToken:false,
                persistSession:false,
                detectSessionInUrl:false
            }
        }
    );


export default supabase;