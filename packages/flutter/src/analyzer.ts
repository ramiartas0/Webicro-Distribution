import { exec } from 'child_process';
import { promisify } from 'util';
import type { FlutterAnalyzeResult } from './types.js';

const execAsync = promisify(exec);

export class FlutterAnalyzer {
  async analyze(cwd?: string): Promise<FlutterAnalyzeResult> {
    try {
      const { stdout } = await execAsync('flutter analyze', { cwd });

      return {
        hasErrors: false,
        errorCount: 0,
        warningCount: 0,
        output: stdout,
      };
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'stdout' in error &&
        typeof (error as Record<string, unknown>).stdout === 'string'
      ) {
        const stdout = (error as Record<string, unknown>).stdout as string;

        const errorMatch = stdout.match(/(\d+) issue\(s\) found/);
        const totalIssues = errorMatch ? parseInt(errorMatch[1], 10) : 0;

        const errorLineMatch = stdout.match(/error •/g);
        const errorCount = errorLineMatch ? errorLineMatch.length : 0;
        const warningCount = totalIssues - errorCount;

        return {
          hasErrors: totalIssues > 0,
          errorCount,
          warningCount: warningCount > 0 ? warningCount : 0,
          output: stdout,
        };
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        hasErrors: true,
        errorCount: 1,
        warningCount: 0,
        output: errorMessage,
      };
    }
  }
}
