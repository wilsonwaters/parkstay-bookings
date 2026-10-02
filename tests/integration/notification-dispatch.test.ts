/**
 * NotificationDispatcher delivery logging against a real migrated database.
 *
 * Before v7, every delivery-log insert failed (no such table: main.notifications_old), and
 * the second logDelivery in the dispatcher's catch block threw out of dispatch(), so one
 * failing notifier stopped every notifier after it.
 */

import Database from 'better-sqlite3';
import { TestDatabaseHelper } from '@tests/utils/database-helper';
import { NotificationProviderRepository } from '@main/database/repositories';
import { NotificationDispatcher } from '@main/services/notification/notification-dispatcher';
import { BaseNotificationProvider } from '@main/services/notification/providers/base.provider';
import {
  NotificationChannel,
  NotificationDeliveryResult,
  NotificationMessage,
  ProviderValidationResult,
  TestConnectionResult,
} from '@shared/types';

jest.mock('node-machine-id', () => ({ machineIdSync: () => 'test-machine-id' }));

/** In-memory notifier: records what it receives, or throws when told to. */
class FakeNotifier extends BaseNotificationProvider {
  readonly received: NotificationMessage[] = [];

  constructor(
    channel: NotificationChannel,
    private readonly behaviour: 'deliver' | 'throw'
  ) {
    super(channel, `Fake ${channel}`);
    this.setEnabled(true);
  }

  async send(message: NotificationMessage): Promise<NotificationDeliveryResult> {
    if (this.behaviour === 'throw') throw new Error('SMTP connection reset');
    this.received.push(message);
    return { success: true, messageId: `<${this.channel}-1@example.com>` };
  }

  async testConnection(): Promise<TestConnectionResult> {
    return { success: true, message: 'ok' };
  }

  validate(): ProviderValidationResult {
    return { valid: true, errors: [] };
  }
}

interface LogRow {
  notifier_channel: string;
  status: string;
  message_id: string | null;
  error_message: string | null;
}

describe('NotificationDispatcher delivery logging', () => {
  let dbHelper: TestDatabaseHelper;
  let db: Database.Database;
  let dispatcher: NotificationDispatcher;

  const message: NotificationMessage = { title: 'Availability found', message: 'Site 136 is free' };

  /** Puts fakes in the dispatcher's notifier map, in dispatch order. */
  function useNotifiers(...notifiers: FakeNotifier[]): void {
    const registry = dispatcher.getAllProviders();
    registry.clear();
    for (const notifier of notifiers) registry.set(notifier.getChannel(), notifier);
  }

  function logs(): LogRow[] {
    return db
      .prepare(
        'SELECT notifier_channel, status, message_id, error_message FROM notification_delivery_logs ORDER BY id'
      )
      .all() as LogRow[];
  }

  beforeEach(async () => {
    dbHelper = new TestDatabaseHelper('notification-dispatch');
    db = await dbHelper.setup();
    dispatcher = new NotificationDispatcher(new NotificationProviderRepository(db));
  });

  afterEach(async () => {
    await dbHelper.teardown();
  });

  it('writes a delivery-log row for a successful send', async () => {
    const email = new FakeNotifier(NotificationChannel.EMAIL_SMTP, 'deliver');
    useNotifiers(email);

    const results = await dispatcher.dispatch(message);

    expect(email.received).toEqual([message]);
    expect(results).toEqual([
      {
        channel: NotificationChannel.EMAIL_SMTP,
        result: { success: true, messageId: '<email_smtp-1@example.com>' },
      },
    ]);
    expect(logs()).toEqual([
      {
        notifier_channel: 'email_smtp',
        status: 'sent',
        message_id: '<email_smtp-1@example.com>',
        error_message: null,
      },
    ]);
  });

  it('keeps dispatching to the next notifier after one throws, and logs both', async () => {
    const failing = new FakeNotifier(NotificationChannel.EMAIL_SMTP, 'throw');
    const next = new FakeNotifier(NotificationChannel.DESKTOP, 'deliver');
    useNotifiers(failing, next);

    const results = await dispatcher.dispatch(message);

    expect(next.received).toEqual([message]);
    expect(results.map((r) => [r.channel, r.result.success])).toEqual([
      [NotificationChannel.EMAIL_SMTP, false],
      [NotificationChannel.DESKTOP, true],
    ]);
    expect(logs()).toEqual([
      {
        notifier_channel: 'email_smtp',
        status: 'failed',
        message_id: null,
        error_message: 'SMTP connection reset',
      },
      {
        notifier_channel: 'desktop',
        status: 'sent',
        message_id: '<desktop-1@example.com>',
        error_message: null,
      },
    ]);
  });
});
