# Security

This document describes how the app protects data on the user's machine.

## Secret storage

### What is stored

The app keeps these secrets on disk:

| Secret | Where it is stored |
| --- | --- |
| ParkStay password | `users.encrypted_password` in `<userData>/parkstay.db` |
| Email (SMTP) notifier settings, including the app password | `notifiers.config` in the database |
| Gmail OAuth client ID, client secret and tokens | `<userData>/gmail-oauth.json` |
| Provider secrets (`ProviderContext.secrets`) | the provider's own state, under `secret:<key>` (\*) |

(\*) Provider state is held in memory for now, so provider secrets last only until the app
quits. They are written to disk, still as vault envelopes, once V2 stores provider state in
the `provider_state` table.

Every one of them is encrypted by the **SecretVault** (`src/main/security/secret-vault.ts`)
and stored as a versioned envelope:

```text
vault:v1:<backend>:<base64>
```

- The vault never stores or logs a plaintext secret, a decrypted value or a key.
- The same plaintext encrypts to a different envelope each time.
- Each provider's secrets are sealed with that provider's id and the secret's key. A
  ciphertext copied to another provider or key does not decrypt as theirs.

### Backends

The vault encrypts new secrets with one of two backends.

**`os`: Electron `safeStorage`.** This is the normal case. The operating system protects
the key:

| Platform | Key protection | Where the key lives |
| --- | --- | --- |
| Windows | DPAPI, bound to the Windows user account | Wrapped with DPAPI in Chromium's `Local State` file inside userData (`os_crypt.encrypted_key`) |
| macOS | Keychain | A Keychain item for the app |
| Linux | Secret Service (GNOME Keyring, KWallet) | An item in the user's keyring. Nothing is written to userData. |

On Windows, `safeStorage` encrypts with AES-256-GCM, which detects any change to a
ciphertext. On macOS and Linux it is Chromium's OSCrypt, which uses AES-128-CBC with no
MAC, so a changed envelope is not always detected: it usually fails to decrypt, but it can
decrypt to different bytes.

**`local`: the fallback.** This is AES-256-GCM with a random 32-byte key in
`<userData>/secret-vault.key`. The key file is created with mode `0600` only when the
first secret is saved, and it is never logged. The vault uses `local` when either of these
is true:

- `safeStorage.isEncryptionAvailable()` is false.
- On Linux, `safeStorage.getSelectedStorageBackend()` is `basic_text`. Chromium then uses
  a hard-coded password, which is no protection.

The backend in use is reported by `app.getInfo()` as `secretStorage: { backend }`, so the
UI can warn when it is `local`.

### The Linux fallback and its weakness

On Linux without a keyring (no GNOME Keyring or KWallet, an unrecognised desktop, or a
headless session) the app uses the `local` backend. It is weaker than `os`:

- Anyone who can read `secret-vault.key` can decrypt the secrets: the same user, root, or
  anyone with a copy of the userData folder (for example a backup).
- File permissions (`0600`) are the only protection.

It is still much better than v1.x, whose keys could be derived from constants in the
source code plus the machine id.

To use OS encryption on Linux:

1. Run a Secret Service provider, such as GNOME Keyring or KWallet, with an unlocked
   default keyring.
2. If the desktop is not detected, start the app with
   `--password-store=gnome-libsecret` (or `kwallet5` or `kwallet6`).

Once `os` is available, each `local` secret is re-encrypted to `os` the next time it is
read, and stored once the new envelope decrypts back to the same value (otherwise the
`local` envelope is kept and a warning is logged). The key file is then no longer needed for those secrets. It is kept, and
never deleted automatically.

### Ordering at startup

`safeStorage` works only after Electron's `ready` event. On Windows its key lives in
`Local State` inside userData. So the vault is lazy: constructing it touches neither
`safeStorage` nor the key file. A use before `ready` throws `SecretVaultNotReadyError`.
The required order (architecture-notes §12.23) is:

1. `app.setPath('userData', …)`: the final userData folder, set before `ready`.
2. The legacy install migration (copying a legacy data folder). `Local State` is never
   copied from another profile.
3. The vault's first use: the legacy secret migration in `createContainer`, after `ready`.

Changing userData after the vault's first write makes `os` envelopes unreadable on
Windows, because the `Local State` key no longer matches.

