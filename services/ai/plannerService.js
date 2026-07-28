import supabase from "../../database/supabase.js";


export async function getTodayTask() {

    const today =
        new Date().toLocaleDateString(
            "en-US",
            {
                weekday: "long"
            }
        );


    const { data, error } =
        await supabase
            .from("ai_schedule")
            .select("*")
            .eq(
                "day_of_week",
                today
            )
            .single();


    if(error){
        throw error;
    }


    return data;

}