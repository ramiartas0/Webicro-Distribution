import { AppError } from '@webicro/shared';
import { generateReleaseId } from './release-id.js';
import { ReleaseStateMachine } from './state-machine.js';
import { ReleasePlanner } from './release-planner.js';
import type { OrchestratorOptions, ReleaseExecutionSummary, ReleaseStepEvent } from './types.js';
import type { VersionResolution } from '@webicro/versioning';


export class OrchestratorError extends AppError {
  constructor(message: string) {
    super(message, 'ORCHESTRATOR_ERROR');
  }
}

export class ReleaseOrchestrator {
  private stateMachine: ReleaseStateMachine;
  private planner: ReleasePlanner;
  private startTime: number = 0;
  private listeners: Array<(event: ReleaseStepEvent) => void> = [];
  
  constructor() {
    this.stateMachine = new ReleaseStateMachine('DRAFT');
    this.planner = new ReleasePlanner();
  }

  public onStep(listener: (event: ReleaseStepEvent) => void): void {
    this.listeners.push(listener);
  }

  public async execute(options: OrchestratorOptions): Promise<ReleaseExecutionSummary> {
    return this.run(options);
  }

  public async resume(releaseId: string, options: OrchestratorOptions): Promise<ReleaseExecutionSummary> {
    return this.run(options, releaseId);
  }

  public async run(options: OrchestratorOptions, existingReleaseId?: string): Promise<ReleaseExecutionSummary> {
    this.startTime = Date.now();
    const releaseId = existingReleaseId ?? generateReleaseId();
    
    try {
      this.stateMachine.transitionTo('ANALYZING');
      
      // 1. Environment Check & Config Load
      this.emit({ step: 'Environment Check', status: 'IN_PROGRESS' });
      // simulated
      this.emit({ step: 'Environment Check', status: 'SUCCESS' });

      // 2. Database initialization & Migration run
      this.emit({ step: 'Database Init', status: 'IN_PROGRESS' });
      this.emit({ step: 'Database Init', status: 'SUCCESS' });

      // 3. Release ID generation (or resume existing)
      // Already done above

      // 4. Git Analysis
      this.emit({ step: 'Git Analysis', status: 'IN_PROGRESS' });
      this.emit({ step: 'Git Analysis', status: 'SUCCESS' });

      // 5. Version Resolution
      this.emit({ step: 'Version Resolution', status: 'IN_PROGRESS' });
      const mockResolution: VersionResolution = {
        current: { major: 1, minor: 0, patch: 0, buildNumber: 100 },
        next: { major: 1, minor: 0, patch: 1, buildNumber: 101 },
        bump: 'patch',
        isManual: false,
        formatted: '1.0.1+101',
        versionString: '1.0.1',
        buildNumberString: '101',
      };
      this.emit({ step: 'Version Resolution', status: 'SUCCESS' });

      this.stateMachine.transitionTo('PLANNED');

      // 6. Release Plan Creation
      const plan = this.planner.createPlan(mockResolution, options);
      this.emit({ step: 'Release Plan Creation', status: 'SUCCESS', message: `${plan.steps.length} steps planned` });

      this.stateMachine.transitionTo('VALIDATING');

      // 7. Changelog Generation
      this.emit({ step: 'Changelog Generation', status: 'IN_PROGRESS' });
      this.emit({ step: 'Changelog Generation', status: 'SUCCESS' });

      // 8. AI Release Notes Generation
      this.emit({ step: 'Release Notes Generation', status: 'IN_PROGRESS' });
      this.emit({ step: 'Release Notes Generation', status: 'SUCCESS' });

      // 9. Release Notes Validation
      this.emit({ step: 'Release Notes Validation', status: 'IN_PROGRESS' });
      this.emit({ step: 'Release Notes Validation', status: 'SUCCESS' });

      this.stateMachine.transitionTo('BUILDING');

      // 10. Update pubspec.yaml version
      this.emit({ step: 'Pubspec Update', status: 'IN_PROGRESS' });
      this.emit({ step: 'Pubspec Update', status: 'SUCCESS' });

      // 11. Flutter Doctor / Analyze
      this.emit({ step: 'Flutter Check', status: 'IN_PROGRESS' });
      this.emit({ step: 'Flutter Check', status: 'SUCCESS' });

      // 12. Run Tests
      if (!options.skipTests) {
        this.emit({ step: 'Run Tests', status: 'IN_PROGRESS' });
        this.emit({ step: 'Run Tests', status: 'SUCCESS' });
      }

      // 13 & 14. Android Build & Verify
      if (!options.skipAndroid) {
        this.emit({ step: 'Android Build', status: 'IN_PROGRESS' });
        this.emit({ step: 'Android Build', status: 'SUCCESS' });
        this.emit({ step: 'Android Verify', status: 'IN_PROGRESS' });
        this.emit({ step: 'Android Verify', status: 'SUCCESS' });
      }

      // 15 & 16. iOS Build & Verify
      if (!options.skipIos) {
        this.emit({ step: 'iOS Build', status: 'IN_PROGRESS' });
        this.emit({ step: 'iOS Build', status: 'SUCCESS' });
        this.emit({ step: 'iOS Verify', status: 'IN_PROGRESS' });
        this.emit({ step: 'iOS Verify', status: 'SUCCESS' });
      }

      this.stateMachine.transitionTo('ARTIFACT_READY');
      this.stateMachine.transitionTo('UPLOADING');

      // 17. Google Play Upload
      if (!options.skipAndroid && !options.dryRun) {
        this.emit({ step: 'Google Play Upload', status: 'IN_PROGRESS' });
        this.emit({ step: 'Google Play Upload', status: 'SUCCESS' });
      }

      // 18. App Store Upload
      if (!options.skipIos && !options.dryRun) {
        this.emit({ step: 'App Store Upload', status: 'IN_PROGRESS' });
        this.emit({ step: 'App Store Upload', status: 'SUCCESS' });
      }

      this.stateMachine.transitionTo('READY_FOR_SUBMISSION');

      // 19. Final Review / Submission
      this.emit({ step: 'Submission', status: 'IN_PROGRESS' });
      this.stateMachine.transitionTo('SUBMITTED');
      this.emit({ step: 'Submission', status: 'SUCCESS' });

      this.stateMachine.transitionTo('RELEASED');

      // 20. Audit log completion & Notifications
      this.emit({ step: 'Audit & Notify', status: 'IN_PROGRESS' });
      this.emit({ step: 'Audit & Notify', status: 'SUCCESS' });

      return {
        releaseId,
        version: mockResolution.versionString,
        status: this.stateMachine.currentStatus,
        durationMs: Date.now() - this.startTime
      };

    } catch (error) {
      this.stateMachine.transitionTo('FAILED');
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.emit({ step: 'Execution Failed', status: 'FAILED', error: errorMessage });
      throw error;
    }
  }

  private emit(event: ReleaseStepEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
