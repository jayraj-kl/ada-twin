// Builds the API image on Cloud Build and rolls it out to Cloud Run.
// One-time project setup is in ./README.md.
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SERVICE = process.env.API_SERVICE ?? "ada-twin-api";
const REGION = process.env.GCP_REGION ?? "africa-south1";
const REPOSITORY = process.env.ARTIFACT_REPOSITORY ?? "ada-twin-cloud-run";
const SQL_INSTANCE = process.env.SQL_INSTANCE ?? "ada-twin";
const BUCKET = process.env.GCS_BUCKET ?? "gen-lang-client-0447144465-ada-twin-files";

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

// The database schema goes first, from the same image, as a one-off job on
// Cloud SQL's socket. If it fails, the deploy stops and the running revision
// keeps serving.
const MIGRATE_JOB = `${SERVICE}-migrate`;
gcloud(
  "run",
  "jobs",
  "deploy",
  MIGRATE_JOB,
  `--project=${project}`,
  `--region=${REGION}`,
  `--image=${image}`,
  "--command=node",
  "--args=dist/migrate.js",
  `--set-cloudsql-instances=${project}:${REGION}:${SQL_INSTANCE}`,
  "--set-secrets=DATABASE_URL=DATABASE_URL:latest",
  "--max-retries=0",
  "--task-timeout=600",
);
gcloud(
  "run",
  "jobs",
  "execute",
  MIGRATE_JOB,
  `--project=${project}`,
  `--region=${REGION}`,
  "--wait",
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
  // Cloud Run mounts the database's Unix socket under /cloudsql/, which
  // DATABASE_URL points at.
  `--add-cloudsql-instances=${project}:${REGION}:${SQL_INSTANCE}`,
  "--update-secrets=WORLD_LABS_API_KEY=WORLD_LABS_API_KEY:latest,DATABASE_URL=DATABASE_URL:latest",
];
// Gemini is reached through Vertex AI as the service account, so no key.
const env = [
  `GOOGLE_CLOUD_PROJECT=${project}`,
  `GOOGLE_CLOUD_LOCATION=${process.env.GOOGLE_CLOUD_LOCATION ?? "global"}`,
  `GCS_BUCKET=${BUCKET}`,
];
// Left alone when unset, so a redeploy keeps the origins already configured.
if (process.env.WEB_ORIGIN) env.push(`WEB_ORIGIN=${process.env.WEB_ORIGIN}`);
// WEB_ORIGIN lists origins with commas, gcloud's usual separator, so the
// variables are separated with ## instead (gcloud's ^##^ syntax). cmd reads
// ^ as an escape, except inside double quotes.
const envFlag = `--update-env-vars=^##^${env.join("##")}`;
deploy.push(shell ? `"${envFlag}"` : envFlag);
gcloud(...deploy);
