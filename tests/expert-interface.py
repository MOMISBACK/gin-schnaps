"""Expert UI: concise default copy, actionable warnings and optional explanations.
File navigation is used in CI. GIN_SCHNAPS_TEST_MODE=inline records the local fallback.
An optional baseline HTML produces before/after text counts; it is never a test oracle.
"""
from pathlib import Path
import json, os, re
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results'; OUT.mkdir(exist_ok=True)
mode=os.environ.get('GIN_SCHNAPS_TEST_MODE','file')
report={'success':False,'mode':mode,'checks':[],'errors':[],'network':[],'measurements':{}}
fixture=json.loads((ROOT/'tests/fixtures/primer-library-demo.sg.json').read_text())
def rc(s):return s.translate(str.maketrans('ACGT','TGCA'))[::-1]

with sync_playwright() as p:
    opts={'headless':True}
    if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
    browser=p.chromium.launch(**opts)
    def load(path, width=1280):
        page=browser.new_page(viewport={'width':width,'height':800 if width==1280 else 640},accept_downloads=True)
        page.set_default_timeout(10000)
        page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.on('request',lambda r:report['network'].append(r.url) if r.url.startswith(('http:','https:')) else None)
        if mode=='inline':page.set_content(path.read_text(),wait_until='domcontentloaded')
        else:page.goto(path.as_uri())
        expect(page.get_by_test_id('map-view')).to_be_visible()
        return page
    def upload(page,doc):
        page.get_by_test_id('file-input').set_input_files({'name':'expert.sg.json','mimeType':'application/json','buffer':json.dumps(doc).encode()})
        expect(page.get_by_role('tab',name=doc['name'],exact=True)).to_be_visible()
        page.keyboard.press('Escape')
    def text_count(page, selector):
        # Range rectangles exclude content of closed <details> and CSS-hidden nodes.
        return page.locator(selector).evaluate("""el => {
          const texts=[]; const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
          let n; while(n=walker.nextNode()){
            if(!n.textContent.trim()) continue;
            const parent=n.parentElement;
            if(parent?.closest('script,style,textarea,input,pre,code')) continue;
            if(parent?.closest('details:not([open])') && !parent.closest('summary')) continue;
            const r=document.createRange();r.selectNodeContents(n);
            if([...r.getClientRects()].some(x=>x.width>0&&x.height>0)) texts.push(n.textContent.trim());
          }
          return texts.join(' ').split(/\\s+/).filter(Boolean).length;
        }""")
    def mark(s):report['checks'].append(s);print('PASS',s,flush=True)
    def snapshot(page, path):
        page.screenshot(path=str(OUT/path))
    try:
        baseline=os.environ.get('GIN_SCHNAPS_BASELINE_HTML')
        if baseline:
            old=load(Path(baseline));upload(old,fixture)
            old.get_by_role('tab',name='Primers',exact=True).click()
            report['measurements']['pcrBeforeWords']=text_count(old,'.analysis-panel')
            snapshot(old,'expert-pcr-before.png')
            old.close()
        page=load(ROOT/'dist/index.html');upload(page,fixture)
        expect(page.get_by_text('Prototype · step 8',exact=True)).to_have_count(0)
        expect(page.get_by_role('button',name='Help',exact=True)).to_be_visible()
        mark('default workbench removes milestone text and offers optional help')
        page.get_by_role('tab',name='Primers',exact=True).click()
        expect(page.get_by_role('heading',name='PCR',exact=True)).to_be_visible()
        expect(page.locator('.analysis-panel .context-help[open]')).to_have_count(0)
        report['measurements']['pcrAfterWords']=text_count(page,'.analysis-panel')
        snapshot(page,'expert-pcr-after.png')
        mark('PCR keeps input parameters visible with explanations collapsed')
        summary=page.locator('.context-help > summary').filter(has_text='PCR limits')
        summary.focus();summary.press('Enter')
        expect(page.locator('.context-help[open]')).to_contain_text('No Tm')
        summary.press('Enter')
        mark('method details are keyboard accessible and closed by default')

        # Oligo names and notes are user data, never targets of the text cleanup.
        page.locator('.primer-library > summary').click()
        for oligo in fixture['primers']:
            expect(page.locator('.oligo-table')).to_contain_text(oligo['name'])
        mark('existing oligo names and sequences remain unchanged')
        # The .dna provenance is intentionally a display label, not a schema rewrite.
        imported={**fixture,'name':'Imported provenance check',
                  'primers':[{**x,'provenance':'snapgene'} for x in fixture['primers']]}
        upload(page,imported);page.get_by_role('tab',name='Primers',exact=True).click()
        page.locator('.primer-library > summary').click()
        expect(page.locator('.oligo-table')).to_contain_text('.dna import')
        assert 'snapgene' not in page.locator('.oligo-table').inner_text().lower()
        mark('legacy provenance identifiers are not displayed as product branding')
        # Capture an actual export to check that display labels do not rewrite user data.
        with page.expect_download() as download:
            page.get_by_role('button',name='Export native format (⌘/Ctrl S)',exact=True).click()
        native=json.loads(Path(download.value.path()).read_text())
        assert native['primers']==imported['primers']
        page.keyboard.press('Escape')
        mark('native export retains full user oligos and wire provenance unchanged')

        # Check an actionable, input-specific warning is NOT collapsed as method prose.
        page.locator('.primer-library > summary').click()
        page.get_by_label('Primer annealing 1',exact=True).fill(fixture['sequence'][:12])
        page.get_by_label('Primer annealing 2',exact=True).fill(rc(fixture['sequence'][-12:]))
        page.get_by_label('Primer tail 1',exact=True).fill('')
        page.get_by_label('Primer tail 2',exact=True).fill('')
        page.get_by_role('button',name='Simulate exact PCR',exact=True).click()
        expect(page.get_by_test_id('pcr-results')).to_be_visible()
        expect(page.get_by_test_id('pcr-results').locator('.analysis-notes')).to_contain_text('short (<15 bases)')
        expect(page.get_by_test_id('pcr-results').locator('.context-help[open]')).to_have_count(0)
        mark('short-annealing warning remains visible while generic model notes are optional')
        page.get_by_label('Maximum PCR length',exact=True).fill('999')
        expect(page.get_by_test_id('analysis-stale')).to_be_visible()
        expect(page.get_by_test_id('analysis-stale')).to_contain_text('Results outdated')
        mark('changing parameters visibly invalidates results')
        page.get_by_role('button',name='Close Imported provenance check',exact=True).click()
        expect(page.get_by_role('dialog',name='Unsaved PCR draft',exact=True)).to_be_visible()
        expect(page.get_by_role('button',name='Discard draft and close',exact=True)).to_be_visible()
        page.get_by_role('button',name='Keep working',exact=True).click()
        mark('shorter close dialog still protects unsaved PCR drafts')

        page.get_by_role('button',name='Help',exact=True).click()
        dialog=page.get_by_role('dialog',name='Gin Schnaps help',exact=True)
        expect(dialog).to_be_visible()
        assert json.loads((ROOT/'package.json').read_text())['version'] in dialog.inner_text()
        dialog.locator('summary').filter(has_text='Privacy & licenses').click()
        expect(dialog.get_by_text('Own code:',exact=False)).to_be_visible()
        page.keyboard.press('Control+n')
        expect(page.get_by_role('dialog',name='New DNA document',exact=True)).to_have_count(0)
        page.keyboard.press('Escape')
        expect(dialog).to_have_count(0)
        mark('help retains license/privacy information and blocks background shortcuts')

        page.get_by_role('button',name='Export current document as GenBank',exact=True).click()
        export=page.get_by_role('dialog',name='Export GenBank',exact=True)
        expect(export.get_by_role('button',name='Download GenBank',exact=True)).to_be_disabled()
        expect(export.locator('ul')).not_to_be_empty()
        export.get_by_role('checkbox',name='Export with these limitations (.sg.json retains all data).',exact=True).check()
        expect(export.get_by_role('button',name='Download GenBank',exact=True)).to_be_enabled()
        export.get_by_role('button',name='Cancel',exact=True).click()
        mark('conversion losses and explicit export acceptance remain visible')
        page.close()

        page=load(ROOT/'dist/index.html',1024);upload(page,fixture)
        page.get_by_role('tab',name='Primers',exact=True).click()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        snapshot(page,'expert-pcr-1024.png')
        page.get_by_role('button',name='Paste DNA (⌘/Ctrl V)',exact=True).click()
        paste=page.get_by_role('dialog',name='Paste DNA',exact=True)
        page.get_by_label('DNA to paste',exact=True).fill('ACGT')
        expect(paste.get_by_role('button',name='Apply paste',exact=True)).to_be_visible()
        expect(paste.locator('.context-help[open]')).to_have_count(0)
        snapshot(page,'expert-paste-1024.png')
        page.keyboard.press('Escape')
        mark('compact PCR and paste dialog fit 1024x640 with visible actions')
        page.close()
        assert not report['errors'],report['errors']
        assert not report['network'],report['network']
        mark('no runtime errors or HTTP requests during tested UI workflows')
        report['success']=True
    finally:
        (OUT/'expert-interface.json').write_text(json.dumps(report,indent=2))
        browser.close()
