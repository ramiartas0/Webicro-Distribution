import { Command } from 'commander';
import chalk from 'chalk';

export const statusCommand = new Command('status')
  .description('Show status of the latest release or a specific release ID')
  .argument('[releaseId]', 'Specific release ID to check status for')
  .action(async (releaseId: string | undefined) => {
    console.log(chalk.blue('Checking release status...'));
    if (releaseId) {
      console.log(`Status for release: ${chalk.bold(releaseId)}`);
    } else {
      console.log('Status for latest release');
    }
    console.log(chalk.green('✓ Release is healthy (Mocked Data)'));
  });
