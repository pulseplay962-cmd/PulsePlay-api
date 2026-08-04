import dotenv from "dotenv";

dotenv.config();

const base64Placeholder =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

function makeArticleResponse(topic) {
    const cleanTopic = topic ? topic.trim() : "PulsePlay AI Content";

    return {
        title: cleanTopic,
        metaDescription:
            "A PulsePlay AI-generated article preview for gaming news and community updates.",
        article:
            "This is a PulsePlay AI-generated article preview. It includes gaming news, analysis, and community insights tailored for the PulsePlay brand.",
        facebookPost:
            "Check out the latest PulsePlay AI content update! #PulsePlay #Gaming",
        imagePrompt:
            "A futuristic gaming scene with neon purple and cyan accents, perfect for PulsePlay promotional artwork.",
        hashtags: ["#PulsePlay", "#Gaming", "#Esports"],
    };
}

function makeWeeklyResponse() {
    const days = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
    ];

    return {
        posts: days.map((day) => ({
            title: `PulsePlay ${day} Update`,
            content_type: day === "Wednesday" ? "poll" : "article",
            category: "Community",
            body: `This is a PulsePlay AI-generated ${day} content preview for the gaming community.`,
            social_caption: `PulsePlay ${day} update is live!`,
            image_prompt: `Futuristic gaming graphic for ${day} with neon purple and cyan highlights.`,
            hashtags: ["#PulsePlay", "#Gaming", `#${day}`],
        })),
    };
}

const openai = {
    development: true,
    images: {
        async generate({ model, prompt, size }) {
            console.log("OpenAI stub image generate", { model, prompt, size });
            return {
                data: [
                    {
                        b64_json: base64Placeholder,
                    },
                ],
            };
        },
    },
    chat: {
        completions: {
            async create({ model, response_format, messages }) {
                const userMessage =
                    messages?.find((message) => message.role === "user")?.content || "";

                if (userMessage.includes("Create 7 gaming posts")) {
                    return {
                        choices: [
                            {
                                message: {
                                    content: JSON.stringify(makeWeeklyResponse()),
                                },
                            },
                        ],
                    };
                }

                const topicMatch = userMessage.match(/Topic:\s*([^\n]+)/);
                const topic = topicMatch ? topicMatch[1].trim() : "PulsePlay AI Content";

                return {
                    choices: [
                        {
                            message: {
                                content: JSON.stringify(makeArticleResponse(topic)),
                            },
                        },
                    ],
                };
            },
        },
    },
    async generate() {
        return {
            success: true,
            development: true,
            content: "PulseAI Development Mode is active.",
        };
    },
};

export default openai;
