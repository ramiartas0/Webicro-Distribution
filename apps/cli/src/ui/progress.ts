import ora, { type Ora } from 'ora';
import chalk from 'chalk';

export interface ProgressStep {
  name: string;
}

export class ProgressReporter {
  private spinner: Ora | null = null;
  private totalSteps = 0;
  private currentStepIndex = 0;
  private isHeadless: boolean;

  constructor(totalSteps: number, isHeadless = false) {
    this.totalSteps = totalSteps;
    this.isHeadless = isHeadless;
  }

  private formatStepMessage(message: string): string {
    const paddedIndex = String(this.currentStepIndex).padStart(String(this.totalSteps).length, '0');
    return `[${paddedIndex}/${this.totalSteps}] ${message}`;
  }

  startStep(step: ProgressStep): void {
    this.currentStepIndex++;
    const message = this.formatStepMessage(step.name);

    if (this.isHeadless) {
      console.log(`${message} - Started`);
    } else {
      if (this.spinner) {
        this.spinner.stop();
      }
      this.spinner = ora(message).start();
    }
  }

  succeedStep(message?: string): void {
    if (this.isHeadless) {
      console.log(`✓ Completed${message ? `: ${message}` : ''}`);
    } else if (this.spinner) {
      this.spinner.succeed(this.spinner.text + (message ? ` ${chalk.green('✓')} ${message}` : ''));
      this.spinner = null;
    }
  }

  failStep(error: Error | string): void {
    const errorMessage = error instanceof Error ? error.message : error;
    if (this.isHeadless) {
      console.error(`✗ Failed: ${errorMessage}`);
    } else if (this.spinner) {
      this.spinner.fail(this.spinner.text + ` ${chalk.red('✗')} ${errorMessage}`);
      this.spinner = null;
    }
  }

  skipStep(reason?: string): void {
    if (this.isHeadless) {
      console.log(`- Skipped${reason ? `: ${reason}` : ''}`);
    } else if (this.spinner) {
      this.spinner.info(
        this.spinner.text + ` ${chalk.yellow('- Skipped')}${reason ? ` ${reason}` : ''}`,
      );
      this.spinner = null;
    }
  }

  info(message: string): void {
    if (this.isHeadless) {
      console.log(`ℹ ${message}`);
    } else {
      if (this.spinner && this.spinner.isSpinning) {
        this.spinner.clear();
      }
      console.log(chalk.cyan('ℹ'), message);
    }
  }
}
