// Helper to schedule a task at fixed intervals
export function scheduleTask(task: () => Promise<void>, intervalMs: number) {
  async function runTask() {
    // Run the task
    await task();

    // Schedule the next run
    setTimeout(runTask, intervalMs);
  }

  // Schedule the first run
  setTimeout(runTask, intervalMs);
}
