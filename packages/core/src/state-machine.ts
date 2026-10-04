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
    ARTIFACT_READY: ['UPLOADING', 'READY_FOR_SUBMISSION', 'SUBMITTED', 'RELEASED', 'FAILED'],
    UPLOADING: ['STORE_PROCESSING', 'READY_FOR_SUBMISSION', 'SUBMITTED', 'RELEASED', 'FAILED'],
    STORE_PROCESSING: ['READY_FOR_SUBMISSION', 'FAILED'],
    READY_FOR_SUBMISSION: ['SUBMITTED', 'FAILED'],
    SUBMITTED: ['RELEASED', 'FAILED'],
    RELEASED: ['FAILED'],
    FAILED: ['ANALYZING', 'FAILED'],
  };

  constructor(initialStatus: ReleaseStatus = 'DRAFT') {
    this.status = initialStatus;
  }

  public get currentStatus(): ReleaseStatus {
    return this.status;
  }

  public canTransitionTo(nextStatus: ReleaseStatus): boolean {
    if (nextStatus === 'FAILED') return true;
    const allowed = ReleaseStateMachine.transitions[this.status];
    return allowed?.includes(nextStatus) ?? false;
  }

  public transitionTo(nextStatus: ReleaseStatus): void {
    if (!this.canTransitionTo(nextStatus)) {
      throw new StateMachineError(`Cannot transition from ${this.status} to ${nextStatus}`);
    }

    this.status = nextStatus;
  }
}
