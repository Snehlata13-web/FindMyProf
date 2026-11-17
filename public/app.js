const form = document.querySelector("#question-form");
const questionInput = document.querySelector("#question");
const result = document.querySelector("#result");
const submitButton = form.querySelector("button[type='submit']");

function renderResult(data) {
    const contextItems = data.relevantInfo.map((item) => `
        <div class="context-item">
            <strong>Page ${item.pageNumber}</strong><br>
            ${item.text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
        </div>
    `).join("");

    result.innerHTML = `
        <article class="result-card">
            <p class="result-meta"><span class="result-pulse"></span>Answer found · ${data.relevantInfo.length} matches</p>
            <p class="answer">${data.answer.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
            <button class="context-toggle" type="button">+ Show supporting context</button>
            <div class="context">${contextItems}</div>
        </article>
    `;

    result.querySelector(".context-toggle").addEventListener("click", (event) => {
        const context = result.querySelector(".context");
        context.classList.toggle("open");
        event.currentTarget.textContent = context.classList.contains("open")
            ? "− Hide supporting context"
            : "+ Show supporting context";
    });
}

async function askQuestion(event) {
    event.preventDefault();
    const query = questionInput.value.trim();
    if (!query) return;

    submitButton.disabled = true;
    submitButton.querySelector("span:first-child").textContent = "Searching timetable...";
    result.innerHTML = '<p class="loading">Reading the timetable and finding the closest match...</p>';

    try {
        const response = await fetch("/api/info", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Something went wrong.");
        renderResult(data);
    } catch (error) {
        result.innerHTML = `<p class="error">${error.message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
    } finally {
        submitButton.disabled = false;
        submitButton.querySelector("span:first-child").textContent = "Ask timetable";
    }
}

form.addEventListener("submit", askQuestion);

for (const button of document.querySelectorAll("[data-question]")) {
    button.addEventListener("click", () => {
        questionInput.value = button.dataset.question;
        questionInput.focus();
    });
}

questionInput.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        form.requestSubmit();
    }
});
