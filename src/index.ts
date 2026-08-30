import "dotenv/config";
import { createServer } from "./server";
import { startScheduler } from "./scheduler";

const PORT = Number(process.env.PORT) || 3000;

const app = createServer();

app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
  startScheduler();
});
