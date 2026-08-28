import openai, {
    isAIProductionMode
} from "./openaiService.js";
import { supabase } from "../../lib/supabase.js";


// =====================================
// PulsePlay AI Image Model
// =====================================

const IMAGE_MODEL = "gpt-image-1-mini";


// =====================================
// Generate AI Image
// =====================================

export async function generateImage(prompt) {

    try {

        if (!isAIProductionMode()) {

            console.log(
                "PULSEAI DEVELOPMENT MODE: local image placeholder"
            );

            const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024">
    <rect width="1536" height="1024" fill="#050816"/>
    <rect x="70" y="70" width="1396" height="884" rx="40" fill="#0b1024" stroke="#22d3ee" stroke-width="4"/>
    <text x="768" y="430" text-anchor="middle" fill="#22d3ee" font-family="Arial, sans-serif" font-size="64" font-weight="900">
        PULSEPLAY
    </text>
    <text x="768" y="510" text-anchor="middle" fill="#a78bfa" font-family="Arial, sans-serif" font-size="34">
        AI DEVELOPMENT IMAGE
    </text>
    <text x="768" y="580" text-anchor="middle" fill="#94a3b8" font-family="Arial, sans-serif" font-size="22">
        OpenAI disabled during testing
    </text>
</svg>`;

            return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");

        }

        console.log(
            "================================="
        );

        console.log(
            "STARTING AI IMAGE GENERATION"
        );

        console.log(
            "IMAGE MODEL:",
            IMAGE_MODEL
        );

        console.log(
            "PROMPT:",
            prompt
        );

        console.log(
            "================================="
        );


        // =====================================
        // Validate Prompt
        // =====================================

        if (
            !prompt ||
            typeof prompt !== "string" ||
            prompt.trim().length === 0
        ) {

            throw new Error(
                "Image prompt is required"
            );

        }


        // =====================================
        // Call OpenAI Image API
        // =====================================

        console.log(
            "Calling OpenAI image API..."
        );


        const response =
            await openai.images.generate({

                model: IMAGE_MODEL,

                prompt: prompt.trim(),

                size: "1536x1024",

                output_format: "png"

            });


        // =====================================
        // Inspect OpenAI Response
        // =====================================

        console.log(
            "OPENAI IMAGE RESPONSE RECEIVED"
        );

        console.log(
            "RESPONSE DATA COUNT:",
            response?.data?.length
        );


        if (!response) {

            throw new Error(
                "OpenAI returned an empty response"
            );

        }


        const imageData =
            response?.data?.[0];


        if (!imageData) {

            console.error(
                "FULL OPENAI RESPONSE:",
                JSON.stringify(
                    response,
                    null,
                    2
                )
            );

            throw new Error(
                "OpenAI returned no image data"
            );

        }


        console.log(
            "IMAGE RESPONSE KEYS:",
            Object.keys(imageData)
        );


        // =====================================
        // Get Base64 Image
        // =====================================

        const base64 =
            imageData.b64_json;


        if (
            !base64 ||
            typeof base64 !== "string"
        ) {

            console.error(
                "IMAGE DATA:",
                imageData
            );

            throw new Error(
                "OpenAI did not return b64_json image data"
            );

        }


        console.log(
            "BASE64 IMAGE RECEIVED"
        );

        console.log(
            "BASE64 LENGTH:",
            base64.length
        );


        // =====================================
        // Validate Base64
        // =====================================

        if (
            base64.length < 1000
        ) {

            console.error(
                "BASE64 RESPONSE IS SUSPICIOUSLY SMALL:"
            );

            console.error(
                base64
            );

            throw new Error(
                `OpenAI returned suspiciously small image data: ${base64.length} base64 characters`
            );

        }


        // =====================================
        // Convert Base64 → Buffer
        // =====================================

        let imageBuffer;


        try {

            imageBuffer =
                Buffer.from(
                    base64,
                    "base64"
                );

        } catch (decodeError) {

            console.error(
                "BASE64 DECODE ERROR:",
                decodeError
            );

            throw new Error(
                "Failed to decode OpenAI image data"
            );

        }


        console.log(
            "DECODED IMAGE BUFFER SIZE:",
            imageBuffer.length,
            "bytes"
        );


        // =====================================
        // Validate Buffer
        // =====================================

        if (
            !imageBuffer ||
            imageBuffer.length === 0
        ) {

            throw new Error(
                "Decoded image buffer is empty"
            );

        }


        if (
            imageBuffer.length < 10000
        ) {

            console.error(
                "INVALID IMAGE BUFFER:"
            );

            console.error(
                "BUFFER SIZE:",
                imageBuffer.length
            );

            throw new Error(
                `Generated image is suspiciously small: ${imageBuffer.length} bytes`
            );

        }


        // =====================================
        // Validate PNG Signature
        // =====================================

        const pngSignature =
            imageBuffer
                .subarray(0, 8)
                .toString("hex");


        console.log(
            "PNG SIGNATURE:",
            pngSignature
        );


        if (
            pngSignature !==
            "89504e470d0a1a0a"
        ) {

            console.error(
                "INVALID PNG SIGNATURE:"
            );

            console.error(
                pngSignature
            );

            throw new Error(
                "Generated file is not a valid PNG"
            );

        }


        console.log(
            "VALID PNG IMAGE CONFIRMED"
        );


        // =====================================
        // Create Storage Filename
        // =====================================

        const fileName =
            "queue-" +
            Date.now() +
            "-" +
            Math.random()
                .toString(36)
                .substring(2, 10) +
            ".png";


        console.log(
            "STORAGE FILE:",
            fileName
        );


        // =====================================
        // Upload To Supabase
        // =====================================

        console.log(
            "Uploading image to Supabase..."
        );


        const {
            data: uploadData,
            error: uploadError
        } =
            await supabase
                .storage
                .from("ai-images")
                .upload(

                    fileName,

                    imageBuffer,

                    {
                        contentType:
                            "image/png",

                        cacheControl:
                            "3600",

                        upsert:
                            false
                    }

                );


        if (uploadError) {

            console.error(
                "SUPABASE STORAGE UPLOAD ERROR:",
                uploadError
            );

            throw uploadError;

        }


        console.log(
            "SUPABASE UPLOAD SUCCESS:",
            uploadData
        );


        // =====================================
        // Get Public URL
        // =====================================

        const {
            data: publicUrlData
        } =
            supabase
                .storage
                .from("ai-images")
                .getPublicUrl(
                    fileName
                );


        const publicUrl =
            publicUrlData?.publicUrl;


        console.log(
            "PUBLIC IMAGE URL:",
            publicUrl
        );


        if (!publicUrl) {

            throw new Error(
                "Supabase did not return a public image URL"
            );

        }


        // =====================================
        // Complete
        // =====================================

        console.log(
            "================================="
        );

        console.log(
            "IMAGE GENERATION COMPLETE"
        );

        console.log(
            "IMAGE URL:",
            publicUrl
        );

        console.log(
            "================================="
        );


        return publicUrl;


    } catch (error) {

        console.error(
            "================================="
        );

        console.error(
            "IMAGE GENERATION FAILED"
        );

        console.error(
            error
        );

        console.error(
            "================================="
        );


        throw error;

    }

}