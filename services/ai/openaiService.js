import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const mode =
    process.env.PULSEAI_MODE ||
    "development";

const apiKey =
    process.env.OPENAI_API_KEY;

if (
    mode === "production" &&
    !apiKey
) {
    console.warn(
        "WARNING: OPENAI_API_KEY is not configured."
    );
}

const openai =
    new OpenAI({
        apiKey:
            apiKey || "development-disabled-key"
    });

export function isAIProductionMode() {
    return mode === "production";
}

export function getAIMode() {
    return mode;
}

export default openai;
