const express = require("express");
const path = require("path");
const infoRoute = require("./routes/infoRoute");

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.static(path.resolve(__dirname, "../public")));
app.use("/api/info", infoRoute);

app.use((req, res) => {
	res.status(404).json({ error: "Route not found" });
});

app.use((error, req, res, next) => {
	console.error(error);
	res.status(500).json({ error: "Internal server error" });
});

if (require.main === module) {
	app.listen(port, () => {
		console.log(`Server listening on port ${port}`);
	});
}

module.exports = app;
