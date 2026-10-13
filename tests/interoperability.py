"""Step 4 file and opt-in recovery scenarios. file:// in CI; inline locally when
managed browser policy blocks file navigation. Inline cannot test IndexedDB persistence.
"""
from pathlib import Path
import json, os, struct, time, hashlib
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results'; OUT.mkdir(exist_ok=True)
mode = os.environ.get('GIN_SCHNAPS_TEST_MODE', 'file')
report = {'mode': mode, 'checks': [], 'errors': [], 'externalRequests': [], 'recoveryPersistenceTested': False}

def passed(text):
    print('PASS', text, flush=True); report['checks'].append(text)

def mutate_packet(data, kind, new_payload):
    output, pos = b'', 0
    while pos < len(data):
        tag, size = data[pos], struct.unpack('>I', data[pos+1:pos+5])[0]
        payload = data[pos+5:pos+5+size]; pos += 5+size
        if tag == kind: payload = new_payload
        output += bytes([tag]) + struct.pack('>I', len(payload)) + payload
    return output

with sync_playwright() as p:
    launch = {'headless': True}
    if os.environ.get('CHROMIUM_PATH'): launch['executable_path'] = os.environ['CHROMIUM_PATH']
    browser = p.chromium.launch(**launch)
    context = browser.new_context(accept_downloads=True, viewport={'width': 1280, 'height': 800})
    page = context.new_page(); page.set_default_timeout(10000);page.set_default_navigation_timeout(45000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    page.on('request', lambda r: report['externalRequests'].append(r.url) if r.url.startswith(('https:', 'http:')) else None)
    def load():
        if mode == 'inline': page.set_content((ROOT/'dist/index.html').read_text(), wait_until='domcontentloaded')
        else: page.goto((ROOT/'dist/index.html').as_uri())
        expect(page.get_by_test_id('map-view').locator('svg')).to_have_count(1)
    def upload(name, data):
        page.get_by_test_id('file-input').set_input_files({'name':name,'mimeType':'application/octet-stream','buffer':data})
    def native():
        with page.expect_download() as result: page.get_by_role('button',name='Export native format (⌘/Ctrl S)',exact=True).click()
        value=json.loads(Path(result.value.path()).read_text()); page.keyboard.press('Escape'); return value
    def close_modal(): page.get_by_role('dialog').get_by_role('button',name='Close',exact=True).first.click()
    try:
        load()
        dna = (ROOT/'tests/fixtures/synthetic-step4.dna').read_bytes()
        upload('synthetic-step4.dna', dna)
        expect(page.get_by_role('tab',name='synthetic-step4',exact=True)).to_be_visible()
        expect(page.locator('.notification')).to_contain_text('Partial'); page.keyboard.press('Escape')
        document = native()
        assert document['schemaVersion']==5 and document['sequence']==json.loads((ROOT/'tests/fixtures/synthetic-step4-expected.json').read_text())['sequence']
        assert document['features'][0]['segments']==[{'start':339,'end':360},{'start':0,'end':20}]
        assert document['features'][0]['strand']==-1
        assert document['features'][1]['segments']==[{'start':14,'end':15}]
        assert document['features'][2]['strand']==0
        assert [q['value'] for q in document['features'][0]['qualifiers']]==['First "quoted" note','Second note']
        passed('.dna binary import preserves sequence, signed circular ranges, one-base features and repeated qualifiers')
        page.get_by_role('button',name='Document information',exact=True).click()
        expect(page.locator('.import-report')).to_contain_text('Primers')
        expect(page.locator('.import-report')).to_contain_text('Archive only')
        assert ('snap' + 'gene') not in page.locator('body').inner_text().lower(), 'Unexpected external product label'
        page.screenshot(path=str(OUT/'binary-import.png'))
        with page.expect_download() as result: page.get_by_role('button',name='Export original source',exact=True).click()
        assert Path(result.value.path()).read_bytes()==dna
        passed('Uninterpreted primers/history/unknown blocks are reported and original .dna export is byte-identical')
        page.get_by_role('button',name='Close information',exact=True).click()
        upload('roundtrip.sg.json', json.dumps(document).encode())
        expect(page.get_by_role('tab',name='synthetic-step4',exact=True)).to_have_count(2);page.keyboard.press('Escape')
        assert native()==document
        passed('.dna source archive and import report survive native export/reopen unchanged')
        count=page.get_by_role('tablist',name='Open documents').get_by_role('tab').count()
        invalid_xml = [b'<Features><Feature>',
            b'<!DOCTYPE Features [<!ENTITY bomb "x">]><Features/>',
            b'<Features><Feature name="bad"><Segment range="0-15"/></Feature></Features>',
            b'<Features><Feature name="bad"><Segment range="1-10"/><Segment range="5-30"/></Feature></Features>',
            b'<Features><Feature name="bad" directionality="3"><Segment range="1-10"/></Feature></Features>',
            b'<Features><Feature name="bad"><Segment range="1-10"/><Q name="__proto__"><V text="bad"/></Q></Feature></Features>']
        bad_files=[dna[:-1],dna+b'\xff',mutate_packet(dna,0,bytes([1])+document['sequence'].encode())]
        bad_files += [mutate_packet(dna,10,x) for x in invalid_xml]
        for payload in bad_files:
            upload('bad.dna',payload);expect(page.get_by_role('alert')).to_be_visible()
            assert page.get_by_role('tablist',name='Open documents').get_by_role('tab').count()==count
            page.keyboard.press('Escape')
        passed('Nine malformed/unsupported .dna inputs are rejected transactionally, including DTD and prototype keys')

        upload('export-control.gb',(ROOT/'tests/fixtures/synthetic-120.gb').read_bytes());page.keyboard.press('Escape')
        # Current data, not archived original: modify the origin-spanning region.
        page.get_by_role('button',name='Edit bases',exact=True).click()
        page.get_by_label('Edit start',exact=True).fill('110');page.get_by_label('Edit end',exact=True).fill('10')
        page.get_by_label('DNA to insert',exact=True).fill('NNNN');page.get_by_role('button',name='Apply',exact=True).click();page.keyboard.press('Escape')
        modified=native()
        assert len(modified['sequence'])==103
        page.get_by_role('button',name='Export current document as GenBank',exact=True).click()
        expect(page.get_by_role('button',name='Download GenBank',exact=True)).to_be_disabled()
        expect(page.get_by_role('dialog')).to_contain_text('archived qualifiers')
        page.screenshot(path=str(OUT/'genbank-export-step4.png'))
        page.get_by_role('checkbox',name='I understand the limitations; I will also keep the native file.',exact=True).check()
        with page.expect_download() as result: page.get_by_role('button',name='Download GenBank',exact=True).click()
        exported=Path(result.value.path()).read_bytes(); (OUT/'current-export.gb').write_bytes(exported)
        (OUT/'current-export-native.json').write_text(json.dumps(modified))
        expect(page.locator('.dirty-dot').last).to_be_visible()
        passed('GenBank export requires acknowledging losses, exports the edited molecule, and never clears native dirty state')
        page.keyboard.press('Escape');upload('reread.gb',exported);page.keyboard.press('Escape')
        reread=native();assert reread['sequence']==modified['sequence']
        assert [(f['segments'],f['strand']) for f in reread['features']]==[(f['segments'],f['strand']) for f in modified['features']]
        passed('Edited GenBank reimport retains the 103-base sequence, origin-spanning annotations and strand directions')
        page.get_by_role('button',name='Recovery',exact=True).click()
        if mode == 'inline':
            expect(page.get_by_role('dialog')).to_contain_text('Local storage')
            expect(page.get_by_role('checkbox')).to_be_disabled()
            passed('Denied/opaque-origin storage leaves editing/export available and reports recovery unavailable')
            close_modal()
        else:
            report['recoveryPersistenceTested']=True
            expect(page.get_by_role('checkbox',name='Enable automatic recovery on this device',exact=True)).not_to_be_checked()
            # User opt-in is mandatory; no document was written by merely opening files.
            count_before=page.evaluate('''async () => new Promise((resolve,reject)=> { const r=indexedDB.open('gin-schnaps-recovery-v1:'+location.pathname,1);r.onsuccess=()=>{const d=r.result,t=d.transaction('recovery'),q=t.objectStore('recovery').get('current');q.onsuccess=()=>{resolve(q.result===undefined);d.close()}};r.onerror=()=>reject(r.error)})''')
            assert count_before
            page.get_by_role('checkbox',name='Enable automatic recovery on this device',exact=True).check()
            expect(page.get_by_test_id('recovery-status')).to_contain_text('Local copy written', timeout=10000)
            passed('No DNA is persisted before consent; opt-in produces a confirmed IndexedDB checkpoint')
            close_modal()
            # Second revision becomes the primary snapshot; previous stays valid.
            page.get_by_role('button',name='Edit bases',exact=True).click()
            page.get_by_label('Edit start',exact=True).fill('1');page.get_by_label('Edit end',exact=True).fill('1')
            page.get_by_label('DNA to insert',exact=True).fill('AAAA');page.get_by_role('button',name='Apply',exact=True).click();page.keyboard.press('Escape')
            # wait_for_function treats a returned Promise as truthy before its boolean
            # resolves in Playwright 1.58. Poll evaluate's awaited transaction result
            # instead: only a committed, semantically checked checkpoint permits reload.
            deadline = time.monotonic() + 10
            checkpoint = None
            while time.monotonic() < deadline:
                checkpoint = page.evaluate('''async () => new Promise((resolve,reject)=>{
                    const r=indexedDB.open('gin-schnaps-recovery-v1:'+location.pathname,1);
                    r.onerror=()=>reject(r.error);r.onsuccess=()=>{
                        const db=r.result,t=db.transaction('recovery'),q=t.objectStore('recovery').get('current');
                        t.oncomplete=()=>{const result=q.result?JSON.parse(q.result):null;db.close();resolve(result)};
                        t.onerror=t.onabort=()=>{db.close();reject(t.error)};
                    }
                })''')
                if checkpoint and len(checkpoint['documents'][-1]['doc']['sequence']) == 106:
                    break
                page.wait_for_timeout(50)
            assert checkpoint and len(checkpoint['documents'][-1]['doc']['sequence']) == 106, 'Edited checkpoint was not committed'
            assert checkpoint['activeIndex'] == len(checkpoint['documents']) - 1
            (OUT/'recovery-before-reload.json').write_text(json.dumps(checkpoint, ensure_ascii=False))
            page.on('dialog',lambda d:d.accept())
            page.reload();expect(page.get_by_text('A local session is available for recovery. Open “Recovery”.',exact=True)).to_be_visible()
            page.get_by_role('button',name='Recovery',exact=True).click()
            expect(page.get_by_role('button',name='Restore session',exact=True)).to_be_visible()
            page.screenshot(path=str(OUT/'recovery-step4.png'))
            page.get_by_role('button',name='Restore session',exact=True).click()
            restored=native()
            assert restored == checkpoint['documents'][checkpoint['activeIndex']]['doc'], 'Restoration must reproduce the committed active document exactly'
            expect(page.locator('.dirty-dot').last).to_be_visible()
            passed('Reload offers recovery instead of overwriting it with demo data; restore keeps edits and marks documents unexported')
            # A competing window writes a newer revision; our next save must refuse it.
            page.evaluate('''async()=>new Promise(resolve=>{const r=indexedDB.open('gin-schnaps-recovery-v1:'+location.pathname,1);r.onsuccess=()=>{const db=r.result,t=db.transaction('recovery','readwrite'),s=t.objectStore('recovery'),q=s.get('settings');q.onsuccess=()=>s.put({...q.result,revision:q.result.revision+1},'settings');t.oncomplete=()=>{db.close();resolve()}}})''')
            page.get_by_role('button',name='Edit bases',exact=True).click()
            page.get_by_label('Edit start',exact=True).fill('1');page.get_by_label('Edit end',exact=True).fill('1')
            page.get_by_label('DNA to insert',exact=True).fill('CCC');page.get_by_role('button',name='Apply',exact=True).click();page.keyboard.press('Escape')
            page.get_by_role('button',name='Recovery',exact=True).click()
            expect(page.get_by_role('alert')).to_contain_text('Another window changed the recovery data.',timeout=10000)
            passed('Revision conflict suspends recovery rather than overwriting a checkpoint from another window')
            close_modal();page.reload();page.get_by_role('button',name='Recovery',exact=True).click()
            page.get_by_role('button',name='Clear and disable',exact=True).click()
            expect(page.get_by_role('button',name='Restore session',exact=True)).to_have_count(0)
            expect(page.get_by_role('checkbox')).not_to_be_checked()
            passed('Explicit clear deletes both saved copies and disables autosaving without deleting open documents')
            close_modal()
            fallback_data={'version':1,'savedAt':'2026-10-13T00:00:00Z','activeIndex':0,'documents':[{'source':'validated fallback','doc':reread}]}
            page.evaluate('''async (snapshot)=>new Promise(resolve=>{const r=indexedDB.open('gin-schnaps-recovery-v1:'+location.pathname,1);r.onsuccess=()=>{const db=r.result,t=db.transaction('recovery','readwrite'),s=t.objectStore('recovery');s.put('corrupt','current');s.put(JSON.stringify(snapshot),'previous');s.put({enabled:true,revision:100},'settings');t.oncomplete=()=>{db.close();resolve()}}})''',fallback_data)
            page.reload();page.get_by_role('button',name='Recovery',exact=True).click()
            expect(page.get_by_role('dialog')).to_contain_text('Latest copy is invalid')
            page.get_by_role('button',name='Restore session',exact=True).click()
            assert native()['sequence']==reread['sequence']
            passed('Corrupted primary copy is not loaded; the preceding validated copy is offered explicitly')
        # Export dialog is usable at the target compact size.
        page.set_viewport_size({'width':1024,'height':640})
        page.get_by_role('button',name='Export current document as GenBank',exact=True).click()
        box=page.get_by_role('dialog').bounding_box();assert box['x']>=0 and box['y']>=0 and box['y']+box['height']<=640
        page.screenshot(path=str(OUT/'interoperability-1024x640.png'));close_modal()
        passed('Interchange dialog fits 1024x640 without hiding validation or action controls')
        assert not report['errors'],report['errors'];assert not report['externalRequests'],report['externalRequests']
        report['success']=True
    except Exception as e:
        report['success']=False;report['failure']=str(e)
        try:page.screenshot(path=str(OUT/'interoperability-failure.png'),timeout=5000)
        except Exception:pass
        raise
    finally:
        (OUT/'interoperability-report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
        browser.close()
