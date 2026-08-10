require("dotenv").config();

    const app = require("./src/app");

    const PORT = Number(process.env.PORT) || 5000;

    app.listen(PORT, () => {
    console.log(`[recruweb-backend] API listening on http://localhost:${PORT}`);
    });
    