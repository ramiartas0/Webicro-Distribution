import type { NotificationPayload, ReviewNotificationPayload } from './types.js';

export class ReleaseNotifier {
  public async notify(payload: NotificationPayload, webhooks?: string[]): Promise<void> {
    if (!webhooks || webhooks.length === 0) {
      this.logToConsole(payload);
      return;
    }

    const message = this.formatSlackDiscordMessage(payload);

    const promises = webhooks.map(async (webhookUrl) => {
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        });

        if (!response.ok) {
          console.error(`Failed to send notification to ${webhookUrl}: ${response.statusText}`);
        }
      } catch (err) {
        console.error(`Error sending notification to ${webhookUrl}:`, err);
      }
    });

    await Promise.allSettled(promises);
  }

  public async notifyReviewStatus(
    payload: ReviewNotificationPayload,
    webhooks?: string[],
  ): Promise<void> {
    if (!webhooks || webhooks.length === 0) {
      console.log(
        `\n=== [Review Watcher] ${payload.store.toUpperCase()} - ${payload.project} v${payload.version} ===`,
      );
      console.log(`Durum Değişimi: ${payload.oldStatus ?? 'BAŞLANGIÇ'} ➔ ${payload.newStatus}`);
      if (payload.rejectionDiagnosis) {
        console.log(`[AI Teşhisi]: ${payload.rejectionDiagnosis.guidelineOrPolicy}`);
        console.log(`[Kök Neden]: ${payload.rejectionDiagnosis.rootCause}`);
        if (payload.rejectionDiagnosis.appealDraft) {
          console.log(`[İtiraz Taslağı Hazır]:\n${payload.rejectionDiagnosis.appealDraft}`);
        }
      }
      console.log('========================================================\n');
      return;
    }

    const isRejected = ['REJECTED', 'METADATA_REJECTED', 'DEVELOPER_REJECTED', 'HALTED'].includes(
      payload.newStatus.toUpperCase(),
    );
    const isApproved = ['READY_FOR_SALE', 'COMPLETED', 'RELEASED'].includes(
      payload.newStatus.toUpperCase(),
    );
    const color = isApproved ? 0x00ff00 : isRejected ? 0xff0000 : 0xffff00;

    let text = `*Store Review Status Update*\n*Project*: ${payload.project}\n*Store*: ${payload.store.toUpperCase()}\n*Version*: ${payload.version}\n*Status*: ${payload.oldStatus ?? 'INITIAL'} ➔ *${payload.newStatus}*\n`;

    if (payload.rejectionDiagnosis) {
      text += `\n*AI Rejection Diagnosis*:\n- *Policy/Guideline*: ${payload.rejectionDiagnosis.guidelineOrPolicy}\n- *Root Cause*: ${payload.rejectionDiagnosis.rootCause}\n`;
    }

    const message = {
      content: text,
      embeds: [
        {
          title: `Mağaza İnceleme Güncellemesi: ${payload.project} (${payload.store.toUpperCase()})`,
          description: text,
          color,
        },
      ],
    };

    const promises = webhooks.map(async (webhookUrl) => {
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        });
        if (!response.ok) {
          console.error(`Failed to send review notification to ${webhookUrl}: ${response.statusText}`);
        }
      } catch (err) {
        console.error(`Error sending review notification to ${webhookUrl}:`, err);
      }
    });

    await Promise.allSettled(promises);
  }

  private logToConsole(payload: NotificationPayload): void {
    console.log(
      `\n=== Release Notification: ${payload.project} v${payload.version} (${payload.buildNumber}) ===`,
    );
    console.log(`Status: ${payload.status}`);
    if (payload.iosStatus) console.log(`iOS Status: ${payload.iosStatus}`);
    if (payload.androidStatus) console.log(`Android Status: ${payload.androidStatus}`);
    if (payload.error) console.log(`Error: ${payload.error}`);
    if (payload.notes) console.log(`Notes:\n${payload.notes}`);
    console.log('===============================================\n');
  }

  private formatSlackDiscordMessage(payload: NotificationPayload) {
    const color =
      payload.status === 'SUCCESS'
        ? '#00FF00'
        : payload.status === 'FAILED'
          ? '#FF0000'
          : '#FFFF00';
    let text = `*Release Update: ${payload.project}* \nVersion: ${payload.version} (${payload.buildNumber})\nStatus: ${payload.status}\n`;

    if (payload.iosStatus) text += `iOS: ${payload.iosStatus}\n`;
    if (payload.androidStatus) text += `Android: ${payload.androidStatus}\n`;
    if (payload.error) text += `\nError: ${payload.error}`;
    if (payload.notes) text += `\nNotes: ${payload.notes}`;

    return {
      content: text,
      embeds: [
        {
          title: `Release ${payload.status}: ${payload.project}`,
          description: text,
          color: parseInt(color.replace('#', ''), 16),
        },
      ],
    };
  }
}

