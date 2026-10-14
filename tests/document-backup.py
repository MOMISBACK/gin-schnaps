"""Portable backup UI, real file:// by default; no private documents or network."""
from pathlib import Path
import hashlib, json, os
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
mode=os.environ.get('GIN_SCHNAPS_TEST_MODE','file')
report={'mode':mode,'success':False,'checks':[],'errors':[],'network':[], 'hashing':'browser WebCrypto' if mode=='file' else 'explicit test-only Python adapter'}
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
    def dismiss():
        if button('Close message').count():button('Close message').click()
    def upload(doc):
        page.get_by_test_id('file-input').set_input_files({'name':'test.sg.json','mimeType':'application/json','buffer':json.dumps(doc).encode()})
        expect(page.locator('.notification')).to_be_visible();assert not page.get_by_role('alert').count();dismiss()
    def native():
        with page.expect_download() as d:button('Export native format (⌘/Ctrl S)').click()
        value=json.loads(Path(d.value.path()).read_text());dismiss();return value
    def open_backup(data):
        if not page.get_by_role('dialog',name='Document backups').count():button('Backups').click()
        page.get_by_test_id('backup-input').set_input_files({'name':'session.gin-backup.json','mimeType':'application/json','buffer':data})
    try:
        if mode=='inline':
            page.expose_function('__testDigest',lambda data:list(hashlib.sha256(bytes(data)).digest()))
            page.evaluate("Object.defineProperty(crypto,'subtle',{value:{digest:async(name,data)=>Uint8Array.from(await window.__testDigest(Array.from(data))).buffer}})")
            page.set_content((ROOT/'dist/index.html').read_text(),wait_until='domcontentloaded')
        else:page.goto((ROOT/'dist/index.html').as_uri())
        expect(page.get_by_test_id('map-view')).to_be_visible()
        fixture=json.loads((ROOT/'tests/fixtures/pcr-product-demo.sg.json').read_text());fixture['name']='PortableSource';upload(fixture)
        source=native();tab('Primers');page.get_by_label('Primer name 1',exact=True).fill('Incomplete portable draft')
        page.get_by_label('Primer annealing 1',exact=True).fill('NN?')
        page.get_by_label('Minimum PCR length',exact=True).fill('0')
        button('Backups').click()
        dialog=page.get_by_role('dialog',name='Document backups')
        expect(dialog).to_contain_text('1 unsaved PCR draft(s)');expect(dialog).to_contain_text('not encrypted')
        with page.expect_download() as d:button('Export document backup').click()
        raw=Path(d.value.path()).read_bytes();envelope=json.loads(raw);payload=json.loads(envelope['payload'])
        assert envelope['sha256']==hashlib.sha256(envelope['payload'].encode()).hexdigest()
        assert len(payload['documents'])==2 and json.loads(payload['documents'][1]['document'])==source
        assert payload['documents'][1]['draft']['primers'][0]['annealing']=='NN?'
        assert payload['documents'][1]['draft']['minLength']=='0'
        expect(dialog).to_contain_text('Download requested')
        mark('Export includes complete source, oligos and invalid PCR draft without changing save state')
        button('Close').click();expect(page.get_by_label('Primer name 1',exact=True)).to_have_value('Incomplete portable draft')
        assert native()==source
        open_backup(raw);expect(page.get_by_test_id('backup-preview')).to_contain_text('Checksum verified')
        bounds=dialog.bounding_box();assert bounds['x']>=0 and bounds['y']>=0 and bounds['y']+bounds['height']<=641
        page.screenshot(path=str(OUT/'document-backup-1024.png'))
        button('Cancel').click();assert page.get_by_role('tab',name='PortableSource',exact=True).count()==1
        expect(page.get_by_label('Primer annealing 1',exact=True)).to_have_value('NN?')
        mark('Compact preview and cancellation preserve original tabs and drafts')
        open_backup(raw);expect(button('Restore as new tabs')).to_be_enabled();button('Restore as new tabs').click();dismiss()
        assert page.get_by_role('tab',name='PortableSource',exact=True).count()==2
        assert native()==source
        tab('Primers');expect(page.get_by_label('Primer name 1',exact=True)).to_have_value('Incomplete portable draft')
        expect(page.get_by_label('Primer annealing 1',exact=True)).to_have_value('NN?')
        expect(page.get_by_label('Minimum PCR length',exact=True)).to_have_value('0')
        page.get_by_role('button',name='Close PortableSource',exact=True).last.click()
        expect(page.get_by_role('dialog',name='Unsaved PCR draft')).to_be_visible();button('Keep working').click()
        mark('Restoration appends unsaved copies and restores invalid forms as guarded drafts, not saved recipes')
        page.get_by_role('tab',name='PortableSource',exact=True).first.click();tab('Primers')
        expect(page.get_by_label('Primer annealing 1',exact=True)).to_have_value('NN?');assert native()==source
        mark('Existing document and its independent draft remain unchanged after restoration')
        open_backup(raw);expect(button('Restore as new tabs')).to_be_enabled()
        page.get_by_label('Restore 1 PCR draft(s) as unsaved form inputs',exact=True).uncheck()
        button('Restore as new tabs').click();dismiss();tab('Primers')
        expect(page.get_by_label('Primer annealing 1',exact=True)).not_to_have_value('NN?')
        assert native()==source
        mark('Draft exclusion is an explicit option and preserves the saved PCR setup')
        tampered={**envelope,'payload':envelope['payload'].replace('PortableSource','ChangedSource')}
        open_backup(json.dumps(tampered).encode());expect(dialog.get_by_role('alert')).to_contain_text('checksum mismatch')
        expect(button('Restore as new tabs')).to_be_disabled()
        mark('Changed backup bytes are refused before any document is restored')
        malformed=json.loads(envelope['payload']);doc=json.loads(malformed['documents'][1]['document']);doc['sequence']='BAD!';malformed['documents'][1]['document']=json.dumps(doc)
        encoded=json.dumps(malformed);rehashed={**envelope,'payload':encoded,'sha256':hashlib.sha256(encoded.encode()).hexdigest()}
        open_backup(json.dumps(rehashed).encode());expect(dialog.get_by_role('alert')).to_be_visible();expect(button('Restore as new tabs')).to_be_disabled()
        mark('Rehashed invalid scientific content is still refused by schema validation')
        open_backup(b'\xff\xfe\xff');expect(dialog.get_by_role('alert')).to_be_visible();expect(button('Restore as new tabs')).to_be_disabled()
        mark('Invalid UTF-8 is rejected, not silently repaired')
        # Wrong file type gives a clear failure rather than treating it as a backup.
        open_backup(json.dumps(source).encode());expect(dialog.get_by_role('alert')).to_be_visible()
        button('Cancel').click();assert native()==source
        mark('An ordinary native document is not misinterpreted as a backup; active data remain intact')
        # A full workspace refuses the all-or-nothing restore.
        doc_tabs=page.get_by_role('tablist',name='Open documents').get_by_role('tab')
        while doc_tabs.count()<16:
            upload({**fixture,'name':f'Capacity_{doc_tabs.count()}'})
        open_backup(raw);expect(dialog).to_contain_text('Not enough room');expect(button('Restore as new tabs')).to_be_disabled()
        button('Cancel').click();assert doc_tabs.count()==16
        mark('Capacity refusal does not partially restore or evict existing documents')
        assert not report['errors'],report['errors'];assert not report['network'],report['network']
        report['success']=True
    except Exception as e:
        report['failure']=str(e);page.screenshot(path=str(OUT/'document-backup-failure.png'));raise
    finally:
        (OUT/'document-backup-report.json').write_text(json.dumps(report,indent=2));browser.close()
