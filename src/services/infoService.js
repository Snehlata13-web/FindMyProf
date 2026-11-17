const fs = require("fs");
const path = require("path");
const { PDFParse } = require("pdf-parse");
const { GoogleGenAI } = require("@google/genai");
const { getEmbedding, getEmbeddings } = require("../utils/getEmbedding.js");

const filepath = path.resolve(__dirname, "../database/timeTable.pdf");
const embeddingsFilepath = path.resolve(__dirname, "../database/timetableEmbeddings.json");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
let documentPromise;

async function extractTextFromPDF(filePath) {
    const dataBuffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: dataBuffer });
    const data = await parser.getText();
    await parser.destroy();
    return data.text;
}

async function extractTablesFromPDF(filePath) {
    const dataBuffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: dataBuffer });
    const data = await parser.getTable({ first: 12 });
    await parser.destroy();
    return data.pages;
}

async function createEmbeddings(chunks) {
    const embeddingList = [];
    const batchSize = 10;

    for (let index = 0; index < chunks.length; index += batchSize) {
        const batch = chunks.slice(index, index + batchSize);
        const embeddings = await getEmbeddings(batch.map((chunk) => chunk.text));
        embeddingList.push(...batch.map((chunk, batchIndex) => ({
            ...chunk,
            embedding: embeddings[batchIndex]
        })));
    }

    return embeddingList;
}

function loadDocument() {
    if (!documentPromise) {
        documentPromise = (async () => {
            const sourceStats = fs.statSync(filepath);
            if (fs.existsSync(embeddingsFilepath)) {
                try {
                    const savedDocument = JSON.parse(fs.readFileSync(embeddingsFilepath, "utf8"));
                    if (savedDocument.version === 3 && savedDocument.sourceModifiedAt === sourceStats.mtimeMs && savedDocument.pages?.length) {
                        return { pages: savedDocument.pages };
                    }
                } catch (error) {
                    console.warn("Saved embeddings could not be loaded; rebuilding them.");
                }
            }

            const [text, tables] = await Promise.all([
                extractTextFromPDF(filepath),
                extractTablesFromPDF(filepath)
            ]);
            const pages = createPageChunks(text, tables);
            const pageEmbeddings = await createEmbeddings(pages);
            const objectChunks = pageEmbeddings.flatMap((page) => page.objects);
            const objectEmbeddings = await createEmbeddings(objectChunks);
            const objectsByPage = new Map();
            for (const object of objectEmbeddings) {
                if (!objectsByPage.has(object.pageNumber)) {
                    objectsByPage.set(object.pageNumber, []);
                }
                objectsByPage.get(object.pageNumber).push(object);
            }
            const embeddingList = pageEmbeddings.map((page) => ({
                ...page,
                objects: objectsByPage.get(page.pageNumber) || []
            }));
            const savedDocument = {
                sourceModifiedAt: sourceStats.mtimeMs,
                createdAt: new Date().toISOString(),
                pages: embeddingList,
                version: 3
            };
            const temporaryFilepath = `${embeddingsFilepath}.tmp`;
            fs.writeFileSync(temporaryFilepath, JSON.stringify(savedDocument));
            fs.renameSync(temporaryFilepath, embeddingsFilepath);
            return { pages: embeddingList };
        })().catch((error) => {
            documentPromise = null;
            throw error;
        });
    }

    return documentPromise;
}

function createPageChunks(text, tables = []) {
    const markers = [...text.matchAll(/-- (\d+) of \d+ --/g)];
    return markers.map((marker, index) => ({
        pageNumber: Number(marker[1]),
        text: text.slice(marker.index, markers[index + 1]?.index || text.length).trim(),
        objects: createPageObjects(
            Number(marker[1]),
            text.slice(marker.index, markers[index + 1]?.index || text.length).trim(),
            tables
        )
    }));
}

function teacherMapForClass(pageText, className) {
    const start = pageText.indexOf(`Data Science ${className}`);
    const end = pageText.indexOf("Teachers:", start);
    const map = new Map();
    if (start === -1) return map;

    for (const line of pageText.slice(start, end === -1 ? pageText.length : end).split("\n")) {
        const match = line.trim().match(/^(\d{4}|TT\d?)\s+(.+)$/);
        if (match) map.set(match[1], match[2].trim());
    }
    return map;
}

