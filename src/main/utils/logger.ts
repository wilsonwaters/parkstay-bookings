/**
 * Logger (Winston).
 *
 * At import the logger has only a console transport, so nothing is written to disk before
 * the app knows its final data folder, and Jest never writes log files. After `ready`,
 * `index.ts` calls `initFileLogging(<userData>/logs)`, which adds the rotating log files.
 *
 * `exitOnError: false`: logging never ends the process. Uncaught exceptions and unhandled
 * rejections belong to the crash policy (`app/crash-policy.ts`), which logs them with a
 * `crash` field; the `exceptions.log` and `rejections.log` transports keep only those
 * records. Winston's own exception and rejection handlers are not used: with
 * `exitOnError: false` they end their file stream after the first exception, and the
 * second exception then kills the process ("write after end").
 *
 * Modules log through a child logger, which tags every line with the module name:
 * `const log = logger.child({ module: 'scheduler' })`.
 */

import fs from 'fs';
import path from 'path';
import winston from 'winston';

/** The `crash` field the crash policy puts on uncaught exceptions and unhandled rejections. */
export type CrashKind = 'exception' | 'rejection';

const MB = 1024 * 1024;

/**
 * What `log.error('… failed:', value)` records, made safe and readable.
 *
 * - An HTTP client's error (axios, gaxios) carries the whole exchange: headers with session
 *   cookies or bearer tokens, and bodies with passwords, refresh tokens or client secrets.
 *   Logging it copies its fields into the record, so these are dropped, and an error nested
 *   in the record (`{ cause }`, gaxios' `error`) is reduced to its name, message, code and
 *   stack.
 * - `splat()` merges the logged values into the record a second time, so it is given the
 *   same safe copies. An error's message and stack are already in the record ("… failed:
 *   <message>"); the copy leaves them out so the prefix is kept.
 * - A string or number logged after the message is appended to it, the way the console
 *   printed it (`splat()` would spread a string into one field per character).
 */
const HTTP_EXCHANGE_FIELDS = ['config', 'request', 'response'];
const SPLAT = Symbol.for('splat');
const FORMAT_TOKEN = /%[scdjifoO%]/;

const safeRecord = winston.format((info) => {
  const record = info as typeof info & { [SPLAT]?: unknown };
  for (const field of HTTP_EXCHANGE_FIELDS) delete record[field];
  for (const [key, value] of Object.entries(record)) {
    if (value instanceof Error) record[key] = summarizeError(value);
  }
  const values = record[SPLAT];
  if (!Array.isArray(values)) return record;

  // With `%s`-style tokens, `splat()` interpolates the values into the message instead
  const interpolated = typeof record.message === 'string' && FORMAT_TOKEN.test(record.message);
  const merged: unknown[] = [];
  for (const value of values) {
    if (value instanceof Error) merged.push(safeFields(value, ['message', 'stack']));
    else if (isPlainObject(value)) merged.push(safeFields(value));
    else if (interpolated || (typeof value === 'object' && value !== null)) merged.push(value);
    else if (value !== undefined && value !== null) record.message = `${record.message} ${value}`;
  }
  record[SPLAT] = merged;
  return record;
});

function safeFields(source: object, skip: string[] = []): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (HTTP_EXCHANGE_FIELDS.includes(key) || skip.includes(key)) continue;
    fields[key] = value instanceof Error ? summarizeError(value) : value;
  }
  return fields;
}

function summarizeError(error: Error & { code?: unknown }): Record<string, unknown> {
  return {
    name: error.name,
    message: error.message,
    ...(error.code !== undefined ? { code: error.code } : {}),
    stack: error.stack,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Define log format. `errors()` first turns a logged Error into a plain record (a copy, so
// the caller's error is never changed); `safeRecord()` then runs before `splat()`.
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  safeRecord(),
  winston.format.splat(),
  winston.format.json()
);

// Console format: `12:00:00 [info] [scheduler]: message {meta}`
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, module, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    const moduleStr = module ? ` [${module}]` : '';
    return `${timestamp} [${level}]${moduleStr}: ${message} ${metaStr}`;
  })
);

// Create logger instance: console only until initFileLogging
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  exitOnError: false,
  transports: [new winston.transports.Console({ format: consoleFormat })],
});

let fileLogsDir: string | null = null;
let fileTransports: winston.transport[] = [];
let fileLoggingFailed = false;

/** Keeps only the crash policy's records of one kind. */
const onlyCrash = (kind: CrashKind): winston.Logform.Format =>
  winston.format((info) => (info.crash === kind ? info : false))();

function createFileTransports(dir: string): winston.transport[] {
  return [
    new winston.transports.File({
      filename: path.join(dir, 'error.log'),
      level: 'error',
      maxsize: 5 * MB,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(dir, 'combined.log'),
      maxsize: 5 * MB,
      maxFiles: 10,
    }),
    new winston.transports.File({
      filename: path.join(dir, 'exceptions.log'),
      level: 'error',
      format: onlyCrash('exception'),
      maxsize: 5 * MB,
      maxFiles: 3,
    }),
    new winston.transports.File({
      filename: path.join(dir, 'rejections.log'),
      level: 'error',
      format: onlyCrash('rejection'),
      maxsize: 5 * MB,
      maxFiles: 3,
    }),
  ];
}

/** Warns once (on the console) and stays on console logging. */
function disableFileLogging(dir: string, error: unknown): void {
  for (const transport of fileTransports) transport.silent = true;
  if (fileLoggingFailed) return;
  fileLoggingFailed = true;
  const reason = error instanceof Error ? error.message : String(error);
  logger.warn(`Log files disabled; logging to the console only (${dir}: ${reason})`);
}

// A failing log file (disk full, folder removed) must never crash the app.
logger.on('error', (error: unknown) => disableFileLogging(fileLogsDir ?? '', error));

/**
 * Adds the rotating log files (`combined.log`, `error.log`, `exceptions.log`,
 * `rejections.log`) under `dir`, creating it if needed, and returns `dir`. Call it after
 * `ready`, once the data folder is final. If `dir` is not writable it warns once and the
 * logger stays on the console; it never throws. A second call changes nothing.
 */
export function initFileLogging(dir: string): string {
  if (fileLogsDir !== null) return fileLogsDir;

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.closeSync(fs.openSync(path.join(dir, 'combined.log'), 'a'));
  } catch (error) {
    disableFileLogging(dir, error);
    return dir;
  }

  fileLogsDir = dir;
  fileTransports = createFileTransports(dir);
  for (const transport of fileTransports) logger.add(transport);
  return dir;
}

// Export logger methods for convenience
export const logInfo = (message: string, meta?: any) => logger.info(message, meta);
export const logError = (message: string, error?: Error | any) => {
  if (error instanceof Error) {
    logger.error(message, { error: error.message, stack: error.stack });
  } else {
    logger.error(message, error);
  }
};
export const logWarn = (message: string, meta?: any) => logger.warn(message, meta);
export const logDebug = (message: string, meta?: any) => logger.debug(message, meta);

export default logger;
