import type { ParsedCommit } from '@webicro/git';
import type { ReleaseNotesMap } from '@webicro/validation';
import type { AIProvider } from './types.js';
import { buildAIContext } from './context-builder.js';
import { AISafetyChecker } from './safety.js';

export class AIError extends Error {
  constructor(
    message: string,
    public readonly warnings: string[] = [],
  ) {
    super(message);
    this.name = 'AIError';
  }
}

export interface ReleaseNotesValidator {
  validate(data: unknown): ReleaseNotesMap;
}

export class AIController {
  private safetyChecker: AISafetyChecker;

  constructor(
    private readonly provider: AIProvider,
    private readonly validator: ReleaseNotesValidator,
  ) {
    this.safetyChecker = new AISafetyChecker();
  }

  public async generate(
    version: string,
    commits: ParsedCommit[],
    languages?: string[],
  ): Promise<ReleaseNotesMap> {
    const context = buildAIContext(version, commits, languages);

    const notes = await this.provider.generateReleaseNotes(context);

    let validatedNotes: ReleaseNotesMap;
    try {
      validatedNotes = this.validator.validate(notes);
    } catch (e: unknown) {
      const errMessage = e instanceof Error ? e.message : String(e);
      throw new AIError(`Validation failed: ${errMessage}`);
    }

    const warnings = this.safetyChecker.check(validatedNotes, commits);
    if (warnings.length > 0) {
      throw new AIError('Safety check failed with warnings', warnings);
    }

    return validatedNotes;
  }
}
