const { answerQuery } = require("../services/infoService");

async function infoMatch(req, res, next) {
	const { query } = req.body || {};

	if (typeof query !== "string" || query.trim().length === 0) {
		return res.status(400).json({
			error: "The request body must include a non-empty query string."
		});
	}

	try {
		const { answer, relevantInfo } = await answerQuery(query.trim());
		return res.json({
			query: query.trim(),
			answer,
			relevantInfo
		});
	} catch (error) {
		if (error.status === 429) {
			return res.status(429).json({
				error: "Embedding quota exhausted. The page and object embeddings need to be generated after the Gemini daily quota resets."
			});
		}
		return next(error);
	}
}

module.exports = { infoMatch };