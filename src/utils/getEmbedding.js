require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

async function getEmbedding(text) {
    const embeddings = await getEmbeddings([text]);
    return embeddings[0];
}

async function getEmbeddings(texts) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await ai.models.embedContent({
                model: "gemini-embedding-001",
                contents: texts,
                config: {
                    outputDimensionality: 512
                }
            });

            return response.embeddings.map(({ values }) => values);
        } catch (error) {
            const dailyQuotaExceeded = error.status === 429 && /PerDay|per day/i.test(error.message);
            if (error.status !== 429 || dailyQuotaExceeded || attempt === 3) {
                throw error;
            }

            const retrySeconds = Number(error.message.match(/retry in ([\d.]+)s/i)?.[1]) || 60;
            console.warn(`Embedding quota reached. Retrying in ${retrySeconds}s...`);
            await new Promise((resolve) => setTimeout(resolve, retrySeconds * 1000));
        }
    }
}

module.exports = { getEmbedding, getEmbeddings };

