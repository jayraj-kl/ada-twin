# Google Cloud Run

Google Cloud Run is a serverless platform built by Google Cloud. You can run your code in response to events and Google automatically manages the underlying compute resources for you.

Google Cloud Run uses containers to run your service. This means you can use any runtime you like (E.g., Deno or Bun) by providing a Dockerfile. If no Dockerfile is provided Google Cloud Run will use the default Node.js buildpack.

This guide assumes you already have a Google Cloud account and a billing account.

## 1. Install the CLI

When working with Google Cloud Platform, it is easiest to work with the gcloud CLI.

For example, on MacOS using Homebrew:

```bash
brew install --cask gcloud-cli
```

Authenticate with the CLI.

```bash
gcloud auth login
```

## 2. Project setup

Create a project. Accept the auto-generated project ID at the prompt.

```bash
gcloud projects create --set-as-default --name="my app"
```

Create environment variables for your project ID and project number for easy reuse. It may take ~30 seconds before the project successfully returns with the gcloud projects list command.

```bash
PROJECT_ID=$(gcloud projects list \
--format='value(projectId)' \
--filter='name="my app"')

PROJECT_NUMBER=$(gcloud projects list \
--format='value(projectNumber)' \
--filter='name="my app"')

echo $PROJECT_ID $PROJECT_NUMBER
```

Find your billing account ID.

```bash
gcloud billing accounts list
```

Add your billing account from the prior command to the project.

```bash
gcloud billing projects link $PROJECT_ID \
--billing-account=[billing_account_id]
```

Enable the required APIs.

```bash
gcloud services enable run.googleapis.com \
cloudbuild.googleapis.com
```

Update the service account permissions to have access to Cloud Build.

```bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member=serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com \
--role=roles/run.builder
```

## 3. Hello World

Start your project with "create-hono" command. Select nodejs.

```bash
npm create hono@latest my-app
```

Move to my-app and install the dependencies.

```bash
cd my-app
npm i
```

Update the port in `src/index.ts` to be 8080.

```ts
import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
return c.text('Hello Hono!')
})

serve({
fetch: app.fetch,
port: 3000
port: 8080
}, (info) => {
console.log(`Server is running on http://localhost:${info.port}`)
})
```

Run the development server locally. Then, access http://localhost:8080 in your Web browser.

```bash
npm run dev
```

## 4. Deploy

Start the deployment and follow the interactive prompts (E.g., select a region).

```bash
gcloud run deploy my-app --source . --allow-unauthenticated
```
