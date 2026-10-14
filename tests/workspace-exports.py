"""Keyboard, paired views, clipboard failures and independent exported-file checks.
Runs actual file:// in CI; local inline mode is explicitly reported.
"""
from pathlib import Path
import json, os, platform
from playwright.sync_api import sync_playwright, expect
from Bio import SeqIO
import Bio
from io import StringIO
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'test-results'; OUT.mkdir(exist_ok=True)
mode=os.environ.get('GIN_SCHNAPS_TEST_MODE','file')
report={'success':False,'mode':mode,'checks':[],'errors':[],'network':[],'biopython':Bio.__version__,'delayedClipboardUI':False,'realFileLaunch':mode!='inline','nativeOSMenusTested':False}
with sync_playwright() as p:
    opts={'headless':True}
    if os.environ.get('CHROMIUM_PATH'): opts['executable_path']=os.environ['CHROMIUM_PATH']
    browser=p.chromium.launch(**opts)
    page=browser.new_page(accept_downloads=True,viewport={'width':1280,'height':800});page.set_default_timeout(12000)
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.on('request',lambda r:report['network'].append(r.url) if r.url.startswith(('http:','https:')) else None)
    def b(name):return page.get_by_role('button',name=name,exact=True)
    def mark(name):report['checks'].append(name);print('PASS',name,flush=True)
    def dismiss():
        if b('Close message').count():b('Close message').click()
    def native():
        with page.expect_download() as d:b('Export native format (⌘/Ctrl S)').click()
        result=json.loads(Path(d.value.path()).read_text());dismiss();return result
    def expect_empty_editor():
        # Empty working documents now retain the sequence editor so they can be
        # refilled directly. Assert state, not the retired placeholder heading.
        expect(page.get_by_test_id('split-view')).to_be_visible()
        expect(page.get_by_test_id('sequence-view')).to_be_visible()
        expect(page.locator('.virtual-sequence')).to_have_attribute('data-row-count', '0')
        expect(page.locator('.base')).to_have_count(0)
        expect(b('Type DNA')).to_be_enabled()
        expect(b('Type DNA')).to_have_attribute('aria-pressed', 'false')
        expect(page.get_by_test_id('map-view')).to_have_count(0)
    def choose(a,z):
        page.get_by_label('Selection start',exact=True).fill(str(a));page.get_by_label('Selection end',exact=True).fill(str(z));b('Select').click()
    def export_format(fmt,label,selection=False):
        b('Export current document as GenBank').click();page.get_by_label('Export format',exact=True).select_option(fmt)
        if selection:page.get_by_label('Selected bases only',exact=True).check()
        expect(b('Download '+label)).to_be_disabled()
        page.get_by_label('Export with these limitations (.sg.json retains all data).',exact=True).check()
        with page.expect_download() as d:b('Download '+label).click()
        text=Path(d.value.path()).read_text();dismiss();return text
    try:
        if mode=='inline':page.set_content((ROOT/'dist/index.html').read_text(),wait_until='domcontentloaded')
        else:page.goto((ROOT/'dist/index.html').as_uri())
        expect(page.get_by_test_id('map-view')).to_be_visible()
        before=native()
        page.get_by_role('tab',name='Split',exact=True).click()
        expect(page.get_by_role('tab',name='Split',exact=True)).to_have_css('border-bottom-width','3px')
        expect(page.get_by_role('tab',name='Split',exact=True)).to_have_css('border-bottom-color','rgb(22, 108, 104)')
        expect(page.get_by_test_id('sequence-view')).to_be_visible();expect(page.get_by_test_id('map-view')).to_be_visible()
        page.get_by_test_id('map-view').get_by_text('Region B',exact=True).click()
        expect(page.get_by_test_id('selection-status')).to_contain_text('1,020 bp')
        expect(page.locator('.base[data-pos="660"].selected-base').first).to_be_visible()
        choose(4520,185);expect(page.get_by_test_id('selection-status')).to_contain_text('466 bp')
        expect(page.locator('.base.selected-base').first).to_be_visible()
        assert native()==before
        mark('Sequence and Map are simultaneously visible; origin selection is shared without changing DNA')
        split=page.get_by_role('separator',name='Resize sequence and map')
        split.focus();split.press('ArrowRight');expect(split).to_have_attribute('aria-valuenow','52')
        split.press('End');expect(split).to_have_attribute('aria-valuenow','65')
        split.press('Enter');expect(split).to_have_attribute('aria-valuenow','50')
        box=split.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down();page.mouse.move(box['x']+55,box['y']+box['height']/2);page.mouse.up()
        assert int(split.get_attribute('aria-valuenow'))>50
        split.dblclick();expect(split).to_have_attribute('aria-valuenow','50')
        mark('Splitter supports pointer drag, keyboard resizing and reset')
        for width,height in [(1024,640),(1280,800),(1440,900)]:
            page.set_viewport_size({'width':width,'height':height})
            expect(page.get_by_test_id('sequence-view')).to_be_visible();expect(page.get_by_test_id('map-view')).to_be_visible()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            assert page.get_by_role('region',name='DNA sequence pane').bounding_box()['width']>=250
        page.set_viewport_size({'width':1280,'height':800})
        page.screenshot(path=str(OUT/'paired-workspace.png'))
        mark('Paired view fits reference viewport sizes without page overflow')
        # Ctrl+A is required even on macOS, independently of the Cmd aliases.
        page.get_by_test_id('sequence-view').focus();page.keyboard.press('Control+a')
        expect(page.get_by_test_id('selection-status')).to_contain_text('4,800 bp')
        page.keyboard.press('Control+r');expect_empty_editor();dismiss()
        empty=native();assert empty['sequence']=='' and empty['features']==[] and empty['schemaVersion']==6
        assert empty['topology']=='linear'
        mark('Ctrl+A then Ctrl+R cuts the entire molecule into a saveable empty draft without browser reload')
        page.keyboard.press('Control+z');expect(page.get_by_test_id('split-view')).to_be_visible();assert native()==before
        page.keyboard.press('Control+Shift+z');expect_empty_editor();assert native()==empty
        page.keyboard.press('Control+z');assert native()==before
        mark('Ctrl+Z and Ctrl+Shift+Z restore the exact original sequence, features and selection')
        # Partial circular cut; read the real clipboard through the normal Paste path.
        choose(4520,185);page.keyboard.press('Control+r');dismiss()
        cut=native();assert cut['sequence']==before['sequence'][185:4519]
        b('Fragment · 1,200 bp').click();target=native()
        modifier='Meta' if platform.system()=='Darwin' else 'Control'
        page.keyboard.press(modifier+'+v');expect(page.get_by_role('dialog',name='Paste DNA')).to_be_visible()
        assert page.get_by_label('DNA to paste',exact=True).input_value()==before['sequence'][4519:]+before['sequence'][:185]
        page.get_by_label('Paste operation',exact=True).select_option('insert');b('Append at end').click();b('Apply paste').click();dismiss()
        assert native()['sequence']==target['sequence']+before['sequence'][4519:]+before['sequence'][:185]
        mark('Ctrl+R delivers the exact origin-spanning bases to the system clipboard for another document')
        page.get_by_role('tab',name='pDemo_4800',exact=True).click();page.keyboard.press('Control+z');assert native()==before
        page.get_by_test_id('sequence-view').focus();page.keyboard.press('Control+a');page.keyboard.press('Control+r');dismiss()
        b('Paste DNA (⌘/Ctrl V)').click();page.get_by_label('DNA to paste',exact=True).fill('GATTACA');b('Apply paste').click();dismiss()
        assert native()['sequence']=='GATTACA'
        page.keyboard.press('Control+z');expect_empty_editor();assert native()==empty
        page.keyboard.press('Control+z');assert native()==before
        mark('An empty draft accepts paste; two undos restore the whole cut-and-paste history')
        # A text-field selection/undo never targets the molecule.
        b('Properties').click();name=page.get_by_label('Document name',exact=True);name.focus();name.press('Control+a')
        assert name.evaluate('(n)=>n.selectionStart===0&&n.selectionEnd===n.value.length')
        name.press('End');name.press('x');name.press(modifier+'+z')
        expect(name).to_have_value(before['name']);b('Cancel').click();assert native()==before
        mark('Select all and Undo in a text field affect only its text, not the molecule')
        choose(2,5)
        page.evaluate("window.savedClipboard=navigator.clipboard;window.savedExec=document.execCommand;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('denied'))}});document.execCommand=()=>false")
        page.keyboard.press('Control+r');expect(page.get_by_role('alert')).to_contain_text('refused');dismiss();assert native()==before
        page.evaluate("document.execCommand=window.savedExec;Object.defineProperty(navigator,'clipboard',{configurable:true,value:window.savedClipboard})")
        mark('Clipboard denial never deletes selected bases')
        if page.evaluate('window.isSecureContext'):
            page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise(r=>window.completeCut=r)}})")
            choose(2,5);page.keyboard.press('Control+r');choose(10,15);page.evaluate('window.completeCut()')
            expect(page.get_by_role('alert')).to_contain_text('Nothing was cut');dismiss();assert native()==before
            page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:window.savedClipboard})")
            report['delayedClipboardUI']=True
            mark('A delayed clipboard completion cannot cut a newly selected region')
        # Explicit native-menu event routing, separate from actual OS-menu testing.
        page.get_by_test_id('sequence-view').focus();page.evaluate("window.dispatchEvent(new CustomEvent('gin-schnaps-native-action',{detail:'select-all'}))")
        expect(page.get_by_test_id('selection-status')).to_contain_text('4,800 bp')
        mark('Native Select All event routes to the same document selection')
        # Export actual files from the UI, not only the formatter functions.
        gb=export_format('genbank','GenBank');embl=export_format('embl','EMBL');fa=export_format('fasta','FASTA');txt=export_format('text','Plain DNA')
        gr=SeqIO.read(StringIO(gb),'genbank');er=SeqIO.read(StringIO(embl),'embl');fr=SeqIO.read(StringIO(fa),'fasta')
        assert str(gr.seq)==str(er.seq)==str(fr.seq)==before['sequence']==txt.strip()
        assert gr.annotations['topology']==er.annotations['topology']==before['topology']
        assert [(str(f.location),f.qualifiers) for f in gr.features]==[(str(f.location),f.qualifiers) for f in er.features]
        assert len(gr.features)==len(before['features'])
        for i,f in enumerate(gr.features):assert str(f.extract(gr.seq))==str(er.features[i].extract(er.seq))
        (OUT/'exported-current.gb').write_text(gb);(OUT/'exported-current.embl').write_text(embl)
        mark('Independent Biopython reads UI-exported GenBank, EMBL and FASTA: sequences, strands, locations and qualifiers agree')
        choose(4520,185);region=export_format('fasta','FASTA',True)
        assert str(SeqIO.read(StringIO(region),'fasta').seq)==before['sequence'][4519:]+before['sequence'][:185]
        mark('Selection-only FASTA preserves an origin-spanning region in reference order')
        b('Export current document as GenBank').click()
        page.get_by_label('Export with these limitations (.sg.json retains all data).',exact=True).check()
        page.get_by_label('Export format',exact=True).select_option('embl');expect(b('Download EMBL')).to_be_disabled()
        b('Cancel').click()
        assert native()==before
        mark('Changing export format requires renewed loss acceptance; interchange export leaves the native document untouched')
        page.get_by_test_id('file-input').set_input_files({'name':'roundtrip.embl','mimeType':'text/plain','buffer':embl.encode()})
        dismiss();roundtrip=native()
        assert roundtrip['sequence']==before['sequence'] and roundtrip['topology']==before['topology']
        assert roundtrip['sourceArchive']['format']=='embl' and roundtrip['sourceArchive']['text']==embl
        assert len(roundtrip['features'])==len(before['features'])
        mark('An exported EMBL reopens in Gin Schnaps with the full original text archived')
        choose(10,20);page.keyboard.press(modifier+'+x');dismiss()
        assert native()['sequence']==roundtrip['sequence'][:9]+roundtrip['sequence'][20:]
        page.keyboard.press(modifier+'+z');assert native()==roundtrip
        mark('Standard Ctrl/Cmd+X remains a Cut alias with exact undo')
        assert not report['errors'],report['errors'];assert not report['network'],report['network']
        report['success']=True
    except Exception as e:
        report['failure']=str(e);page.screenshot(path=str(OUT/'workspace-exports-failure.png'));raise
    finally:
        (OUT/'workspace-exports-report.json').write_text(json.dumps(report,indent=2));browser.close()
