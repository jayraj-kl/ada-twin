// Builds the frontend against the Cloud Run API and deploys it to Firebase
// Hosting (https://ada-twin.web.app). Setup is in ./README.md.
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// pnpm and firebase are .cmd shims on Windows, which only a shell can launch.
const shell = process.platform === "win32";
const root = fileURLToPath(new URL("..", import.meta.url));
const frontend = fileURLToPath(new URL("../apps/frontend", import.meta.url));

function run(command, args, cwd, env = {}) {
  const { status } = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell,
    env: { ...process.env, ...env },
  });
  if (status !== 0) process.exit(status ?? 1);
}

function gcloudValue(...args) {
  try {
    return execFileSync("gcloud", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      shell,
    }).trim();
  } catch {
    return "";
  }
}

const PROJECT =
  process.env.GCP_PROJECT ?? gcloudValue("config", "get-value", "project");
if (!PROJECT || PROJECT === "(unset)") {
  console.error(
    "No Google Cloud project. Set GCP_PROJECT or run `gcloud config set project <id>` (see deploy/README.md).",
  );
  process.exit(1);
}

// The browser calls the API directly: Firebase Hosting would cut a rewritten
// request off after 60 seconds, and a shift streams for longer.
const API_URL =
  process.env.VITE_API_URL ??
  gcloudValue(
    "run",
    "services",
    "describe",
    process.env.API_SERVICE ?? "ada-twin-api",
    `--project=${PROJECT}`,
    `--region=${process.env.GCP_REGION ?? "africa-south1"}`,
    "--format=value(status.url)",
  );
if (!API_URL) {
  console.error(
    "No API URL. Deploy the API first (`pnpm run deploy`) or set VITE_API_URL.",
  );
  process.exit(1);
}

console.log(`Building the frontend against ${API_URL}`);
run("pnpm", ["--filter", "frontend", "build"], root, { VITE_API_URL: API_URL });
run(
  "firebase",
  ["deploy", "--only", "hosting", `--project=${PROJECT}`],
  frontend,
);
