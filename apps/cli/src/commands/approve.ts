import { Command } from 'commander';
import chalk from 'chalk';

export const approveCommand = new Command('approve')
  .description('Manually approve a release that is waiting for approval')
  .argument('<releaseId>', 'The ID of the release to approve')
  .action(async (releaseId: string) => {
    console.log(chalk.blue(`Approving release: ${chalk.bold(releaseId)}`));
    console.log(chalk.green('✓ Release approved successfully (Mocked Implementation)'));
  });
