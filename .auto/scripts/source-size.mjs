import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs', '.css', '.scss', '.sass', '.less', '.glsl', '.vert', '.frag']);
const scriptExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);
const maximumLines = 300;

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(filePath));
    else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) files.push(filePath);
  }
  return files.sort();
}

function isTypeStatement(statement) {
  if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) return true;
  if (statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DeclareKeyword)) return true;
  if (ts.isImportDeclaration(statement)) {
    const clause = statement.importClause;
    return Boolean(clause?.isTypeOnly || (!clause?.name && clause?.namedBindings &&
      ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length > 0 &&
      clause.namedBindings.elements.every(element => element.isTypeOnly)));
  }
  if (ts.isExportDeclaration(statement)) {
    return Boolean(statement.isTypeOnly || (statement.exportClause &&
      ts.isNamedExports(statement.exportClause) && statement.exportClause.elements.length > 0 &&
      statement.exportClause.elements.every(element => element.isTypeOnly)));
  }
  return false;
}

function exemption(filePath, content) {
  if (!scriptExtensions.has(path.extname(filePath))) return undefined;
  const source = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length > 0) return undefined;
  if (source.isDeclarationFile || (source.statements.length > 0 && source.statements.every(isTypeStatement))) {
    return 'pure type declarations';
  }
  if (!/shader/i.test(filePath)) return undefined;
  let containsGlsl = false;
  function visit(node) {
    if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      const text = node.getText(source);
      if (/\bvoid\s+main\s*\(/.test(text) && /\b(?:gl_Position|gl_FragColor|uniform|precision)\b|#version/.test(text)) {
        containsGlsl = true;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return containsGlsl ? 'shader containing GLSL template strings' : undefined;
}

const files = [...await sourceFiles('src'), ...await sourceFiles('server')];
let failures = 0;
for (const filePath of files) {
  const content = await readFile(filePath, 'utf8');
  const lineCount = content.length === 0 ? 0 : content.split(/\r\n|\n|\r/).length - (/[\r\n]$/.test(content) ? 1 : 0);
  if (lineCount <= maximumLines) continue;
  const reason = exemption(filePath, content);
  if (reason) {
    console.log(`EXEMPT ${filePath}:${lineCount} — ${reason}`);
  } else {
    console.error(`FAIL source-size: ${filePath} has ${lineCount} lines (maximum ${maximumLines})`);
    failures += 1;
  }
}

console.log(`${failures ? 'FAIL' : 'PASS'} source-size: ${files.length} source files checked, ${failures} non-exempt violations`);
process.exitCode = failures ? 1 : 0;
