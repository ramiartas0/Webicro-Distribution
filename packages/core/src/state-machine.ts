import { AppError } from '@webicro/shared';
import type { ReleaseStatus } from '@webicro/database';

export type { ReleaseStatus };

export class StateMachineError extends AppError {
  constructor(message: string) {
    super(message, 'STATE_MACHINE_ERROR');
  }
}

export class ReleaseStateMachine {
  private status: ReleaseStatus;

  private static readonly transitions: Record<ReleaseStatus, ReleaseStatus[]> = {
    DRAFT: ['ANALYZING', 'FAILED'],
    ANALYZING: ['PLANNED', 'FAILED'],
    PLANNED: ['VALIDATING', 'FAILED'],
    VALIDATING: ['BUILDING', 'FAILED'],
    BUILDING: ['ARTIFACT_READY', 'FAILED'],
    ARTIFACT_READY: ['UPLOADING', 'FAILED'],
    UPLOADING: ['STORE_PROCESSING', 'READY_FOR_SUBMISSION', 'SUBMITTED', 'FAILED'],
    STORE_PROCESSING: ['READY_FOR_SUBMISSION', 'FAILED'],
    READY_FOR_SUBMISSION: ['SUBMITTED', 'FAILED'],
    SUBMITTED: ['RELEASED', 'FAILED'],
    RELEASED: ['FAILED'],
    FAILED: ['ANALYZING', 'FAILED'] // Allow retry/resume
  };

  constructor(initialStatus: ReleaseStatus = 'DRAFT') {
    this.status = initialStatus;
  }

  public get currentStatus(): ReleaseStatus {
    return this.status;
  }

  public canTransitionTo(nextStatus: ReleaseStatus): boolean {
    if (nextStatus === 'FAILED') return true; // ANY STATE -> FAILED
    const allowed = ReleaseStateMachine.transitions[this.status];
    return allowed?.includes(nextStatus) ?? false;
  }

  public transitionTo(nextStatus: ReleaseStatus): void {
    if (!this.canTransitionTo(nextStatus)) {
      throw new StateMachineError(
        `Cannot transition from ${this.status} to ${nextStatus}`
      );
    }
    
    // In a real application, this would record to DB & audit via injected services.
    // Since we just have the class spec, we change state.
    this.status = nextStatus;
  }
}
