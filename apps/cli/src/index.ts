import { Command } from 'commander';
import { releaseCommand } from './commands/release.js';
import { statusCommand } from './commands/status.js';
import { resumeCommand } from './commands/resume.js';
import { retryCommand } from './commands/retry.js';
import { rollbackCommand } from './commands/rollback.js';
import { logsCommand } from './commands/logs.js';
import { approveCommand } from './commands/approve.js';
import { uiCommand } from './commands/ui.js';

async function main(): Promise<void> {
  const program = new Command();

  program.name('release').description('AI-Powered Flutter Release Orchestrator');

  program.addCommand(releaseCommand, { isDefault: true });
  program.addCommand(uiCommand);
  program.addCommand(statusCommand);
  program.addCommand(resumeCommand);
  program.addCommand(retryCommand);
  program.addCommand(rollbackCommand);
  program.addCommand(logsCommand);
  program.addCommand(approveCommand);

  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  console.error(
    'An unexpected error occurred:',
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
