/**
 * Contract parity: every contract method has exactly one registered handler, every
 * registered channel is in the contract, channel names follow `<namespace>:<kebab-method>`,
 * and no request schema accepts a `userId`.
 */

import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { contract, CHANNELS, EVENT_NAMES } from '@shared/contracts';
import { DEFAULT_WATCH_INTERVAL, WATCH_INTERVAL_OPTIONS } from '@shared/contracts/watches';
import type { MethodDef } from '@shared/contracts/define';
import { openDatabase } from '@main/database/connection';
import { createContainer, AppContainer } from '@main/app/container';
import { registerIpcHandlers } from '@main/ipc';
import { FakeIpcMain, TEST_LOGS_DIR } from '@tests/utils/ipc-harness';

import { containerSecrets } from '@tests/utils/fake-safe-storage';

jest.mock('electron', () => jest.requireActual('@tests/utils/electron-mocks').electron());
jest.mock('electron-updater', () =>
  jest.requireActual('@tests/utils/electron-mocks').electronUpdater()
);
jest.mock('node-machine-id', () => ({ machineIdSync: () => 'test-machine-id' }));

const methods = (): Array<[string, string, MethodDef]> =>
  Object.entries(contract).flatMap(([namespace, defs]) =>
    Object.entries(defs as Record<string, MethodDef>).map(
      ([method, def]) => [namespace, method, def] as [string, string, MethodDef]
    )
  );

const kebab = (name: string): string => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Every object key a schema accepts, at any depth. */
function schemaKeys(schema: z.ZodTypeAny): string[] {
  if (schema instanceof z.ZodObject) {
    return Object.entries(schema.shape as Record<string, z.ZodTypeAny>).flatMap(([key, value]) => [
      key,
      ...schemaKeys(value),
    ]);
  }
  if (schema instanceof z.ZodEffects) return schemaKeys(schema.innerType());
  if (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault
  ) {
    return schemaKeys(schema._def.innerType);
  }
  if (schema instanceof z.ZodArray) return schemaKeys(schema.element);
  if (schema instanceof z.ZodRecord) return schemaKeys(schema.valueSchema);
  if (schema instanceof z.ZodUnion || schema instanceof z.ZodDiscriminatedUnion) {
    return (schema.options as z.ZodTypeAny[]).flatMap(schemaKeys);
  }
  if (schema instanceof z.ZodIntersection) {
    return [...schemaKeys(schema._def.left), ...schemaKeys(schema._def.right)];
  }
  return [];
}

describe('IPC contract', () => {
  it('names every channel <namespace>:<kebab-method>, matching channels.ts, all unique', () => {
    const all = methods();
    for (const [namespace, method, def] of all) {
      expect(def.channel).toBe(`${namespace}:${kebab(method)}`);
      expect(def.channel).toBe(
        (CHANNELS as Record<string, Record<string, string>>)[namespace][method]
      );
    }
    expect(new Set(all.map(([, , def]) => def.channel)).size).toBe(all.length);

    const channelCount = Object.values(CHANNELS).reduce((n, ns) => n + Object.keys(ns).length, 0);
    expect(channelCount).toBe(all.length);
    // Event names never collide with invoke channels
    const eventNames: readonly string[] = EVENT_NAMES;
    expect(all.map(([, , def]) => def.channel).filter((c) => eventNames.includes(c))).toEqual([]);
  });

  it('watches, snipes and bookings (V4): list filters, the interval options, provider imports, no sync', () => {
    for (const namespace of ['watches', 'snipes', 'bookings'] as const) {
      const list = contract[namespace].list.request;
      expect(list.safeParse(undefined).success).toBe(true);
      expect(list.safeParse({}).success).toBe(true);
      expect(list.safeParse({ providerId: 'parkstay' }).success).toBe(true);
      expect(list.safeParse({ providerId: 'Not An Id' }).success).toBe(false);
    }
    expect(contract.watches.list.request.safeParse({ status: 'active' }).success).toBe(true);
    expect(contract.watches.list.request.safeParse({ status: 'armed' }).success).toBe(false);

    expect(WATCH_INTERVAL_OPTIONS).toEqual([15, 30, 60, 240, 720, 1440]);
    expect(DEFAULT_WATCH_INTERVAL).toBe(60);
    const interval = (minutes: number) =>
      contract.watches.update.request.safeParse({
        id: 1,
        updates: { checkIntervalMinutes: minutes },
      }).success;
    expect(WATCH_INTERVAL_OPTIONS.every(interval)).toBe(true);
    expect([5, 45, 0].some(interval)).toBe(false);
    expect(schemaKeys(contract.watches.create.request)).toContain('autoHold');
    expect(schemaKeys(contract.watches.create.request)).not.toContain('autoBook');

    expect(
      contract.bookings.import.request.safeParse({ providerId: 'parkstay', reference: 'PB123' })
        .success
    ).toBe(true);
    expect(Object.keys(CHANNELS.bookings)).not.toEqual(expect.arrayContaining(['sync']));
    expect(Object.values(CHANNELS.bookings)).not.toContain('bookings:sync-all');
    expect(Object.keys(contract.bookings)).toEqual(expect.not.arrayContaining(['sync', 'syncAll']));
  });

  it('has no request schema with a key named userId', () => {
    const offenders: string[] = [];
    let keysSeen = 0;
    for (const [namespace, method, def] of methods()) {
      const keys = schemaKeys(def.request);
      keysSeen += keys.length;
      if (keys.includes('userId')) offenders.push(`${namespace}.${method}`);
    }

    expect(offenders).toEqual([]);
    // The walk reaches nested keys, so an empty result means something
    expect(schemaKeys(contract.watches.update.request)).toEqual(
      expect.arrayContaining(['id', 'updates', 'location', 'externalId', 'stay', 'arrival'])
    );
    expect(keysSeen).toBeGreaterThan(80);
  });

  it('exposes no Gmail inbox reads: not in the contract, the preload or the renderer', () => {
    const src = path.resolve(__dirname, '../../../src');
    const files = ['preload', 'shared/contracts', 'renderer'].flatMap((dir) =>
      (fs.readdirSync(path.join(src, dir), { recursive: true }) as string[])
        .map((name) => path.join(src, dir, name))
        .filter((file) => /\.tsx?$/.test(file))
    );
    const offenders = files.filter((file) =>
      /getRecentEmails|testSearch|waitForEmail/.test(fs.readFileSync(file, 'utf8'))
    );

    expect(files.length).toBeGreaterThan(20);
    expect(offenders).toEqual([]);
    expect(Object.keys(contract.gmail).sort()).toEqual(
      ['authorize', 'checkAuthStatus', 'getCredentials', 'revokeAuth', 'setCredentials'].sort()
    );
  });

  describe('registration', () => {
    let container: AppContainer;
    let ipc: FakeIpcMain;

    beforeEach(() => {
      container = createContainer({
        db: openDatabase(':memory:'),
        logsDir: TEST_LOGS_DIR,
        ...containerSecrets(),
      });
      ipc = new FakeIpcMain();
      registerIpcHandlers(container, { isTrustedSender: () => true, ipc });
    });

    afterEach(() => {
      container.dispose();
    });

    it('registers exactly one handler per contract method and nothing else', () => {
      const expected = methods()
        .map(([, , def]) => def.channel)
        .sort();

      expect([...ipc.registrations].sort()).toEqual(expected);
    });
  });
});
