import { Storage } from "@google-cloud/storage";
import { HTTPException } from "hono/http-exception";

/**
 * Files a project keeps in Cloud Storage: drawn images, run event logs, and
 * uploaded panoramas and documents. The bucket is private; the page reads and
 * writes files through the API. Everything for a project sits under
 * `<prefix>projects/<id>/`, so deleting a project deletes one folder.
 * GCS_PREFIX keeps local development apart (`dev/`) in the shared bucket.
 */
let storage: Storage | undefined;

function bucket() {
  const name = process.env.GCS_BUCKET;
  if (!name) {
    throw new HTTPException(503, {
      message: "GCS_BUCKET is not set (put it in apps/api/.env)",
    });
  }
  // Signs in as the service account on Cloud Run, with gcloud's ADC locally.
  storage ??= new Storage();
  return storage.bucket(name);
}

export const storageConfigured = () => Boolean(process.env.GCS_BUCKET);

const prefix = () => process.env.GCS_PREFIX ?? "";

/** Where one of a project's files lives in the bucket. */
export const projectPath = (projectId: string, ...parts: string[]) =>
  `${prefix()}projects/${projectId}/${parts.join("/")}`;

export async function writeFile(
  path: string,
  data: Buffer | string,
  contentType: string,
) {
  await bucket()
    .file(path)
    .save(data, { contentType, resumable: false });
}

export async function writeJson(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value), "application/json");
}

/** A file's bytes and type, or null when it does not exist. */
export async function readFile(path: string) {
  const file = bucket().file(path);
  try {
    const [[data], [metadata]] = await Promise.all([
      file.download(),
      file.getMetadata(),
    ]);
    return {
      data,
      contentType: metadata.contentType ?? "application/octet-stream",
    };
  } catch (error) {
    if ((error as { code?: number }).code === 404) return null;
    throw error;
  }
}

export async function readJson<T>(path: string): Promise<T | null> {
  const file = await readFile(path);
  return file ? (JSON.parse(file.data.toString("utf8")) as T) : null;
}

export async function deleteFile(path: string) {
  await bucket().file(path).delete({ ignoreNotFound: true });
}

/** Deletes every file of a project. */
export async function deleteProjectFiles(projectId: string) {
  await bucket().deleteFiles({ prefix: projectPath(projectId), force: true });
}
