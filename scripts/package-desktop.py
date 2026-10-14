"""Build reviewable desktop preview packages from a tested release executable.
No Apple Developer ID, notarization, Windows signing or auto-updater is implied.
"""
from pathlib import Path
import hashlib,json,os,platform,plistlib,shutil,subprocess,tarfile,zipfile
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'native-packages';OUT.mkdir(exist_ok=True)
system=platform.system();arch=platform.machine();version=json.loads((ROOT/'package.json').read_text())['version']
binary=ROOT/'desktop/target/release'/('gin-schnaps.exe' if system=='Windows' else 'gin-schnaps')
assert binary.is_file()
stage=OUT/'stage';shutil.rmtree(stage,ignore_errors=True);stage.mkdir()
startup=f"""GIN SCHNAPS {version} — DESKTOP PREVIEW

Save writes the complete .sg.json document. Save As selects a new destination.
Interchange inputs (.dna, GenBank, FASTA) are never overwritten by Save.
An external modification detected since opening/saving refuses Save; use a new
Save As name, or reopen and compare. Previous native .sg.json content is copied to the private
application data/backups directory before replacement. Generic interchange exports
do not keep this predecessor backup; choose another name to keep the old export. This is not a full backup
system or a power-failure guarantee. New files are private on Unix platforms.

Recovery is opt-in and stored without application encryption in app data.
It does not migrate browser recovery automatically. Export .sg.json documents
from the browser version, then open them in this application. Saved PCR settings
are included; unsaved form fields and undo stacks are not persisted.

This build is a development preview, not signed by an identified publisher or
notarized by Apple. Do not disable OS security globally. Verify the source and
download checksum before deciding whether to allow this application.
No update service, network upload or automatic remote file access is included.

The native dialog picker itself has not been automatically driven on every OS.
Automated tests exercise the actual UI, IPC and disk IO with fixed synthetic
picker responses. Real hardware, old macOS, full disk, power interruption,
network filesystems, ACL preservation and adversarial local file replacement
require further testing. Keep independent backups of your own documents.
"""
source_commit = subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
startup += '\nCorresponding source (exact version):\nhttps://github.com/MOMISBACK/gin-schnaps/tree/' + source_commit + '\nThe release sources ZIP includes all project source files.\n'
(stage/'START_HERE.txt').write_text(startup,encoding='utf-8')
for f in ['LICENSE','THIRD_PARTY_NOTICES.md']:shutil.copy2(ROOT/f,stage/f)
subprocess.run(['python3',str(ROOT/'scripts/native-notices.py')],check=True,cwd=ROOT)
shutil.copy2(OUT/'NATIVE_THIRD_PARTY_NOTICES.md',stage/'NATIVE_THIRD_PARTY_NOTICES.md')
target={'Darwin':'macos-'+('arm64' if arch=='arm64' else 'intel'),'Windows':'windows-x64','Linux':'linux-x64'}[system]
name=f'gin-schnaps-{version}-{target}'
if system=='Darwin':
    app=stage/'Gin Schnaps.app';contents=app/'Contents'
    (contents/'MacOS').mkdir(parents=True);(contents/'Resources').mkdir()
    shutil.copy2(binary,contents/'MacOS'/binary.name);os.chmod(contents/'MacOS'/binary.name,0o755)
    for notice in ['LICENSE','THIRD_PARTY_NOTICES.md','NATIVE_THIRD_PARTY_NOTICES.md','START_HERE.txt']:
        shutil.copy2(stage/notice,contents/'Resources'/notice)
    iconset=OUT/'AppIcon.iconset';iconset.mkdir(exist_ok=True)
    for size in [16,32,128,256,512]:
        for scale in [1,2]:
            dest=iconset/f"icon_{size}x{size}{'@2x' if scale==2 else ''}.png"
            subprocess.run(['sips','-z',str(size*scale),str(size*scale),str(ROOT/'desktop/icons/icon.png'),'--out',str(dest)],check=True,stdout=subprocess.DEVNULL)
    subprocess.run(['iconutil','-c','icns',str(iconset),'-o',str(contents/'Resources/AppIcon.icns')],check=True)
    minimum=os.environ.get('MACOSX_DEPLOYMENT_TARGET','11.0' if arch=='arm64' else '10.15')
    info={'CFBundleExecutable':binary.name,'CFBundleIdentifier':'org.ginschnaps.desktop','CFBundleName':'Gin Schnaps',
          'CFBundleDisplayName':'Gin Schnaps','CFBundlePackageType':'APPL','CFBundleShortVersionString':version,'CFBundleVersion':version,
          'CFBundleIconFile':'AppIcon','NSHighResolutionCapable':True,'LSMinimumSystemVersion':minimum,
          'NSHumanReadableCopyright':'GPL-3.0-or-later; third-party components retain their licenses.'}
    (contents/'Info.plist').write_bytes(plistlib.dumps(info))
    subprocess.run(['codesign','--force','--deep','--sign','-',str(app)],check=True)
    subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
    os.symlink('/Applications',stage/'Applications')
    dmg=OUT/(name+'.dmg')
    subprocess.run(['hdiutil','create','-volname','Gin Schnaps Preview','-srcfolder',str(stage),'-ov','-format','UDZO',str(dmg)],check=True)
    # Smoke-test the application inside the actual mounted DMG, not only
    # target/release. The synthetic rendering probe exits by itself.
    mount=OUT/'mounted';mount.mkdir(exist_ok=True)
    try:
        subprocess.run(['hdiutil','attach','-readonly','-nobrowse','-mountpoint',str(mount),str(dmg)],check=True)
        result=subprocess.run([str(mount/'Gin Schnaps.app/Contents/MacOS'/binary.name),'--probe'],capture_output=True,text=True,timeout=190)
        (ROOT/'test-results/packaged-app-probe.log').write_text(result.stdout+'\n'+result.stderr)
        assert result.returncode==0 and 'GIN_SCHNAPS_PROBE_REPORT=' in result.stdout
    finally:subprocess.run(['hdiutil','detach',str(mount)],check=False)
elif system=='Windows':
    shutil.copy2(binary,stage/'Gin Schnaps.exe')
    (stage/'WEBVIEW2.txt').write_text('Requires the Microsoft Edge WebView2 Runtime. No runtime is bundled or automatically downloaded by this package.\n')
    with zipfile.ZipFile(OUT/(name+'.zip'),'w',zipfile.ZIP_DEFLATED) as z:
        for p in stage.rglob('*'):
            if p.is_file():z.write(p,name+'/'+p.relative_to(stage).as_posix())
else:
    shutil.copy2(binary,stage/'gin-schnaps');os.chmod(stage/'gin-schnaps',0o755)
    (stage/'LINUX.txt').write_text('Built on Ubuntu 24.04. Requires a compatible glibc, GTK3 and WebKitGTK 4.1 (libwebkit2gtk-4.1-0). This is not a universal AppImage.\n')
    with tarfile.open(OUT/(name+'.tar.gz'),'w:gz') as t:t.add(stage,arcname=name)
manifest={'version':version,'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
          'environment':{'system':system,'release':platform.release(),'architecture':arch},'signedPublisher':False,'appleNotarized':False,
          'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in OUT.iterdir() if p.is_file() and p.suffix in ['.dmg','.zip','.gz']}}
(OUT/'CHECKSUMS.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps(manifest,indent=2))
