const express = require("express");
const { infoMatch } = require("../controllers/infoController");

const router = express.Router();

router.post("/", infoMatch);

module.exports = router;
