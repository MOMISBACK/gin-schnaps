"""Clipboard regression: real user-triggered OS copy/paste, plus explicit fallback.
file:// in CI; injected-HTML mode is recorded separately and is not an install test.
"""
from pathlib import Path
import json, os, platform
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'test-results'; OUT.mkdir(exist_ok=True)
mode=os.environ.get('GIN_SCHNAPS_TEST_MODE','file')
report={'mode':mode,'success':False,'checks':[],'errors':[],'network':[],'realKeyboardClipboardTested':False}
with sync_playwright() as p:
    opts={'headless':True}
    if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
    browser=p.chromium.launch(**opts)
    page=browser.new_page(accept_downloads=True,viewport={'width':1024,'height':640});page.set_default_timeout(12000)
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
    page.on('request',lambda r:report['network'].append(r.url) if r.url.startswith(('http:','https:')) else None)
    modifier='Meta' if platform.system()=='Darwin' else 'Control'
    def button(name):return page.get_by_role('button',name=name,exact=True)
    def mark(name):report['checks'].append(name);print('PASS',name,flush=True)
    def dismiss():
        if button('Close message').count():button('Close message').click()
    def upload(name,sequence,circular=False,features=None):
        doc={'schemaVersion':5,'id':name,'name':name,'description':'Synthetic clipboard test',
             'sequence':sequence,'topology':'circular' if circular else 'linear','features':features or [],
             'provenance':'local-file','sourceArchive':None,'history':[],'historyOmitted':0,'primers':[],'pcrRecipe':None}
        page.get_by_test_id('file-input').set_input_files({'name':name+'.sg.json','mimeType':'application/json','buffer':json.dumps(doc).encode()})
        expect(page.get_by_role('tab',name=name,exact=True)).to_be_visible();dismiss();return doc
    def choose(first,last):
        page.get_by_label('Selection start',exact=True).fill(str(first));page.get_by_label('Selection end',exact=True).fill(str(last));button('Select').click()
    def export_doc():
        with page.expect_download() as d:button('Export native format (⌘/Ctrl S)').click()
        doc=json.loads(Path(d.value.path()).read_text());dismiss();return doc
    def paste_dialog():return page.get_by_role('dialog',name='Paste DNA',exact=True)
    try:
        if mode=='inline':page.set_content((ROOT/'dist/index.html').read_text(),wait_until='domcontentloaded')
        else:page.goto((ROOT/'dist/index.html').as_uri())
        expect(page.get_by_test_id('map-view')).to_be_visible()
        target=upload('Target','TTTTGGGG')
        source=upload('Source','AACCGGTTAACC',True)
        choose(10,3)
        copied=source['sequence'][9:]+source['sequence'][:3]
        page.keyboard.press(modifier+'+c')
        expect(page.locator('.notification')).to_contain_text('bp copied')
        dismiss()
        page.get_by_role('tab',name='Target',exact=True).click();choose(5,8)
        page.keyboard.press(modifier+'+v')
        expect(paste_dialog()).to_be_visible()
        expect(page.get_by_label('DNA to paste',exact=True)).to_have_value(copied)
        expect(page.get_by_label('Paste operation',exact=True)).to_have_value('replace')
        expect(page.get_by_label('Paste start',exact=True)).to_have_value('5');expect(page.get_by_label('Paste end',exact=True)).to_have_value('8')
        assert button('Apply paste').is_enabled()
        report['realKeyboardClipboardTested']=True
        mark('Actual keyboard Copy from an origin-spanning source and Paste into a second document preserve exactly the copied bases')
        page.screenshot(path=str(OUT/'paste-between-documents-1024.png'))
        button('Cancel').click();assert export_doc()==target
        mark('Cancelling paste preserves the exact destination document')
        button('Paste DNA (⌘/Ctrl V)').click();button('Use last copied DNA').click()
        expect(paste_dialog()).to_contain_text('not a fresh system clipboard read')
        button('Apply paste').click();dismiss()
        pasted=export_doc();assert pasted['sequence']=='TTTT'+copied and len(pasted['history'])==1
        assert not pasted['features']
        button('Undo (⌘/Ctrl Z)').click();assert export_doc()==target
        button('Redo (⌘/Ctrl ⇧ Z)').click();assert export_doc()==pasted
        page.get_by_role('tab',name='Source',exact=True).click();assert export_doc()==source
        page.get_by_role('tab',name='Target',exact=True).click()
        mark('One paste creates one undoable edit, redo is exact, and the source is unchanged')
        button('Paste DNA (⌘/Ctrl V)').click();page.get_by_label('DNA to paste',exact=True).fill('>one\n aCgT ry\n')
        page.get_by_label('Paste operation',exact=True).select_option('insert');button('Append at end').click()
        expect(page.get_by_label('Paste start',exact=True)).to_have_value(str(len(pasted['sequence'])+1))
        expect(page.get_by_label('Paste preview',exact=True)).to_contain_text('FASTA header removed')
        button('Apply paste').click();dismiss()
        appended=export_doc();assert appended['sequence']==pasted['sequence']+'ACGTRY'
        mark('Single-record FASTA can be appended with explicit normalization and no annotation transfer')
        button('Paste DNA (⌘/Ctrl V)').click();box=page.get_by_label('DNA to paste',exact=True)
        for invalid in ['ACGU','12ACGT','AC-GT','>one\nACGT\n>two\nATGC']:
            box.fill(invalid);expect(button('Apply paste')).to_be_disabled()
        box.fill('A'*100001);expect(button('Apply paste')).to_be_disabled()
        button('Cancel').click();assert export_doc()==appended
        mark('Invalid characters, multiple FASTA records and excess length refuse paste without changing the destination')
        button('Paste DNA (⌘/Ctrl V)').click();box.fill('AACG');page.get_by_label('Reverse-complement pasted DNA',exact=True).check()
        page.get_by_label('Paste operation',exact=True).select_option('new');page.get_by_label('Pasted document name',exact=True).fill('Independent paste')
        page.get_by_label('Pasted document topology',exact=True).select_option('circular');button('Create document').click()
        created=export_doc();assert created['sequence']=='CGTT' and created['topology']=='circular' and created['features']==[]
        mark('Pasted reverse-complement DNA can create a separate circular document without changing existing files')
        button('Properties').click();name=page.get_by_label('Document name',exact=True)
        name.fill('');name.press(modifier+'+v');expect(name).to_have_value(copied)
        expect(paste_dialog()).to_have_count(0);button('Cancel').click()
        mark('Pasting into an ordinary text field retains normal text editing rather than opening a DNA edit')
        # Deliberately refuse the optional asynchronous API; no hidden fallback to old clipboard data.
        page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:()=>Promise.reject(new Error('Denied')),writeText:()=>Promise.reject(new Error('Denied'))}})")
        button('Paste DNA (⌘/Ctrl V)').click();button('Read clipboard').click()
        expect(paste_dialog()).to_contain_text('unavailable or denied')
        expect(page.get_by_label('DNA to paste',exact=True)).to_have_value('')
        page.get_by_label('DNA to paste',exact=True).press(modifier+'+v');expect(page.get_by_label('DNA to paste',exact=True)).to_have_value(copied)
        button('Cancel').click()
        mark('Denied clipboard read has an explicit explanation; user-triggered Paste still works without permission')
        page.get_by_role('tab',name='Source',exact=True).click();choose(1,4)
        expect(page.get_by_label('Selection start',exact=True)).to_have_value('1')
        expect(page.get_by_label('Selection end',exact=True)).to_have_value('4')
        expect(page.get_by_test_id('selection-status')).to_contain_text('4 bp')
        page.keyboard.press(modifier+'+Shift+c');expect(page.locator('.notification')).to_contain_text('4 bp copied (reverse complement)');dismiss()
        page.get_by_role('tab',name='Target',exact=True).click();button('Paste DNA (⌘/Ctrl V)').click()
        expect(page.get_by_label('DNA to paste',exact=True)).to_have_value('')
        page.get_by_label('DNA to paste',exact=True).press(modifier+'+v');expect(page.get_by_label('DNA to paste',exact=True)).to_have_value('GGTT')
        button('Cancel').click()
        mark('Copy RC works across documents even when asynchronous clipboard writing is denied')
        page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:()=>new Promise(resolve=>{window.finishClipboardRead=resolve})}})")
        button('Paste DNA (⌘/Ctrl V)').click();button('Read clipboard').click()
        page.get_by_label('DNA to paste',exact=True).fill('AAC')
        page.evaluate("window.finishClipboardRead('TTT')")
        expect(paste_dialog()).to_contain_text('ignored because you edited')
        expect(page.get_by_label('DNA to paste',exact=True)).to_have_value('AAC');button('Cancel').click()
        mark('Late asynchronous clipboard reads cannot overwrite subsequently edited input')
        # Native menu events share handlers; this is event-path coverage, not an automated OS menu click.
        page.get_by_role('tab',name='Source',exact=True).click();choose(10,3)
        actual=page.evaluate("() => {const dt=new DataTransfer();window.dispatchEvent(new ClipboardEvent('copy',{clipboardData:dt,bubbles:true,cancelable:true}));return dt.getData('text/plain')}")
        assert actual==copied
        page.get_by_role('tab',name='Target',exact=True).click()
        page.evaluate("() => {const dt=new DataTransfer();dt.setData('text/plain','NRY');window.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))}")
        expect(page.get_by_label('DNA to paste',exact=True)).to_have_value('NRY')
        button('Cancel').click()
        mark('Copy/Paste event handlers support native-menu event paths (synthetic event coverage only)')
        circular=upload('Circular target','AAAACCCCGGGGTTTT',True);choose(14,3)
        button('Paste DNA (⌘/Ctrl V)').click();page.get_by_label('DNA to paste',exact=True).fill('NRY')
        expect(page.get_by_label('Paste preview',exact=True)).to_contain_text('new origin')
        button('Apply paste').click();dismiss();assert export_doc()['sequence']==circular['sequence'][3:13]+'NRY'
        mark('Replacing across the circular origin uses the existing, explicitly reported coordinate convention')
        button('Paste DNA (⌘/Ctrl V)').click();page.get_by_label('DNA to paste',exact=True).fill('ACGT')
        prevented=page.evaluate("() => {const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented}")
        assert prevented;page.keyboard.press(modifier+'+n');expect(page.get_by_role('dialog')).to_have_count(1)
        expect(page.get_by_role('dialog',name='New DNA document',exact=True)).to_have_count(0)
        button('Cancel').click()
        mark('An open paste blocks background New commands and protects against browser-page departure')
        assert not report['errors'],report['errors'];assert not report['network'],report['network']
        report['success']=True
    except Exception:
        page.screenshot(path=str(OUT/'clipboard-failure.png'));raise
    finally:
        (OUT/'clipboard-report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False));browser.close()
