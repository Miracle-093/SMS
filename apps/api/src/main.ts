import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { createAethinaApp } from "./create-app.js";

const app = await createAethinaApp();
const config = app.get(ConfigService);
const port = config.get<number>("API_PORT") ?? 4000;
const host = config.get<string>("API_HOST") ?? "0.0.0.0";
await app.listen(port, host);
console.log(`Aethina API listening on http://${host}:${port}`);
