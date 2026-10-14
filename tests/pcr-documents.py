"""PCR-to-document workflows. CI uses file:// and actual WebCrypto.
An explicit inline local-test mode injects a hashlib-backed digest adapter when
this sandbox forbids all navigation. That mode is not a WebCrypto/installation test.
"""
from pathlib import Path
import hashlib, json, os, platform
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'test-results'; OUT.mkdir(exist_ok=True)
mode=os.environ.get('GIN_SCHNAPS_TEST_MODE','file')
report={'mode':mode,'success':False,'checks':[],'errors':[],'network':[], 'digestProvider':'browser WebCrypto' if mode=='file' else 'explicit Python hashlib test adapter'}
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
    def dismiss():
        if button('Close message').count():button('Close message').click()
    def mark(name):report['checks'].append(name);print('PASS',name,flush=True)
    def native():
        with page.expect_download() as d:button('Export native format (⌘/Ctrl S)').click()
        value=json.loads(Path(d.value.path()).read_text());dismiss();return value
    def upload(doc):
        page.get_by_test_id('file-input').set_input_files({'name':doc['name']+'.sg.json','mimeType':'application/json','buffer':json.dumps(doc).encode()});expect(page.get_by_role('tab',name=doc['name'],exact=True)).to_be_visible();dismiss()
    def tab(name):page.get_by_role('tab',name=name,exact=True).click()
    def start():
        tab('Primers');button('Simulate exact PCR').click();expect(button('Create document from PCR product 1')).to_be_visible()
    try:
        if mode=='inline':
            page.expose_function('__testDigest',lambda data:list(hashlib.sha256(bytes(data)).digest()))
            page.evaluate("Object.defineProperty(crypto,'subtle',{value:{digest:async(name,data)=>{if(name!=='SHA-256')throw Error('Unexpected digest');return Uint8Array.from(await window.__testDigest(Array.from(data))).buffer}}})")
            page.set_content((ROOT/'dist/index.html').read_text(),wait_until='domcontentloaded')
        else:page.goto((ROOT/'dist/index.html').as_uri())
        expect(page.get_by_test_id('map-view')).to_be_visible()
        source=json.loads((ROOT/'tests/fixtures/pcr-product-demo.sg.json').read_text());upload(source);before=native()
        start();button('Create document from PCR product 1').click()
        dialog=page.get_by_role('dialog',name='Create PCR document',exact=True)
        expect(dialog).to_contain_text('210 bp');expect(dialog).to_contain_text('1 clipped');expect(dialog).to_contain_text('1 outside')
        bounds=dialog.bounding_box();assert bounds['x']>=0 and bounds['y']>=0 and bounds['y']+bounds['height']<=641
        page.get_by_label('PCR document name',exact=True).fill('Created_PCR')
        page.screenshot(path=str(OUT/'pcr-product-preview-1024.png'))
        button('Cancel').click();assert native()==before
        mark('Compact preview reports retained/clipped/outside features; Cancel preserves the exact source')
        button('Create document from PCR product 1').click();page.get_by_label('PCR document name',exact=True).fill('Created_PCR');button('Create document').click()
        expect(page.get_by_role('tab',name='Created_PCR',exact=True)).to_be_visible();dismiss()
        product=native();assert product['schemaVersion']==7 and len(product['sequence'])==210
        assert product['creation']['source']['sequence']==source['sequence'] and product['pcrRecipe'] is None and len(product['primers'])==2
        assert product['creation']['productSha256']==hashlib.sha256(product['sequence'].encode()).hexdigest()
        mark('Creation opens an independent linear schema-7 document with exact product, used oligos and immutable inputs')
        button('Export current document as GenBank').click()
        page.locator('.export-accept input[type="checkbox"]').check()
        with page.expect_download() as d:button('Download GenBank').click()
        (OUT/'pcr-created-product.gb').write_bytes(Path(d.value.path()).read_bytes());dismiss()
        from Bio import SeqIO, __version__ as bio_version
        from Bio.Seq import Seq
        independent=SeqIO.read(OUT/'pcr-created-product.gb','genbank')
        assert str(independent.seq)==product['sequence'] and independent.annotations['topology']=='linear'
        assert len(independent.features)==len(product['features'])
        for actual,expected in zip(independent.features,product['features']):
            bases=''.join(product['sequence'][part['start']:part['end']] for part in expected['segments'])
            if expected['strand']==-1:bases=str(Seq(bases).reverse_complement())
            assert str(actual.extract(independent.seq))==bases
        report['independentReader']=bio_version
        mark('Biopython independently reads the actual exported GenBank product and agrees on every feature extraction')

        tab('PCR_template');assert native()==before;tab('Created_PCR');tab('History')
        expect(page.get_by_role('region',name='PCR creation record')).to_contain_text('Current sequence and topology match')
        button('Verify sequence hashes').click();expect(page.get_by_role('region',name='PCR creation record')).to_contain_text('hashes match')
        with page.expect_download() as d:button('Export creation record').click()
        record=json.loads(Path(d.value.path()).read_text());assert record['creation']==product['creation'];dismiss()
        page.screenshot(path=str(OUT/'pcr-product-provenance-1024.png'))
        mark('Source remains unchanged; History displays and exports provenance and verifies the stored sequence hashes')
        button('Confirm file received').click() if button('Confirm file received').count() else None
        # A saved copy reopens with the full record, not only an explanatory note.
        reopened={**product,'name':'Reopened_PCR'};upload(reopened);assert native()==reopened
        tab('History');expect(page.get_by_role('region',name='PCR creation record')).to_contain_text('Current sequence and topology match')
        mark('Native export and reopen preserve the creation snapshot and feature-transfer report exactly')
        button('Reverse complement (⌘/Ctrl R)').click() if button('Reverse complement (⌘/Ctrl R)').count() else None
        if page.get_by_role('dialog').count():button('Cancel').click()
        # Toggle through the regular transformation dialog; never mutate the test app state directly.
        button('Reverse complement…').click() if button('Reverse complement…').count() else button('Reverse-complement molecule').click()
        button('Apply').click();dismiss();tab('History')
        expect(page.get_by_role('region',name='PCR creation record')).to_contain_text('differs from the creation product')
        assert native()['creation']==product['creation']
        button('Undo (⌘/Ctrl Z)').click();tab('History');expect(page.get_by_role('region',name='PCR creation record')).to_contain_text('Current sequence and topology match')
        mark('Editing marks the original creation as historical; Undo restores sequence without rewriting the record')
        tab('PCR_template');start();button('Create document from PCR product 1').click();page.get_by_label('PCR document name',exact=True).fill('No_features')
        page.get_by_label('Transfer exact parental features',exact=True).uncheck();page.get_by_label('Annotate full primer-derived regions',exact=True).uncheck();button('Create document').click();dismiss()
        assert native()['features']==[]
        mark('Feature-free creation is an explicit choice, never an implicit loss')
        uncertain={**source,'name':'Unresolved_source','features':[{'id':'u','name':'Uncertain','type':'misc_feature','strand':1,'color':'#5481AF','segments':[], 'unresolved':{'expression':'<10..50','reason':'Uncertain start'},'qualifiers':[],'archivedQualifiers':[],'reviewRequired':False}]}
        upload(uncertain);start();button('Create document from PCR product 1').click();expect(button('Create document')).to_be_disabled()
        page.get_by_label('Exclude the 1 unresolved feature(s) listed below',exact=True).check();expect(button('Create document')).to_be_enabled();button('Cancel').click()
        mark('Unresolved feature omissions require explicit consent before creation')
        tab('PCR_template');start();button('Create document from PCR product 1').click()
        count=page.get_by_role('tablist',name='Open documents').get_by_role('tab').count()
        page.evaluate("() => {window.__oldDigest=crypto.subtle.digest.bind(crypto.subtle);crypto.subtle.digest=(...args)=>new Promise(r=>setTimeout(r,1200)).then(()=>window.__oldDigest(...args));}")
        button('Create document').click();expect(button('Preparing…')).to_be_visible();button('Cancel').click()
        page.wait_for_timeout(1500)
        assert page.get_by_role('tablist',name='Open documents').get_by_role('tab').count()==count
        page.evaluate('crypto.subtle.digest=window.__oldDigest;delete window.__oldDigest')
        mark('Cancelling while hashes are pending cannot open a late product document')

        # Input edits invalidate result rows and therefore the creation action.
        page.get_by_label('Primer name 1',exact=True).fill('Changed draft');expect(button('Create document from PCR product 1')).to_have_count(0)
        mark('Changed PCR input removes obsolete result-to-document actions')
        assert not report['errors'],report['errors'];assert not report['network'],report['network']
        report['success']=True
        (OUT/'pcr-created-document.json').write_text(json.dumps(product,indent=2))
    except Exception as error:
        report['failure']=str(error)
        page.screenshot(path=str(OUT/'pcr-documents-failure.png'))
        raise
    finally:
        (OUT/'pcr-documents-report.json').write_text(json.dumps(report,indent=2));browser.close()
