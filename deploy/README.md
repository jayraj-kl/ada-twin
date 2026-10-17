# Deployment

Everything for building and shipping the API lives in this folder, plus `compose.yaml` and `.gcloudignore` at the repository root.

## Run the container locally

With Docker running, from the repository root:

```sh
docker compose up --build
```

This builds the same image Cloud Run gets and serves it on http://localhost:8080. Keys come from `apps/api/.env`. Use it to check a build before deploying; `pnpm dev` is still the way to develop.

## Deploy to Cloud Run

After the one-time setup below, every deploy is:

```sh
pnpm run deploy
```

It builds `deploy/api.Dockerfile` on Cloud Build, pushes the image to Artifact Registry and rolls it out to Cloud Run. It prints the service URL when it finishes.

### One-time setup

You need a Google Cloud account with billing enabled.

1. Install the [gcloud CLI](https://cloud.google.com/sdk/docs/install), then sign in:

   ```sh
   gcloud auth login
   ```

2. Create a project and make it the default. Project IDs are global, so pick your own:

   ```sh
   gcloud projects create <project-id> --set-as-default
   ```

3. Link billing. List your accounts, then link one:

   ```sh
   gcloud billing accounts list
   gcloud billing projects link <project-id> --billing-account=<billing-account-id>
   ```

4. Enable the services the deploy uses:

   ```sh
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com aiplatform.googleapis.com sqladmin.googleapis.com sql-component.googleapis.com
   ```

5. Create the image repository. The region must match the deploy region (`africa-south1` by default):

   ```sh
   gcloud artifacts repositories create ada-twin-cloud-run --repository-format=docker --location=africa-south1
   ```

6. Store the World Labs key as a secret. The command prompts for the value; paste it, press Enter, then end the input (Ctrl+Z then Enter on Windows, Ctrl+D elsewhere). Gemini needs no key: it runs on Vertex AI in the same project.

   ```sh
   gcloud secrets create WORLD_LABS_API_KEY --data-file=-
   ```

7. Let the service read the secret and call Vertex AI. Cloud Run runs as the default compute service account:

   ```sh
   gcloud projects describe <project-id> --format="value(projectNumber)"
   gcloud projects add-iam-policy-binding <project-id> --member=serviceAccount:<project-number>-compute@developer.gserviceaccount.com --role=roles/secretmanager.secretAccessor
   gcloud projects add-iam-policy-binding <project-id> --member=serviceAccount:<project-number>-compute@developer.gserviceaccount.com --role=roles/aiplatform.user
   ```

### Settings

The deploy script reads these environment variables:

| Variable                | Default                  | Purpose                                      |
| ----------------------- | ------------------------ | -------------------------------------------- |
| `GCP_PROJECT`           | gcloud's default project | Project to deploy into                       |
| `GCP_REGION`            | `africa-south1`          | Cloud Run and Artifact Registry region       |
| `API_SERVICE`           | `ada-twin-api`           | Cloud Run service name                       |
| `ARTIFACT_REPOSITORY`   | `ada-twin-cloud-run`     | Artifact Registry repository                 |
| `SQL_INSTANCE`          | `ada-twin`               | Cloud SQL instance the service connects to   |
| `WEB_ORIGIN`            | unchanged                | Origin the API accepts browser requests from |
| `GOOGLE_CLOUD_LOCATION` | `global`                 | Vertex AI location Gemini is called in       |

The API only answers browsers on `WEB_ORIGIN`, and falls back to the two local apps, `http://localhost:3000` (frontend) and `http://localhost:3067` (web). Once the web app has a URL, deploy once with it set; later deploys keep it:

```sh
# PowerShell
$env:WEB_ORIGIN = "https://<web-url>"; pnpm run deploy
```

To change a key, add a new secret version and redeploy:

```sh
gcloud secrets versions add WORLD_LABS_API_KEY --data-file=-
```

### Notes

- The service is public (`--allow-unauthenticated`) because the browser calls it directly. Anyone with the URL can spend your Gemini and World Labs credits, so the script caps it at 3 instances.
- Requests can run for up to an hour, since `/run` streams until the simulated shift ends.
