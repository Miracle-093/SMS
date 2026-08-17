import "reflect-metadata";
import { type INestApplication } from "@nestjs/common";

let cachedApp: INestApplication | null = null;
const compiledAppPath = "../apps/api/dist/create-app.js";

export default async function handler(req: unknown, res: unknown) {
  let app: INestApplication | null = cachedApp;
  if (!app) {
    const { createAethinaApp } = (await import(compiledAppPath)) as {
      createAethinaApp: () => Promise<INestApplication>;
    };
    app = await createAethinaApp();
    await app.init();
    cachedApp = app;
  }

  const expressInstance = app.getHttpAdapter().getInstance();
  return expressInstance(req, res);
}
