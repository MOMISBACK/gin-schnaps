"""Launch the actual Tauri system WebView; parse only the synthetic probe result."""
from pathlib import Path
import json, platform, subprocess, sys, os
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
suffix='.exe' if platform.system()=='Windows' else ''
binary=Path(os.environ.get('GIN_SCHNAPS_NATIVE_BINARY',str(ROOT/'desktop/target/debug'/f'gin-schnaps{suffix}')))
cmd=[str(binary),'--probe']
if platform.system()=='Linux':cmd=['xvfb-run','-a',*cmd]
result=subprocess.run(cmd,capture_output=True,text=True,timeout=180,env=os.environ)
(OUT/'native-probe.log').write_text(result.stdout+'\n'+result.stderr)
lines=[line.split('GIN_SCHNAPS_PROBE_REPORT=',1)[1] for line in result.stdout.splitlines() if 'GIN_SCHNAPS_PROBE_REPORT=' in line]
assert result.returncode==0, f'Native probe exited {result.returncode}: see native-probe.log'
assert len(lines)==1, 'Missing or repeated native report'
report=json.loads(lines[0]);assert report['success'] and len(report['cases'])==2, report
report['nativeEnvironment']={'system':platform.system(),'release':platform.release(),'machine':platform.machine(),'scope':'map + virtual sequence + keyboard helper + worker; not native file save or old Mac certification'}
(OUT/'native-probe.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
print(json.dumps(report,indent=2))
