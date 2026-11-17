# FindMyProf

FindMyProf is a timetable assistant that uses a Gemini API to answer questions about classes, professors, subjects, rooms, groups, and timings. Answers are grounded in the timetable PDF included in the project.

## Features

- Natural-language timetable questions
- Professor and subject lookup
- Class, group, room, day, and timing details
- Relevant timetable context shown with each answer
- Cached embeddings for faster subsequent requests

## Requirements

- Node.js 18 or newer
- A Gemini API key with access to embedding and text-generation models

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create an environment file:

   ```bash
   cp .env.example .env
   ```

3. Add your Gemini API key to `.env`:

   ```env
   GEMINI_API_KEY=your_gemini_api_key
   ```

## Run

Start the server:

```bash
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

On the first question, the application generates embeddings from the timetable and stores the cache in `src/database/timetableEmbeddings.json`. The cache is ignored by Git and can be regenerated when needed.

## API

### `POST /api/info`

Request:

```json
{
  "query": "Who teaches DAA in CSDS-3E?"
}
```

Response:

```json
{
  "query": "Who teaches DAA in CSDS-3E?",
  "answer": "...",
  "relevantInfo": []
}
```

## Project structure

```text
public/                 Frontend application
src/server.js           Express server entry point
src/controllers/        HTTP request handling
src/routes/             API routes
src/services/           PDF parsing, retrieval, and answer generation
src/database/timeTable.pdf
                         Source timetable
```

## Security

Never commit `.env` or expose your Gemini API key. If a key has been shared publicly, revoke it and create a replacement in Google AI Studio.
