import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [root, output, label] = process.argv.slice(2);
if (!root || !output || !['before', 'after'].includes(label)) throw new Error('Usage: node build.mjs CHECKOUT OUTPUT before|after');
if (os.hostname().toUpperCase() !== 'MCHARTIER_ZBOOK') throw new Error('This evidence run requires MCHARTIER_ZBOOK');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const sourceCommit = git('rev-parse', 'HEAD');
git('diff', '--exit-code'); git('diff', '--cached', '--exit-code');
fs.mkdirSync(output, { recursive: true });
const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const startedAtUtc = new Date().toISOString();
const log = execFileSync(process.execPath, [npmCli, '--prefix', 'mobile', 'run', 'build:web'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
fs.writeFileSync(path.join(output, `${label}-build.log`), log.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/).map(line => line.trimEnd()).join('\n'));
if (git('rev-parse', 'HEAD') !== sourceCommit) throw new Error('Source changed during build');
git('diff', '--exit-code');
const dist = path.join(root, 'mobile/dist');
const files = fs.readdirSync(dist, { recursive: true }).filter(file => fs.statSync(path.join(dist, file)).isFile());
const manifest = { sourceCommit, checkout: root, host: os.hostname(), platform: os.platform(), node: process.version,
    startedAtUtc, finishedAtUtc: new Date().toISOString(), command: 'npm.cmd --prefix mobile run build:web',
    files: files.map(file => ({ path: file.replaceAll('\\', '/'), sha256: createHash('sha256').update(fs.readFileSync(path.join(dist, file))).digest('hex') })) };
fs.writeFileSync(path.join(output, `${label}-build.json`), JSON.stringify(manifest, null, 2) + '\n');
console.log(`${label}: ${sourceCommit}; ${files.length} built artifacts bound`);
