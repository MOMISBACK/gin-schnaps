"""Actual corrective-patch UI regressions. file:// in CI; inline fallback is explicit."""
from pathlib import Path
import json, os
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
mode=os.environ.get('GIN_SCHNAPS_TEST_MODE','file')
report={'mode':mode,'success':False,'checks':[],'errors':[],'network':[]}
with sync_playwright() as p:
    opts={'headless':True}
    if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
    browser=p.chromium.launch(**opts)
    page=browser.new_page(accept_downloads=True,viewport={'width':1024,'height':640});page.set_default_timeout(12000)
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
    page.on('request',lambda r:report['network'].append(r.url) if r.url.startswith(('http:','https:')) else None)
    def button(n):return page.get_by_role('button',name=n,exact=True)
    def tab(n):page.get_by_role('tab',name=n,exact=True).click()
    def mark(n):report['checks'].append(n);print('PASS',n,flush=True)
    def upload(doc):
        page.get_by_test_id('file-input').set_input_files({'name':'test.sg.json','mimeType':'application/json','buffer':json.dumps(doc).encode()})
        expect(page.locator('.notification')).to_be_visible();assert not page.get_by_role('alert').count();page.keyboard.press('Escape')
    def export_doc(confirm=False):
        with page.expect_download() as d:button('Export native format (⌘/Ctrl S)').click()
        doc=json.loads(Path(d.value.path()).read_text())
        if confirm:button('Confirm file received').click()
        else:page.keyboard.press('Escape')
        return doc
    try:
        if mode=='inline':page.set_content((ROOT/'dist/index.html').read_text(),wait_until='domcontentloaded')
        else:page.goto((ROOT/'dist/index.html').as_uri())
        expect(page.get_by_test_id('map-view')).to_be_visible()
        fixture=json.loads((ROOT/'tests/fixtures/primer-library-demo.sg.json').read_text())
        long={**fixture,'name':'500 event test','history':[{'action':'metadata','summary':f'Prior {i}','warnings':[]} for i in range(500)]}
        upload(long)
        button('Properties').click();page.get_by_label('Document name',exact=True).fill('501 event test');button('Apply').click();page.keyboard.press('Escape')
        tab('History');expect(page.get_by_test_id('history-retention')).to_contain_text('1 older operation')
        current=export_doc();assert current['schemaVersion']==5 and current['historyOmitted']==1 and len(current['history'])==500
        assert current['features']==fixture['features'] and current['primers']==fixture['primers']
        mark('The reproduced 501st-change blockade is fixed; compaction is visible and scientific data are unchanged')
        button('Undo (⌘/Ctrl Z)').click();old=export_doc();assert len(old['history'])==500 and old['historyOmitted']==0 and old['name']=='500 event test'
        button('Redo (⌘/Ctrl ⇧ Z)').click();assert export_doc()==current
        mark('Undo and redo restore the full pre/post-compaction documents')
        current['name']='Reopened journal';upload(current);assert export_doc()==current
        mark('Native export and reimport retain the compaction count and complete current document')
        fresh={**fixture,'name':'PCR draft test'};upload(fresh);tab('Primers')
        original=export_doc();page.get_by_label('Primer name 1',exact=True).fill('Do not lose me')
        expect(page.locator('.saved-pcr-controls')).to_contain_text('Unsaved PCR draft')
        button('Close PCR draft test').click();dialog=page.get_by_role('dialog',name='Unsaved PCR draft',exact=True);expect(dialog).to_be_visible()
        page.screenshot(path=str(OUT/'pcr-draft-close-1024.png'))
        button('Keep working').click();expect(page.get_by_label('Primer name 1',exact=True)).to_have_value('Do not lose me')
        mark('Close warns for a draft even when the scientific document is saved; Keep working preserves it')
        unchanged=export_doc(True);assert unchanged==original
        # Export acknowledgement must never dismiss the draft or the page-leave guard.
        button('Close PCR draft test').click();expect(dialog).to_be_visible();button('Keep working').click()
        prevented=page.evaluate("() => { const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented; }")
        assert prevented
        mark('Confirmed file export does not falsely checkpoint the draft; browser leave guard remains active')
        button('Close PCR draft test').click();dialog.get_by_role('button',name='Save PCR setup',exact=True).click()
        expect(dialog).to_have_count(0);expect(page.get_by_role('tab',name='PCR draft test',exact=True)).to_be_visible()
        stored=export_doc(True);assert any(x['name']=='Do not lose me' for x in stored['primers']);assert stored['pcrRecipe']
        button('Close PCR draft test').click();expect(page.get_by_role('tab',name='PCR draft test',exact=True)).to_have_count(0)
        stored['name']='Stored draft reopened';upload(stored);tab('Primers');expect(page.get_by_label('Primer name 1',exact=True)).to_have_value('Do not lose me')
        mark('Save PCR setup keeps the tab open for a real file export, then survives closing and reopening')
        page.get_by_label('Primer annealing 1',exact=True).fill('NN')
        button('Close Stored draft reopened').click();expect(dialog.get_by_role('button',name='Save PCR setup',exact=True)).to_be_disabled();button('Keep working').click()
        expect(page.get_by_label('Primer annealing 1',exact=True)).to_have_value('NN')
        mark('Invalid drafts cannot be saved as valid recipes but are not discarded')
        # Default confirm dismissal leaves the manual fields in place.
        button('Load saved PCR setup').click();expect(page.get_by_label('Primer annealing 1',exact=True)).to_have_value('NN')
        page.once('dialog',lambda d:d.accept());button('Load saved PCR setup').click()
        expect(page.get_by_label('Primer annealing 1',exact=True)).not_to_have_value('NN')
        mark('Loading stored setup requires explicit permission to overwrite changed form fields')
        page.get_by_label('Primer name 1',exact=True).fill('Independent draft')
        # Add/modify library data without changing independent manual fields.
        summary=page.locator('.primer-library summary')
        if not page.locator('.primer-library').get_attribute('open'):summary.click()
        button('Add oligo').click();page.get_by_label('Oligo name',exact=True).fill('Additional oligo');page.get_by_label('Oligo sequence',exact=True).fill('ACGTACGT')
        button('Save oligo').click();page.keyboard.press('Escape')
        expect(page.get_by_label('Primer name 1',exact=True)).to_have_value('Independent draft')
        mark('Library changes preserve a separate manual PCR draft instead of resetting it')
        export_doc(True)
        button('Close Stored draft reopened').click();button('Discard draft and close').click()
        expect(page.get_by_role('tab',name='Stored draft reopened',exact=True)).to_have_count(0)
        mark('Explicit discard closes the tab only after the user chooses it')
        assert not report['errors'],report['errors'];assert not report['network'],report['network']
        report['success']=True
    finally:
        (OUT/'reliability-report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False));browser.close()
