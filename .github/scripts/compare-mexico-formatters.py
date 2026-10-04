"""Compare the same existing offline suite on the deployed base and candidate."""
import argparse
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

BASE_SHA = 'd70c2614974ee286da3f269148625abc38887f0e'
PROTECTED = ['package.json', 'package-lock.json', 'railway.json', 'nixpacks.toml',
             'prisma/schema.prisma', 'server.js', 'src/models/index.js',
             'src/utils/leadTime.js', 'src/scheduler/cron.js', 'src/services/whatsapp-v2.js']

def summarize(raw, checkout, exit_code):
    raw = raw.replace(str(checkout.resolve()), '<repo>')
    counts = {k: int(v) for k, v in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$', raw, re.M)}
    assert set(counts) == {'tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'}, 'Missing TAP totals'
    entries = []
    for match in re.finditer(r'^([ \t]*)(not ok|ok) \d+ - (.*)$', raw, re.M):
        indent, status, name = match.groups()
        directive = re.search(r'\s+# (SKIP|TODO)\b', name)
        if directive:
            name, status = name[:directive.start()], directive.group(1).lower()
        else:
            status = 'pass' if status == 'ok' else 'fail'
        entries.append({'depth': len(indent), 'name': name, 'status': status})
    assert entries and counts['cancelled'] == 0, 'Missing or cancelled tests'
    assert (exit_code == 0) == (counts['fail'] == 0), 'Exit and TAP totals disagree'
    diagnostics = re.findall(r'^\s*(?:error:|code:|failureType:).+$|^# (?:\w*Error)(?: \[[^\]]+\])?: .+$', raw, re.M)
    return {'exitCode': exit_code, 'counts': counts, 'entries': entries, 'errorDiagnostics': diagnostics}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--baseline', type=Path, required=True)
    parser.add_argument('--candidate', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    env = {k: os.environ[k] for k in ['PATH', 'HOME', 'TMPDIR'] if k in os.environ}
    env.update({'TZ': 'UTC', 'CI': 'true'})
    node = subprocess.check_output(['node', '--version'], env=env, text=True).strip()
    assert node == 'v24.10.0', node
    assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=args.baseline, text=True).strip() == BASE_SHA
    helper = 'src/utils/mexico-time.js'
    fixture = args.candidate/'scripts/fixtures/mexico-time.d70c2614.js'
    assert fixture.read_bytes() == (args.baseline/helper).read_bytes(), 'Baseline fixture drift'
    for path in PROTECTED:
        assert (args.baseline/path).read_bytes() == (args.candidate/path).read_bytes(), 'Unexpected production change: '+path
    report = {'node': node, 'baseSHA': BASE_SHA, 'scope': 'Identical full tests/**/*.test.js selection plus existing synthetic scheduler contracts; no live integrations.',
              'protectedFiles': PROTECTED, 'baselineHelperSHA256': hashlib.sha256(fixture.read_bytes()).hexdigest(), 'versions': {}}
    for label, checkout in [('baseline', args.baseline), ('candidate', args.candidate)]:
        files = sorted(str(p.relative_to(checkout)) for p in checkout.glob('tests/**/*.test.js'))
        assert files, 'Empty existing test selection'
        run = subprocess.run(['node', '--test', '--test-reporter=tap', '--test-concurrency=1', *files],
                             cwd=checkout, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=300)
        (args.output/(label+'-suite.tap')).write_text(run.stdout)
        summary = summarize(run.stdout, checkout, run.returncode)
        summary['files'] = files
        scheduler = subprocess.run(['node', '--experimental-vm-modules', 'scripts/finops-scheduler.cjs'],
                                  cwd=checkout, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=60)
        (args.output/(label+'-scheduler.log')).write_text(scheduler.stdout)
        summary['schedulerExitCode'] = scheduler.returncode
        report['versions'][label] = summary
    before, after = report['versions']['baseline'], report['versions']['candidate']
    errors = []
    for key in ['files', 'counts', 'errorDiagnostics']:
        if before[key] != after[key]: errors.append(key+' differs')
    records = lambda value: Counter((r['depth'], r['name'], r['status']) for r in value['entries'])
    if records(before) != records(after): errors.append('Test names/statuses differ')
    if before['schedulerExitCode'] or after['schedulerExitCode']: errors.append('Existing scheduler contracts failed')
    new = subprocess.run(['node', '--experimental-vm-modules', '--test', '--test-reporter=tap', 'scripts/mexico-time-contracts.test.mjs'],
                         cwd=args.candidate, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=60)
    (args.output/'formatter-contracts.tap').write_text(new.stdout)
    report['formatterContracts'] = summarize(new.stdout, args.candidate, new.returncode)
    if report['formatterContracts']['counts'] != {'tests':9,'pass':9,'fail':0,'cancelled':0,'skipped':0,'todo':0}:
        errors.append('Nine formatter/caller contracts must pass without skips')
    report['errors'] = errors
    report['status'] = 'FAIL' if errors else 'PASS_NO_NEW_FAILURES'
    (args.output/'comparison.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'node': node, 'status': report['status'], 'errors': errors,
                      'counts': {k:v['counts'] for k,v in report['versions'].items()},
                      'formatterContracts': report['formatterContracts']['counts']}, indent=2))
    if errors: raise SystemExit(1)

if __name__ == '__main__':
    main()
