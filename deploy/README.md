# Deployment

Everything for building and shipping the API lives in this folder, plus `compose.yaml` and `.gcloudignore` at the repository root.

## Run the container locally

With Docker running, from the repository root:

```sh
docker compose up --build
```

This builds the same image Cloud Run gets and serves it on http://localhost:8080. Keys come from `apps/api/.env`. Use it to check a build before deploying; `pnpm dev` is still the way to develop.

## Deploy the frontend to Firebase Hosting

The frontend is served at https://ada-twin.web.app (Firebase Hosting site `ada-twin` in the same Google Cloud project). After the API is deployed:

```sh
pnpm run deploy:web
```

It builds `apps/frontend` with `VITE_API_URL` pointing at the Cloud Run API and runs `firebase deploy --only hosting` with `apps/frontend/firebase.json`. The browser calls the API directly rather than through a Hosting rewrite, because Hosting cuts rewritten requests off after 60 seconds and a shift streams for longer. The bundled demo world in `apps/frontend/public/worlds/current` (gitignored, fetched with `pnpm --filter @repo/scripts fetch-world <worldId>`) is deployed with it.

One-time setup: install the CLI (`npm install -g firebase-tools`), run `firebase login`, and add Firebase to the project in the Firebase console. The API must allow the site's origins, which a deploy keeps once set:

```sh
# PowerShell
$env:WEB_ORIGIN = "https://ada-twin.web.app,https://ada-twin.firebaseapp.com,http://localhost:3000"; pnpm run deploy
```

## Deploy to Cloud Run

After the one-time setup below, every deploy is:

```sh
pnpm run deploy
```

It builds `deploy/api.Dockerfile` on Cloud Build and pushes the image to Artifact Registry. It then runs the database migrations as a Cloud Run job (`ada-twin-api-migrate`, the same image running `dist/migrate.js` on Cloud SQL's socket) and, once they succeed, rolls the image out to Cloud Run. A failed migration stops the deploy and the running revision keeps serving. It prints the service URL when it finishes.

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

8. Create the database: a Cloud SQL Postgres instance in the deploy region, a database and a user, and store its connection string as a secret. On Cloud Run it connects through the instance's socket, so the string has no host:

   ```sh
   gcloud sql instances create ada-twin --database-version=POSTGRES_18 --region=africa-south1 --edition=ENTERPRISE --tier=db-g1-small
   gcloud sql databases create ada-twin --instance=ada-twin
   gcloud sql users create ada_app --instance=ada-twin --password=<password>
   # postgresql://ada_app:<password>@/ada-twin?host=/cloudsql/<project-id>:africa-south1:ada-twin
   gcloud secrets create DATABASE_URL --data-file=-
   gcloud projects add-iam-policy-binding <project-id> --member=serviceAccount:<project-number>-compute@developer.gserviceaccount.com --role=roles/cloudsql.client
   ```

   The deploy's migrations job creates the tables.

9. Create the bucket for project files (drawings, run logs, uploads). It stays private; the page reads files through the API:

   ```sh
   gcloud storage buckets create gs://<project-id>-ada-twin-files --location=africa-south1 --uniform-bucket-level-access --public-access-prevention
   gcloud storage buckets add-iam-policy-binding gs://<project-id>-ada-twin-files --member=serviceAccount:<project-number>-compute@developer.gserviceaccount.com --role=roles/storage.objectAdmin
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
| `GCS_BUCKET`            | this project's bucket    | Cloud Storage bucket for project files       |
| `WEB_ORIGIN`            | unchanged                | Origin the API accepts browser requests from |
| `GOOGLE_CLOUD_LOCATION` | `global`                 | Vertex AI location Gemini is called in       |

The API only answers browsers on `WEB_ORIGIN` (comma-separated), and falls back to the local frontend, `http://localhost:3000`. Once the web app has a URL, deploy once with it set; later deploys keep it:

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
- Local development does not touch Cloud SQL or the production files: it uses the Postgres in `compose.yaml` and the same bucket under `GCS_PREFIX=dev/` (see `apps/api/.env.example`).
