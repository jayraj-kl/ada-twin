/** Runs a script's entry point, printing a failure instead of a stack trace. */
export async function main(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
