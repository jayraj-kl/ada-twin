import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { run } from "./routes/run";
import { twin } from "./routes/twin";
import { worlds } from "./routes/worlds";

const app = new Hono();

// The web app is served from a different origin.
app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000" }));

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.route("/worlds", worlds);
app.route("/twin", twin);
app.route("/run", run);

serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT) || 8080,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
    // .env is read once at startup, so this shows what this process actually
    // got. Restart the server after editing .env.
    const secret = (name: string) => (process.env[name] ? "set" : "MISSING");
    console.log("Config:", {
      GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT ?? "MISSING",
      GOOGLE_CLOUD_LOCATION: process.env.GOOGLE_CLOUD_LOCATION ?? "global (default)",
      WEB_ORIGIN: process.env.WEB_ORIGIN ?? "http://localhost:3000 (default)",
      WORLD_LABS_API_KEY: secret("WORLD_LABS_API_KEY"),
      DATABASE_URL: secret("DATABASE_URL"),
    });
  },
);