function createPageObjects(pageNumber, pageText, tables) {
    const tablePage = tables.find((page) =>
        page.tables.some((table) => JSON.stringify(table).includes(pageText.match(/\b[A-Z]+-\d[A-Z]\b/)?.[0] || "__missing__"))
    );
    const timetable = tablePage?.tables.find((table) =>
        table.some((row) => row.some((cell) => /\b[A-Z]+-\d[A-Z]\b/.test(cell))) &&
        table.some((row) => row.some((cell) => cell.includes("9:10 - 10:00")))
    );
    if (!timetable) return [];

    const header = timetable.find((row) => row.some((cell) => cell.includes("9:10 - 10:00")));
    const times = new Map();
    header.forEach((cell, index) => {
        const match = cell.match(/(\d{1,2}:\d{2} - \d{1,2}:\d{2})/);
        if (match) times.set(index, match[1]);
    });
    const days = { Mo: "Monday", Tu: "Tuesday", We: "Wednesday", Th: "Thursday", Fr: "Friday" };
    const objects = [];

    for (const row of timetable) {
        const day = days[row[0]?.trim()];
        if (!day) continue;
        for (const [column, timing] of times) {
            const cell = row[column]?.trim();
            const classMatch = cell?.match(/\b([A-Z]+-\d[A-Z])\b/);
            if (!cell || !classMatch) continue;

            const className = classMatch[1];
            const teacherId = cell.match(/(\d{4}|TT\d?)(?=CTM-|[\s\n]|$)/)?.[1] || "";
            const room = cell.match(/CTM-\d+/)?.[0] || "";
            const group = cell.match(/Group\s+\d+/i)?.[0] || "";
            const subject = cell
                .replace(className, "")
                .replace(teacherId, "")
                .replace(room, "")
                .replace(group, "")
                .replace(/\s+/g, " ")
                .trim();
            const professor = teacherMapForClass(pageText, className).get(teacherId) || teacherId || "Not specified";
            const record = { pageNumber, className, professor, subject, group, timing, day, teacherId, room };
            objects.push({
                ...record,
                text: `Class: ${className}\nProfessor: ${professor}\nSubject: ${subject}\nGroup: ${group || "Not specified"}\nDay: ${day}\nTiming: ${timing}\nRoom: ${room}`
            });
        }
    }
    return objects;
}

function cosineSimilarity(a, b) {
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        magnitudeA += a[i] ** 2;
        magnitudeB += b[i] ** 2;
    }

    return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

function normalizeQuery(query) {
    return query
        .replace(/\b([A-Za-z]+)\s+([A-Za-z]+)\s+(\d[A-Za-z])\b/g, "$1$2-$3")
        .replace(/\b([A-Za-z]+)\s+(\d[A-Za-z])\b/g, "$1-$2");
}

async function findRelevantInfo(query) {
    const [queryEmbedding, document] = await Promise.all([
        getEmbedding(normalizeQuery(query)),
        loadDocument()
    ]);

    const relevantPages = document.pages.map((page) => ({
        page,
        similarity: cosineSimilarity(queryEmbedding, page.embedding)
    }));
        relevantPages.sort((a, b) => b.similarity - a.similarity);

    const relevantItems = document.pages.flatMap((page) => {
        const pageSimilarity = relevantPages.find((entry) => entry.page === page)?.similarity || 0;
        return (page.objects || []).map((object) => ({
            item: object,
            similarity: cosineSimilarity(queryEmbedding, object.embedding),
            pageSimilarity
        }));
    });
        relevantItems.sort((a, b) => b.similarity - a.similarity);

    return relevantItems.slice(0, 5).map(({ item, similarity }) => ({
        pageNumber: item.pageNumber,
        className: item.className,
        professor: item.professor,
        subject: item.subject,
        group: item.group,
        timing: item.timing,
        day: item.day,
        teacherId: item.teacherId,
        room: item.room,
        text: item.text,
        similarity
    }));
}

async function answerQuery(query) {
    const relevantInfo = await findRelevantInfo(query);
    const context = relevantInfo
        .map((item, index) => `Context ${index + 1}:\n${item.text}`)
        .join("\n\n");
    const contents = `Answer the user's query using only the context below. Do not use outside knowledge. If the context does not contain the answer, say that the information is not available in the provided context.\n\nContext:\n${context}\n\nUser query: ${query}`;
    let response;

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            response = await ai.models.generateContent({
                model: process.env.ANSWER_MODEL || "gemma-4-26b-a4b-it",
                contents
            });
            break;
        } catch (error) {
            const retryable = error.status === 429;
            if (!retryable || attempt === 3) {
                break;
            }

            const retrySeconds = Number(error.message.match(/retry in ([\d.]+)s/i)?.[1]) || attempt * 3;
            console.warn(`Answer model unavailable. Retrying in ${retrySeconds}s...`);
            await new Promise((resolve) => setTimeout(resolve, retrySeconds * 1000));
        }
    }

    if (!response) {
        return {
            answer: "The answer model is temporarily unavailable. Your matching timetable pages were found; please try again shortly.",
            relevantInfo
        };
    }

    return { answer: response.text, relevantInfo };
}

module.exports = {
    answerQuery,
    findRelevantInfo,
    createPageChunks,
    extractTablesFromPDF
};
