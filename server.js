const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");

const app = express();
app.use(cors());
app.use(express.json());

app.post("/predict", (req, res) => {
    const prices = req.body.prices;

    if (!prices || !Array.isArray(prices)) {
        return res.json({ error: "prices must be an array" });
    }

    const py = spawn("python3", ["price_predictor.py"]);

    let dataString = "";

    py.stdin.write(JSON.stringify(prices));
    py.stdin.end();

    py.stdout.on("data", (data) => {
        dataString += data.toString();
    });

    py.stdout.on("end", () => {
        try {
            const result = JSON.parse(dataString);
            res.json(result);
        } catch (e) {
            res.json({ error: "Python returned invalid JSON" });
        }
    });

    py.stderr.on("data", (data) => {
        console.error("Python error:", data.toString());
    });
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});
