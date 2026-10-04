import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const input = path.resolve(process.argv[2]);
const output = path.join(root, 'docs/evidence/issue-414');
const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const file of fs.readdirSync(input)) fs.copyFileSync(path.join(input, file), path.join(output, file));
for (const file of ['mobile-tests-final.log', 'lint-final.log', 'release-final.log', 'backend-pause-final.log', 'browser-final.log', 'browser-baseline.log', 'browser-existing.log']) {
    const text = fs.readFileSync(path.join(root, '..', file), 'utf8').replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/).map(line => line.trimEnd()).join('\n');
    fs.writeFileSync(path.join(output, file), text);
}
const before = JSON.parse(fs.readFileSync(path.join(output, 'before-build.json')));
const after = JSON.parse(fs.readFileSync(path.join(output, 'after-build.json')));
const captures = fs.readdirSync(output).filter(file => /^(before|after)-.*\.json$/.test(file) && !file.endsWith('-build.json'));
for (const file of captures) {
    const record = JSON.parse(fs.readFileSync(path.join(output, file)));
    if (sha256(path.join(output, record.image)) !== record.imageSha256) throw new Error(`Image mismatch: ${file}`);
    for (const harness of record.harness) if (sha256(path.join(root, harness.path)) !== harness.sha256) throw new Error(`Harness mismatch: ${file}`);
    const build = record.baseline ? before : after;
    if (record.sourceCommit !== build.sourceCommit) throw new Error(`Source mismatch: ${file}`);
    for (const script of record.servedScripts) {
        const relative = decodeURIComponent(new URL(script.url).pathname).replace(/^\//, '');
        if (!build.files.some(file => file.path === relative && file.sha256 === script.sha256)) throw new Error(`Running build mismatch: ${file}`);
    }
}
const files = fs.readdirSync(output).filter(file => file !== 'manifest.json').sort();
const pairs = files.filter(file => file.startsWith('before-') && file.endsWith('.png')).map(file => {
    const after = file.replace(/^before-/, 'after-');
    if (!files.includes(after)) throw new Error(`Missing pair: ${file}`);
    return { id: file.slice(7, -4), before: file, after };
});
const manifest = { schemaVersion: 1, createdAtUtc: new Date().toISOString(), parentPr: 410, beforeSourceCommit: before.sourceCommit, afterSourceCommit: after.sourceCommit,
    harnessCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    impactAssessment: 'Commits after the After build change only tests and evidence; mobile/backend/shared application source is unchanged.',
    pairs, captures, artifacts: files.map(file => ({ path: file, sha256: sha256(path.join(output, file)) })) };
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ pairs: pairs.length, captures: captures.length, artifacts: files.length, manifestSha256: sha256(path.join(output, 'manifest.json')) }));
