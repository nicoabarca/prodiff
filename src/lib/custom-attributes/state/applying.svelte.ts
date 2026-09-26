/**
 * The write in progress, if any. While it runs the project's files are being
 * rewritten, so the project layout covers every view with its message.
 */
export const applying = $state<{ message: string | null }>({ message: null });

/** Runs `write` with the project blocked and labelled. */
export async function whileApplying<T>(message: string, write: () => Promise<T>): Promise<T> {
  applying.message = message;
  try {
    return await write();
  } finally {
    applying.message = null;
  }
}
