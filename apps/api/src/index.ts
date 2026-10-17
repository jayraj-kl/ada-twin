import { serve } from "@hono/node-server";
import { modelCatalog } from "@repo/agent";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { log, requestLogger, unhandled } from "./logging";
import { modelPicker, models } from "./routes/models";
import { plant } from "./routes/plant";
import { run } from "./routes/run";
import { twin } from "./routes/twin";
import { worlds } from "./routes/worlds";

const app = new Hono();

const LOCAL_ORIGINS = ["http://localhost:3000"];
const origins =
  process.env.WEB_ORIGIN?.split(",").map((origin) => origin.trim()) ??
  LOCAL_ORIGINS;
app.use(requestLogger);
app.use(
  cors({
    origin: origins,
    allowHeaders: ["Content-Type", "X-Request-Id", "X-Text-Model", "X-Image-Model"],
    exposeHeaders: ["X-Request-Id"],
  }),
);
app.use(modelPicker);
app.onError(unhandled);

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.route("/models", models);
app.route("/worlds", worlds);
app.route("/twin", twin);
app.route("/run", run);
app.route("/plant", plant);

const server = serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT) || 8080,
  },
  (info) => {
    // .env is read once at startup, so this is what this process actually
    // got. Restart the server after editing .env.
    log.info(`listening on http://localhost:${info.port}`, {
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION ?? "global",
      model: modelCatalog().text.default,
      imageModel: modelCatalog().image.default,
      origins,
    });
    if (!process.env.GOOGLE_CLOUD_PROJECT) {
      log.warn(
        "GOOGLE_CLOUD_PROJECT is not set: twin, run and plant answer 503",
      );
    }
    if (!process.env.WORLD_LABS_API_KEY) {
      log.warn("WORLD_LABS_API_KEY is not set: worlds cannot be generated");
    }
  },
);

process.on("unhandledRejection", (error) => {
  log.error("unhandled rejection", { error });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    log.info(`${signal}: shutting down`);
    server.close(() => process.exit(0));
    // Streams still open (a shift being run) would hold it up.
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
