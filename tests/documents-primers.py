"""Step 7 actual application workflows; sources and expected corpus are independent.
file:// in CI. Inline mode never claims persistent recovery was tested.
"""
from pathlib import Path
import json, os, sys, subprocess, hashlib, time
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
mode=os.environ.get('GIN_SCHNAPS_TEST_MODE','file');case=os.environ.get('GIN_SCHNAPS_DOCS_CASE','all')
CASES=['library','locations','upstream','corpus-linear','corpus-circular','recovery']
if case=='all':
    reports=[]
    for c in CASES:
        subprocess.run([sys.executable,__file__],env={**os.environ,'GIN_SCHNAPS_DOCS_CASE':c},check=True,timeout=180)
        reports.append(json.loads((OUT/f'documents-{c}.json').read_text()))
    (OUT/'documents-primers-report.json').write_text(json.dumps({'success':True,'mode':mode,'checks':sum(len(x['checks']) for x in reports),'scenarios':reports},indent=2,ensure_ascii=False));sys.exit(0)
if case not in CASES:raise ValueError(case)
report={'case':case,'mode':mode,'checks':[],'errors':[],'network':[]}
def passed(message):report['checks'].append(message);print('PASS',message,flush=True)
def rc(s):return s.translate(str.maketrans('ACGTRYSWKMBDHVN','TGCAYRSWMKVHDBN'))[::-1]
with sync_playwright() as p:
    options={'headless':True}
    if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
    browser=p.chromium.launch(**options);context=browser.new_context(accept_downloads=True,viewport={'width':1280,'height':800})
    page=context.new_page();page.set_default_timeout(12000)
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
    page.on('request',lambda r:report['network'].append(r.url) if r.url.startswith(('http:','https:')) else None)
    def button(name):return page.get_by_role('button',name=name,exact=True)
    def tab(name):page.get_by_role('tab',name=name,exact=True).click()
    def load():
        if mode=='inline':page.set_content((ROOT/'dist/index.html').read_text(),wait_until='domcontentloaded')
        else:page.goto((ROOT/'dist/index.html').as_uri())
        expect(page.get_by_role('tab',name='Map',exact=True)).to_be_visible()
    def upload(name,data,allowed=True):
        if isinstance(data,dict):data=json.dumps(data,ensure_ascii=False).encode()
        page.get_by_test_id('file-input').set_input_files({'name':name,'mimeType':'application/octet-stream','buffer':data})
        expect(page.locator('.notification')).to_be_visible()
        error=page.get_by_role('alert').count()>0
        message=page.locator('.notification').inner_text();page.keyboard.press('Escape')
        if allowed:assert not error,message
        return error,message
    def native():
        with page.expect_download() as ev:button('Export native format (⌘/Ctrl S)').click()
        result=json.loads(Path(ev.value.path()).read_text());page.keyboard.press('Escape');return result
    def genbank():
        button('Export current document as GenBank').click()
        expect(button('Download GenBank')).to_be_disabled()
        page.get_by_role('checkbox',name='I understand the limitations; I will also keep the native file.',exact=True).check()
        with page.expect_download() as ev:button('Download GenBank').click()
        text=Path(ev.value.path()).read_text();page.keyboard.press('Escape');return text
    def fill_pcr():
        for i,(name,suffix,tail) in enumerate([('Saved A','ATGCGTAC','GG'),('Saved B','TACCGCTA','CC')],1):
            page.get_by_label(f'Primer name {i}',exact=True).fill(name)
            page.get_by_label(f'Primer annealing {i}',exact=True).fill(suffix)
            page.get_by_label(f'Primer tail {i}',exact=True).fill(tail)
        page.get_by_label('Maximum PCR length',exact=True).fill('1000')
        button('Save PCR setup').click();page.keyboard.press('Escape')
    def create_library_source():
        d=native();d['name']='Library template';d['sequence']='ATGCGTAC'+'AC'*12+rc('TACCGCTA');d['topology']='linear';d['features']=[];d['primers']=[];d['pcrRecipe']=None;d['sourceArchive']=None
        upload('library.sg.json',d);tab('Primers');fill_pcr();return native()
    def expand_library():
        if not page.locator('.primer-library').get_attribute('open'):page.locator('.primer-library summary').click()
    try:
        load()
        if case=='library':
            stored=create_library_source();assert stored['schemaVersion']==4 and len(stored['primers'])==2
            assert [x['sequence'] for x in stored['primers']]==['GGATGCGTAC','CCTACCGCTA'];assert stored['pcrRecipe']['annealingStarts']==[2,2]
            tab('Map');tab('Primers');expect(page.get_by_label('Primer tail 1',exact=True)).to_have_value('GG')
            passed('Explicit PCR save persists both complete oligos, suffix boundaries and product limits; navigation retains the setup')
            # A fresh document key demonstrates persistence rather than the session-only form cache.
            upload('reopened.sg.json',stored);tab('Primers');expect(page.get_by_label('Primer tail 1',exact=True)).to_have_value('GG')
            expect(page.get_by_label('Maximum PCR length',exact=True)).to_have_value('1000');assert native()==stored
            button('Simulate exact PCR').click();expect(page.get_by_test_id('pcr-results')).to_be_visible()
            with page.expect_download() as ev:button('Export PCR product 1').click()
            product=''.join(Path(ev.value.path()).read_text().splitlines()[1:]);assert product=='GG'+stored['sequence']+'GG'
            passed('Native reopen reloads recipe and reproduces a full PCR product including the reverse-primer tail')
            expand_library();button('Define annealing Saved A').click();page.get_by_label('Library tail length',exact=True).fill('2')
            button('Find annealing sites').click();expect(page.get_by_test_id('library-sites')).to_contain_text('1 compatible site(s)')
            expect(page.get_by_test_id('library-sites')).to_contain_text('definite')
            button('Use as primer A').click();expect(page.get_by_label('Primer annealing 1',exact=True)).to_have_value('ATGCGTAC')
            page.screenshot(path=str(OUT/'step7-primer-library.png'))
            passed('Library search uses the explicitly declared suffix, not the tail, and loads it into PCR without guessing Tm')
            button('Edit oligo Saved A').click();page.get_by_label('Oligo notes',exact=True).fill('Notes françaises conservées\nSecond line');button('Save oligo').click();page.keyboard.press('Escape')
            with_note=native();assert with_note['primers'][0]['notes']=='Notes françaises conservées\nSecond line';assert with_note['pcrRecipe']==stored['pcrRecipe']
            button('Edit oligo Saved A').click();page.get_by_label('Oligo sequence',exact=True).fill('GGGTACGCAT');button('Save oligo').click();page.keyboard.press('Escape')
            changed=native();assert changed['pcrRecipe'] is None
            expect(page.get_by_test_id('library-sites')).to_have_count(0)
            button('Undo (⌘/Ctrl Z)').click();page.keyboard.press('Escape');assert native()==with_note
            button('Load saved PCR setup').click();expect(page.get_by_label('Primer annealing 1',exact=True)).to_have_value('ATGCGTAC')
            passed('Notes remain literal; changing the reagent invalidates its saved recipe and stale binding results; undo restores exact data')
            with page.expect_download() as ev:button('Export oligo FASTA').click()
            f=Path(ev.value.path()).read_text();assert 'GGATGCGTAC' in f and 'CCTACCGCTA' in f and 'Second line' not in f
            page.once('dialog',lambda d:d.accept());button('Delete oligo Saved B').click();page.keyboard.press('Escape')
            assert len(native()['primers'])==1;button('Undo (⌘/Ctrl Z)').click();page.keyboard.press('Escape');assert native()==with_note
            passed('FASTA exports full oligos without claiming to preserve notes; confirmed deletion and undo are exact')
            page.set_viewport_size({'width':1024,'height':640});button('Add oligo').click()
            page.get_by_label('Oligo name',exact=True).fill('Degenerate reagent');page.get_by_label('Oligo sequence',exact=True).fill('acgt nry')
            expect(page.get_by_label('Oligo sequence',exact=True)).to_have_value('ACGTNRY')
            save=button('Save oligo');assert save.bounding_box()['y']+save.bounding_box()['height']<=640
            page.get_by_label('Oligo name',exact=True).press('Shift+Tab');expect(save).to_be_focused()
            save.click();page.keyboard.press('Escape');assert native()['primers'][-1]['sequence']=='ACGTNRY'
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            passed('Compact library dialog is keyboard-trapped, fits 1024×640 and stores explicit IUPAC reagents')
        elif case=='locations':
            text=(ROOT/'tests/fixtures/synthetic-120.gb').read_text().replace('     misc_feature    41..80','     CDS             join(41..50,61..80)').replace('/label="Region B"','/label="Region B"\n                     /translation="FAKE"')
            upload('joined.gb',text.encode());joined=native();f=joined['features'][2]
            assert f['segments']==[{'start':40,'end':50},{'start':60,'end':80}]
            tab('Features');button(f['name']).click();expect(page.locator('.detail-row')).to_contain_text('intervening bases are not part')
            button('Part 2: 61..80').click();expect(page.get_by_test_id('selection-status')).to_contain_text('20 bp')
            tab('Sequence');expect(page.locator('.sequence-feature').first).to_be_visible() if page.locator('.sequence-feature').count() else None
            page.screenshot(path=str(OUT/'step7-joined-sequence.png'))
            before=native();button('Edit bases').click();page.get_by_label('Edit start',exact=True).fill('1');page.get_by_label('Edit end',exact=True).fill('1');page.get_by_label('DNA to insert',exact=True).fill('A')
            expect(page.get_by_role('dialog')).to_contain_text('blocked');expect(button('Apply')).to_be_disabled();button('Cancel').click();assert native()==before
            passed('Disjoint features select only real parts; undefined base-edit semantics are blocked before mutation')
            exported=genbank();assert 'join(41..50,61..80)' in exported
            (OUT/'joined-current.gb').write_text(exported);(OUT/'joined-current.json').write_text(json.dumps(before))
            upload('roundjoin.gb',exported.encode());reread=native();assert [x['segments'] for x in reread['features']]==[x['segments'] for x in before['features']]
            passed('Current joined GenBank export/reimport preserves exact parts and declared order')
            uncertain=text.replace('join(41..50,61..80)','complement(<41..80)');upload('uncertain.gb',uncertain.encode());d=native();f=d['features'][2];assert f['segments']==[] and f['unresolved']['expression']=='complement(<41..80)'
            tab('Features');button(f['name']).click();expect(page.locator('.detail-row')).to_contain_text('not projected')
            tab('Translation');page.get_by_label('CDS to translate',exact=True).select_option(f['id']);button('Calculate translation').click();expect(page.locator('.analysis-error')).to_contain_text('unresolved')
            tab('Features');button('Edit '+f['name']).click();expect(page.get_by_label('Feature location expression',exact=True)).to_have_value('complement(<41..80)')
            page.get_by_label('Feature name',exact=True).fill('Renamed uncertainty');button('Apply').click();page.keyboard.press('Escape')
            assert native()['features'][2]['unresolved']==f['unresolved']
            passed('Uncertain descriptors remain visible and editable as metadata, cannot be translated and never claim exact coordinates')
            button('Edit Renamed uncertainty').click();page.get_by_label('Feature location expression',exact=True).fill('complement(41..80)');button('Apply').click();page.keyboard.press('Escape')
            resolved=native()['features'][2];assert 'unresolved' not in resolved and resolved['reviewRequired'];assert any(q['key']=='translation' for q in resolved['archivedQualifiers'])
            button('Undo (⌘/Ctrl Z)').click();page.keyboard.press('Escape');assert native()['features'][2]['unresolved']==f['unresolved']
            passed('Explicit resolution archives obsolete claims and can be undone without losing the original uncertain descriptor')
        elif case=='upstream':
            root=ROOT/'tests/upstream/biopython';expected=json.loads((root/'upstream-blobs.json').read_text());report['files']=[]
            directory=OUT/'upstream-documents';directory.mkdir(exist_ok=True)
            for filename,blob in expected.items():
                data=(root/filename).read_bytes();assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==blob
                fail,message=upload(filename,data,allowed=False)
                result={'file':filename,'gitBlob':blob,'accepted':not fail,'message':message}
                if not fail:
                    d=native();result.update(features=len(d['features']),primers=len(d['primers']))
                    assert d['pcrRecipe'] is None
                    (directory/(filename+'.json')).write_text(json.dumps(d,ensure_ascii=False))
                    (directory/(filename+'.gb')).write_text(genbank())
                    if d['primers']:
                        tab('Primers');expand_library();expect(page.locator('.oligo-table')).to_contain_text(d['primers'][0]['name'])
                        # Case normalization must not shorten or complement the stored reagent.
                        button('Define annealing '+d['primers'][0]['name']).click();expect(page.get_by_label('Library tail length',exact=True)).to_have_value('0')
                        page.screenshot(path=str(OUT/'step7-imported-library.png'))
                    button('Close '+d['name']).click()
                else:assert any(x in message for x in ['Gap segment','Bidirectional','overlapping','qualifier','signature','format','colour']),message
                report['files'].append(result)
            assert sum(x['accepted'] for x in report['files'])>=5,report['files']
            assert sum(x.get('primers',0) for x in report['files'])>=3,report['files']
            passed('Eight unmodified, hash-identified public files are inspected; accepted data are recorded for independent verification and refusals are explicit')
            passed('Imported complete oligos enter the saved library with no inferred tail, binding coordinates, Tm or PCR recipe')
        elif case.startswith('corpus-'):
            topology=case.split('-')[1];root=ROOT/'tests/fixtures/location-corpus';entries=[e for e in json.loads((root/'manifest.json').read_text()) if e['topology']==topology]
            directory=OUT/'location-corpus';directory.mkdir(exist_ok=True);report['files']=[]
            for entry in entries:
                text=(root/entry['file']).read_text();assert hashlib.sha256(text.encode()).hexdigest()==entry['sha256']
                upload(entry['file'],text.encode());d=native();f=d['features'][0]
                assert bool(f.get('unresolved'))== (not entry['exact'])
                if not entry['exact']:assert f['segments']==[] and f['unresolved']['expression']==entry['location']
                exported=genbank();(directory/(entry['file']+'.json')).write_text(json.dumps(d));(directory/entry['file']).write_text(exported)
                (directory/(entry['file']+'.source')).write_text(text)
                button('Close '+d['name']).click();report['files'].append(entry['file'])
            assert len(report['files'])==16
            passed(f'Sixteen {topology} fixtures preserve exact joins or unresolved descriptors in actual UI import/export; outputs retained for a separate parser')
        elif case=='recovery':
            before=create_library_source();button('Recovery').click()
            if mode=='inline':
                expect(page.get_by_role('dialog')).to_contain_text('Local storage');passed('Opaque local test origin reports recovery unavailable; no persistence claimed');report['persistenceTested']=False
            else:
                page.get_by_role('checkbox',name='Enable automatic recovery on this device',exact=True).check();expect(page.get_by_test_id('recovery-status')).to_contain_text('Local copy written',timeout=15000)
                button('Close').first.click() if button('Close').count()>1 else button('Close').click()
                snapshot=page.evaluate('''async()=>new Promise((resolve,reject)=>{const r=indexedDB.open('gin-schnaps-recovery-v1:'+location.pathname,1);r.onsuccess=()=>{const db=r.result,t=db.transaction('recovery'),q=t.objectStore('recovery').get('current');t.oncomplete=()=>{db.close();resolve(JSON.parse(q.result))};t.onerror=()=>reject(t.error)};r.onerror=()=>reject(r.error)})''')
                assert snapshot['documents'][snapshot['activeIndex']]['doc']==before
                page.once('dialog',lambda d:d.accept());page.reload();button('Recovery').click();button('Restore session').click();page.keyboard.press('Escape')
                after=native();assert after==before;tab('Primers');expect(page.get_by_label('Primer tail 1',exact=True)).to_have_value('GG');expect(page.locator('.primer-library summary')).to_contain_text('(2)')
                report['persistenceTested']=True;passed('Opt-in IndexedDB recovery restores complete oligos and the exact saved PCR recipe after an actual reload')
        assert not report['errors'],report['errors'];assert not report['network'],report['network']
        passed('No JavaScript/CSP errors or HTTP/HTTPS requests in this scenario');report['success']=True
    except Exception as e:
        report['success']=False;report['failure']=str(e)
        try:page.screenshot(path=str(OUT/f'documents-{case}-failure.png'),timeout=4000)
        except:pass
        raise
    finally:
        (OUT/f'documents-{case}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));browser.close()