### Legacy (v1.x) secrets

v1.x used three schemes. Their keys came from constants in the source code, so they were
obfuscation, not protection:

| Secret | v1.x scheme |
| --- | --- |
| ParkStay password | AES-256-GCM, key `PBKDF2(machineId + app constant, constant salt)`, stored as hex in three columns |
| Notifier config | The same scheme with other constants, stored as `iv:authTag:ciphertext` |
| `gmail-oauth.json` | electron-store's AES-256-CBC with a hard-coded `encryptionKey` |

`migrateLegacySecrets` (`src/main/security/legacy-migration.ts`) runs at every start,
after the database migrations and before anything reads a secret. It:

- decrypts each legacy value once with an exact copy of its v1.x algorithm
  (`src/main/security/legacy-decryptors.ts`, the only code that reads the machine id, and
  only when a machine-bound legacy value is found), and re-encrypts it with the vault;
- decrypts each new envelope and compares it with the plaintext before it replaces the
  legacy value, which is the only copy. If they differ, the item is left as it is and
  counted as `failed`;
- clears the legacy `users` key, IV and auth-tag columns to `''`;
- rewrites `gmail-oauth.json` atomically and durably (a temp file, fsynced, then a rename,
  then an fsync of the folder where the platform supports it) as
  `{ "format": 2, "credentials": "<envelope>", "tokens": "<envelope>" }`, with mode `0600`;
- handles each item on its own, in one transaction per database row, so a crash leaves
  each item either old or new, and the next start finishes the job;
- is idempotent: values that are already envelopes are left alone;
- logs only counts, for example `Legacy secrets: 3 migrated, 0 current, 0 failed`.

A legacy value that cannot be decrypted is left exactly as it is and counted as `failed`.
This happens, for example, when the database came from another machine, whose machine id
differs. The next start tries again. An empty legacy password or notifier config migrates
as "nothing stored".

### What "unreadable" means

Every stored secret has a state (`SecretState`):

| State | Meaning |
| --- | --- |
| `ok` | A secret is stored and the app can decrypt it. |
| `missing` | Nothing is stored. |
| `unreadable` | Something is stored, but it cannot be decrypted. |

A secret becomes `unreadable` when:

- the data was copied from another computer or another Windows account;
- the Linux keyring is locked or unavailable at startup;
- `secret-vault.key` was deleted or replaced;
- it was saved by a newer version of the app (an unknown envelope version or backend);
- it was tampered with, or is a legacy value that could not be migrated.

Tampering is always detected for `local` envelopes and for `os` envelopes on Windows (both
AES-256-GCM). On macOS and Linux an `os` envelope has no MAC (see [Backends](#backends)), so
a tampered one may decrypt to wrong data instead of reading as `unreadable`.

An unreadable secret is never treated as empty, and it is never overwritten except by the
user saving a new one. What the user sees:

| Secret | When unreadable |
| --- | --- |
| ParkStay password | `auth.getCredentials()` returns `hasPassword: false, secretState: 'unreadable'`. Enter the password again. |
| Email notifier | The notifier shows `secretState: 'unreadable'`, status `error` and "Saved password could not be decrypted; re-enter it". Nothing is sent through it, and the skip is logged once. Saving the email settings again fixes it. |
| Gmail | The status is `{ isAuthorized: false, secretState: 'unreadable' }`. Enter the client credentials again if they are unreadable, and sign in again for unreadable tokens. A `gmail-oauth.json` that cannot be parsed at all is moved aside to `gmail-oauth.json.corrupt-<timestamp>` before it is replaced. |

A locked keyring is usually temporary: unlock it and restart the app, and the secrets read
again. Nothing was overwritten in the meantime.

If `secret-vault.key` is missing when a new `local` secret is saved, a new key is created,
and a warning is logged that secrets saved under the earlier key cannot be read.

### Testing notes

- The unit and integration tests use a fake `safeStorage`
  (`tests/utils/fake-safe-storage.ts`). There is no keyring in CI.
- Playwright's Electron launcher always adds `--password-store=basic`, so any app run
  driven by `_electron.launch` uses the `local` backend on Linux. To exercise `os` on
  Linux, start Electron directly with `--password-store=gnome-libsecret` in a session that
  has an unlocked GNOME Keyring.
