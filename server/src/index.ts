import dotenv from "dotenv";

// Load environment variables before anything else
dotenv.config();

import { app } from "./app";

const PORT = parseInt(process.env.PORT || "3001", 10);

app.listen(PORT, () => {
  console.log(`[server] Server is running on http://localhost:${PORT}`);
  console.log(`[server] Health check: http://localhost:${PORT}/api/health`);
});
