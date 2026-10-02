/**
 * @jest-environment node
 *
 * IconButton's `label` is required at the type level: a fixture without it must fail
 * type-checking under the renderer tsconfig, and the same fixture with it must pass.
 */
import path from 'path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '../../..');
const FIXTURE = path.join(ROOT, 'src/renderer/components/ui/__icon-button-type-fixture__.tsx');

function typeErrors(source: string): string[] {
  const configFile = ts.readConfigFile(path.join(ROOT, 'tsconfig.renderer.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, ROOT);
  const options = { ...parsed.options, noEmit: true, noUnusedLocals: false };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, ...rest) =>
    path.resolve(fileName) === FIXTURE
      ? ts.createSourceFile(fileName, source, languageVersion, true, ts.ScriptKind.TSX)
      : getSourceFile(fileName, languageVersion, ...rest);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (fileName) => path.resolve(fileName) === FIXTURE || fileExists(fileName);

  const program = ts.createProgram([FIXTURE], options, host);
  return ts
    .getPreEmitDiagnostics(program, program.getSourceFile(FIXTURE))
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

describe('IconButton types', () => {
  it('type-checks with a label', () => {
    expect(
      typeErrors(
        'import { IconButton } from \'./IconButton\';\nexport const ok = <IconButton label="Close" icon={null} />;\n'
      )
    ).toEqual([]);
  });

  it('fails type-check without a label', () => {
    const errors = typeErrors(
      "import { IconButton } from './IconButton';\nexport const bad = <IconButton icon={null} />;\n"
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Property 'label' is missing/);
  });
});
