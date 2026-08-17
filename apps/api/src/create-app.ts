import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

export async function createAethinaApp() {
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn", "log"] });
  const config = app.get(ConfigService);
  const configuredOrigins = (config.get<string>("CORS_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: [
      /^http:\/\/127\.0\.0\.1:517[34]$/,
      /^http:\/\/localhost:517[34]$/,
      /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:5174$/,
      /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}:5174$/,
      /^http:\/\/172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}:5174$/,
      /^https:\/\/aethina-[a-z0-9-]+\.vercel\.app$/,
      /^https:\/\/aethina-sms-[a-z0-9-]+\.vercel\.app$/,
      "tauri://localhost",
      ...configuredOrigins
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  return app;
}
