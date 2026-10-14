// Builds the API image on Cloud Build and rolls it out to Cloud Run.
// One-time project setup is in ./README.md.
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SERVICE = process.env.API_SERVICE ?? "ada-twin-api";
const REGION = process.env.GCP_REGION ?? "asia-south1";
const REPOSITORY = process.env.ARTIFACT_REPOSITORY ?? "cloud-run";

// gcloud is a .cmd shim on Windows, which only a shell can launch.
const shell = process.platform === "win32";
const root = fileURLToPath(new URL("..", import.meta.url));

function gcloud(...args) {
  const { status } = spawnSync("gcloud", args, {
    cwd: root,
    stdio: "inherit",
    shell,
  });
  if (status !== 0) process.exit(status ?? 1);
}

let project = process.env.GCP_PROJECT;
if (!project) {
  try {
    project = execFileSync("gcloud", ["config", "get-value", "project"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      shell,
    }).trim();
  } catch {
    // Reported below, along with the unset case.
  }
}
if (!project || project === "(unset)") {
  console.error(
    "No Google Cloud project. Install gcloud, then run `gcloud auth login` and `gcloud config set project <id>` (see deploy/README.md).",
  );
  process.exit(1);
}

const tag = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const image = `${REGION}-docker.pkg.dev/${project}/${REPOSITORY}/${SERVICE}:${tag}`;

gcloud(
  "builds",
  "submit",
  ".",
  `--project=${project}`,
  "--config=deploy/cloudbuild.yaml",
  `--substitutions=_IMAGE=${image}`,
);

const deploy = [
  "run",
  "deploy",
  SERVICE,
  `--project=${project}`,
  `--region=${REGION}`,
  `--image=${image}`,
  "--allow-unauthenticated",
  // A run streams agent decisions for as long as the shift takes to simulate.
  "--timeout=3600",
  "--max-instances=3",
  "--update-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest,WORLD_LABS_API_KEY=WORLD_LABS_API_KEY:latest",
];
// Left alone when unset, so a redeploy keeps the origin already configured.
if (process.env.WEB_ORIGIN) {
  deploy.push(`--update-env-vars=WEB_ORIGIN=${process.env.WEB_ORIGIN}`);
}
gcloud(...deploy);
