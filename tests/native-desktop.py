"""Run real desktop binary/IPC/file IO with a compile-time-only synthetic picker.
The distributable build does not include the test command.
"""
from pathlib import Path
import json, os, platform, subprocess
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
suffix='.exe' if platform.system()=='Windows' else ''
binary=Path(os.environ.get('GIN_SCHNAPS_NATIVE_BINARY',str(ROOT/'desktop/target/debug'/f'gin-schnaps{suffix}')))
cmd=[str(binary),'--io-test']
if platform.system()=='Linux':cmd=['xvfb-run','-a',*cmd]
result=subprocess.run(cmd,capture_output=True,text=True,timeout=210,env=os.environ)
(OUT/'native-desktop.log').write_text(result.stdout+'\n'+result.stderr,encoding='utf-8')
reports=[json.loads(line.split('GIN_SCHNAPS_IO_REPORT=',1)[1]) for line in result.stdout.splitlines() if 'GIN_SCHNAPS_IO_REPORT=' in line]
summary={'success':result.returncode==0 and len(reports)==2 and all(r.get('success') for r in reports),
  'returncode':result.returncode,'reports':reports,'environment':{'os':platform.system(),'release':platform.release(),'machine':platform.machine()},
  'scope':'Real UI / Tauri IPC / disk writes with deterministic test-only picker; no OS dialog interaction, power-failure or old-Mac certification'}
(OUT/'native-desktop-report.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
assert summary['success'],f'Native desktop failed: {result.returncode}; see native-desktop.log'
assert [r['phase'] for r in reports]==['before-reload','after-reload']
assert not any(r['errors'] for r in reports)
print(json.dumps(summary,indent=2))
