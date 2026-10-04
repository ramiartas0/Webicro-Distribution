import chalk from 'chalk';
import * as clack from '@clack/prompts';

export interface FinalReportData {
  releaseId: string;
  nextVersion: string;
  buildNumber: number;
  androidArtifactInfo: string;
  androidStatus: 'success' | 'failed' | 'skipped';
  iosArtifactInfo: string;
  iosStatus: 'success' | 'failed' | 'skipped';
  googlePlayStatus: 'success' | 'failed' | 'skipped' | 'pending';
  appStoreStatus: 'success' | 'failed' | 'skipped' | 'pending';
  totalDurationMs: number;
}

export class FinalReporter {
  private formatDuration(ms: number): string {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(' ');
  }

  private formatStatus(status: string): string {
    switch (status) {
      case 'success':
        return chalk.green('✓ Success');
      case 'failed':
        return chalk.red('✗ Failed');
      case 'skipped':
        return chalk.yellow('- Skipped');
      case 'pending':
        return chalk.blue('? Pending');
      default:
        return chalk.gray(status);
    }
  }

  printSummary(data: FinalReportData): void {
    clack.note(
      [
        `Release ID     : ${chalk.bold(data.releaseId)}`,
        `Next Version   : ${chalk.cyan(data.nextVersion)}`,
        `Build Number   : ${chalk.cyan(data.buildNumber.toString())}`,
        '',
        `${chalk.bold('Android:')}`,
        `  Status       : ${this.formatStatus(data.androidStatus)}`,
        `  Artifact     : ${data.androidArtifactInfo}`,
        '',
        `${chalk.bold('iOS:')}`,
        `  Status       : ${this.formatStatus(data.iosStatus)}`,
        `  Artifact     : ${data.iosArtifactInfo}`,
        '',
        `${chalk.bold('Stores:')}`,
        `  Google Play  : ${this.formatStatus(data.googlePlayStatus)}`,
        `  App Store    : ${this.formatStatus(data.appStoreStatus)}`,
        '',
        `Total Duration : ${chalk.magenta(this.formatDuration(data.totalDurationMs))}`,
      ].join('\n'),
      'Release Summary',
    );

    clack.outro(chalk.green('Release process completed!'));
  }
}
