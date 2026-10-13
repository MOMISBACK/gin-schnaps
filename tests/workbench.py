"""English step-6 UI and scientific-document workflow regression tests.
CI launches the compiled file:// application. Inline mode is a separate local fallback.
All documents below are synthetic; non-English user data is intentionally preserved.
"""
from pathlib import Path
import json, os, subprocess, sys, struct, xml.etree.ElementTree as ET
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'test-results'; OUT.mkdir(exist_ok=True)
mode=os.environ.get('GIN_SCHNAPS_TEST_MODE','file'); case=os.environ.get('GIN_SCHNAPS_WORKBENCH_CASE','all')
CASES=['documents','search','tracks','graphics','compact']
if case=='all':
    reports=[]
    for scenario in CASES:
        subprocess.run([sys.executable,__file__],env={**os.environ,'GIN_SCHNAPS_WORKBENCH_CASE':scenario},check=True,timeout=180)
        reports.append(json.loads((OUT/f'workbench-{scenario}.json').read_text()))
    (OUT/'workbench-report.json').write_text(json.dumps({'success':True,'mode':mode,'checks':sum(len(r['checks']) for r in reports),'scenarios':reports},indent=2,ensure_ascii=False));sys.exit(0)
if case not in CASES: raise ValueError('Unknown scenario')
report={'case':case,'mode':mode,'checks':[],'errors':[],'network':[]}
def passed(message):
    report['checks'].append(message); print('PASS',message,flush=True)
def rc(s):return s.translate(str.maketrans('ACGTRYSWKMBDHVN','TGCAYRSWMKVHDBN'))[::-1]
def bio(doc,f):
    s=''.join(doc['sequence'][p['start']:p['end']] for p in f['segments']);return rc(s) if f['strand']==-1 else s
with sync_playwright() as p:
    opt={'headless':True}
    if os.environ.get('CHROMIUM_PATH'):opt['executable_path']=os.environ['CHROMIUM_PATH']
    browser=p.chromium.launch(**opt)
    context=browser.new_context(accept_downloads=True,viewport={'width':1024 if case=='compact' else 1280,'height':640 if case=='compact' else 800})
    page=context.new_page();page.set_default_timeout(12000);page.set_default_navigation_timeout(45000)
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
    page.on('request',lambda r:report['network'].append(r.url) if r.url.startswith(('http:','https:')) else None)
    def button(name):
        if name in ['New document from pasted DNA (⌘/Ctrl N)','Reverse-complement the entire molecule','Copy selection as reverse complement (⌘/Ctrl ⇧ C)','Find DNA motif (⌘/Ctrl F)']:return page.get_by_title(name,exact=True)
        return page.get_by_role('button',name=name,exact=True)
    def load():
        if mode=='inline':page.set_content((ROOT/'dist/index.html').read_text(),wait_until='domcontentloaded')
        else:page.goto((ROOT/'dist/index.html').as_uri())
        expect(page.get_by_role('tab',name='Map',exact=True)).to_be_visible()
    def native():
        with page.expect_download() as ev:button('Export native format (⌘/Ctrl S)').click()
        doc=json.loads(Path(ev.value.path()).read_text());page.keyboard.press('Escape');return doc
    def upload(name,content):
        if isinstance(content,dict):content=json.dumps(content,ensure_ascii=False).encode()
        page.get_by_test_id('file-input').set_input_files({'name':name,'mimeType':'application/octet-stream','buffer':content})
        expect(page.locator('.notification')).to_be_visible();page.keyboard.press('Escape')
    def select(start,end):
        page.get_by_label('Selection start',exact=True).fill(str(start));page.get_by_label('Selection end',exact=True).fill(str(end));button('Select').click()
    def new(name,dna,topology='circular',desc=''):
        button('New document from pasted DNA (⌘/Ctrl N)').click()
        page.get_by_label('Document name',exact=True).fill(name);page.get_by_label('New DNA sequence',exact=True).fill(dna)
        page.get_by_label('New document topology',exact=True).select_option(topology);page.get_by_label('Document description',exact=True).fill(desc)
        page.get_by_role('dialog').get_by_role('button',name='Create document',exact=True).click()
        expect(page.get_by_role('tab',name=name,exact=True)).to_have_attribute('aria-selected','true');page.keyboard.press('Escape')
    def undo():button('Undo (⌘/Ctrl Z)').click();page.keyboard.press('Escape')
    try:
        load();assert page.locator('html').get_attribute('lang')=='en'
        if case=='documents':
            new('Étude contrôlée',' atgc aaa ttt ccc ggg atg cta\n',desc='Note française à préserver')
            created=native();assert created['name']=='Étude contrôlée' and created['description']=='Note française à préserver' and created['sequence']=='ATGCAAATTTCCCGGGATGCTA'
            expect(page.locator('.readonly-badge')).to_contain_text('Modified')
            passed('English new-document dialog normalizes only DNA case/whitespace; French user text and unsaved state are preserved')
            select(19,3)
            button('Properties').click();page.get_by_label('Document name',exact=True).fill('Renamed');page.get_by_label('Document description',exact=True).fill('Changed description')
            page.get_by_role('dialog').get_by_role('button',name='Apply',exact=True).click();page.keyboard.press('Escape')
            renamed=native();assert renamed['sequence']==created['sequence'];assert renamed['name']=='Renamed'
            undo();assert native()==created
            button('Redo (⌘/Ctrl ⇧ Z)').click();assert native()==renamed
            expect(page.get_by_label('Selection start',exact=True)).to_have_value('19')
            passed('Properties, undo and redo preserve exact documents and the circular selection')
            button('Duplicate').click();page.get_by_label('Document name',exact=True).fill('Independent copy');button('Create document').click();page.keyboard.press('Escape')
            copy=native();assert copy['id']!=renamed['id'] and copy['sequence']==renamed['sequence']
            expect(button('Undo (⌘/Ctrl Z)')).to_be_disabled();expect(page.locator('.readonly-badge')).to_contain_text('Modified')
            page.get_by_role('tab',name='Renamed',exact=True).click();assert native()==renamed
            passed('Duplication creates an independent dirty document without changing the source or inheriting its undo stack')
            upload('synthetic-120.gb',(ROOT/'tests/fixtures/synthetic-120.gb').read_bytes());before=native();select(101,20)
            button('Extract…').click();page.get_by_label('Document name',exact=True).fill('Extracted origin')
            expect(page.get_by_label('Document operation preview')).to_contain_text('40 bp');button('Create document').click();page.keyboard.press('Escape')
            extract=native();assert extract['sequence']==before['sequence'][100:]+before['sequence'][:20] and extract['topology']=='linear'
            origin=next(f for f in extract['features'] if f['name']=='Origin feature');assert origin['segments']==[{'start':0,'end':40}] and origin['reviewRequired']
            assert not any(q['key']=='translation' for q in origin['qualifiers']);assert any(q['key']=='translation' for q in origin['archivedQualifiers'])
            page.get_by_role('tab',name='Synthetic_120',exact=True).click();assert native()==before
            passed('Origin-spanning extraction yields the expected linear DNA and clips/flags features without changing source evidence')
            button('Reverse-complement the entire molecule').click();button('Apply').click();page.keyboard.press('Escape')
            flipped=native();assert flipped['sequence']==rc(before['sequence'])
            for f,g in zip(before['features'],flipped['features']):
                assert g['strand']==-f['strand']
                if f['strand']:assert bio(before,f)==bio(flipped,g)
            undo();assert native()==before
            button('Set origin…').click();page.get_by_label('New origin',exact=True).fill('37');button('Apply').click();page.keyboard.press('Escape')
            rotated=native();assert rotated['sequence']==before['sequence'][36:]+before['sequence'][:36]
            for f,g in zip(before['features'],rotated['features']):assert bio(before,f)==bio(rotated,g)
            undo();assert native()==before
            passed('Whole-molecule reverse complement and origin rotation transform annotations correctly and undo exactly')
            # Probe the browser clipboard API at its boundary, without granting read access.
            page.evaluate("() => {window.__copied=null; if(navigator.clipboard && window.isSecureContext) Object.defineProperty(navigator.clipboard,'writeText',{value:async text=>{window.__copied=text},configurable:true});else document.execCommand=()=>{window.__copied=document.querySelector('.clipboard-helper')?.value;return true};}")
            select(110,10);button('Copy selection as reverse complement (⌘/Ctrl ⇧ C)').click()
            assert page.evaluate('window.__copied')==rc(before['sequence'][109:]+before['sequence'][:10]);page.keyboard.press('Escape');assert native()==before
            passed('Copy reverse complement sends the selected origin-spanning DNA in the requested orientation without editing')
        elif case=='search':
            new('Motif test','TTTACGNNACGAAA')
            button('Find DNA motif (⌘/Ctrl F)').click();page.get_by_label('DNA motif',exact=True).fill('ACG');page.get_by_label('Search strands',exact=True).select_option('forward')
            page.get_by_label('Match certainty',exact=True).select_option('definite');page.get_by_label('Find DNA motif',exact=True).get_by_role('button',name='Find',exact=True).click()
            expect(page.get_by_test_id('search-count')).to_have_text('1 of 2');expect(page.get_by_label('Selection start',exact=True)).to_have_value('4')
            button('Next match').click();expect(page.get_by_label('Selection start',exact=True)).to_have_value('9');button('Previous match').click();expect(page.get_by_label('Selection start',exact=True)).to_have_value('4')
            passed('Worker motif search navigates all definite overlapping results in reference coordinates')
            page.get_by_label('DNA motif',exact=True).fill('AATT')
            expect(page.get_by_test_id('search-count')).to_have_count(0)
            page.get_by_label('Find DNA motif',exact=True).get_by_role('button',name='Find',exact=True).click()
            expect(page.get_by_test_id('search-count')).to_have_text('1 of 1');expect(page.get_by_label('Selection start',exact=True)).to_have_value('13');expect(page.get_by_label('Selection end',exact=True)).to_have_value('2')
            expect(page.get_by_test_id('selection-status')).to_contain_text('crosses origin')
            passed('Changing query invalidates old hits; origin-spanning motif is found without duplicating the template')
            page.get_by_label('DNA motif',exact=True).fill('ACG');page.get_by_label('Search strands',exact=True).select_option('reverse');page.get_by_label('Match certainty',exact=True).select_option('all')
            page.get_by_label('Find DNA motif',exact=True).get_by_role('button',name='Find',exact=True).click()
            expect(page.locator('.search-summary')).to_contain_text('Possible');expect(page.locator('.search-summary')).to_contain_text('strand −')
            page.get_by_label('Match certainty',exact=True).select_option('definite');page.get_by_label('Find DNA motif',exact=True).get_by_role('button',name='Find',exact=True).click();expect(page.get_by_test_id('search-count')).to_have_text('0 matches')
            passed('Reverse-strand possible matches over ambiguity codes are distinguished from definite hits')
            button('Close search').click();expect(page.locator('.motif-search')).to_have_count(0);page.keyboard.press('Control+f');expect(page.locator('.motif-search')).to_have_count(1);expect(page.get_by_label('DNA motif',exact=True)).to_be_visible()
            passed('Find keyboard shortcut opens the application search rather than the browser search')
        elif case=='tracks':
            upload('synthetic-120.gb',(ROOT/'tests/fixtures/synthetic-120.gb').read_bytes());before=native()
            page.get_by_role('tab',name='Sequence',exact=True).click();page.get_by_label('Bases per line',exact=True).select_option('60')
            pieces=page.locator('.feature-track');expect(pieces.first).to_be_visible()
            for piece in pieces.all():
                data=piece.evaluate('''n=>{const row=n.closest('.sequence-row'),a=Number(n.dataset.featureStart),b=Number(n.dataset.featureEnd);const first=row.querySelector('.base[data-pos="'+a+'"]'),last=row.querySelector('.base[data-pos="'+(b-1)+'"]');const r=n.getBoundingClientRect(),f=first.getBoundingClientRect(),l=last.getBoundingClientRect();return [r.x,f.x,r.x+r.width,l.x+l.width]}''')
                assert abs(data[0]-data[1])<1 and abs(data[2]-data[3])<1,{'bounds':data,'element':piece.evaluate('n=>({html:n.outerHTML,computedWidth:getComputedStyle(n).width,minWidth:getComputedStyle(n).minWidth,base:n.closest(".sequence-row").querySelector(".base").outerHTML,measure:document.querySelector(".character-measure").getBoundingClientRect().width})')}
            passed('Feature tracks align with actual first/last base pixels across line wraps and ten-base separators')
            piece=page.get_by_role('button',name='Select feature Origin feature',exact=True).first;piece.dblclick()
            expect(page.get_by_role('dialog')).to_be_visible();page.get_by_label('Feature name',exact=True).fill('Track edit')
            button('Apply').click();page.keyboard.press('Escape');expect(page.get_by_role('button',name='Select feature Track edit',exact=True).first).to_be_visible()
            undo();assert native()==before
            passed('Double-clicking a proportional track edits the real feature, with exact undo')
            page.get_by_label('Translation track',exact=True).select_option('+1')
            expect(page.locator('.translation-track button[data-codon-start="0"]')).to_have_text('T')
            page.locator('.translation-track button[data-codon-start="0"]').click();expect(page.get_by_label('Selection start',exact=True)).to_have_value('1');expect(page.get_by_label('Selection end',exact=True)).to_have_value('3')
            page.get_by_label('Translation track',exact=True).select_option('-1')
            page.get_by_role('slider',name='Navigate sequence',exact=True).press('End')
            codon=page.locator('.translation-track button[data-codon-start="117"]');expect(codon).to_have_text('T');codon.click()
            expect(page.get_by_label('Selection start',exact=True)).to_have_value('118');expect(page.get_by_label('Selection end',exact=True)).to_have_value('120')
            passed('Worker-backed translation tracks display and select the correct triplet in both reference orientations')
            page.get_by_role('slider',name='Navigate sequence',exact=True).press('Home');page.get_by_label('Translation track',exact=True).select_option('+1')
            page.screenshot(path=str(OUT/'step6-sequence-tracks.png'))
            crowded={**before,'id':'crowded','name':'Overlapping features','features':[{**before['features'][0],'id':str(i),'name':'Feature '+str(i),'segments':[{'start':0,'end':30}]} for i in range(12)]}
            upload('crowded.sg.json',crowded);page.get_by_role('tab',name='Sequence',exact=True).click()
            overflow=page.locator('.track-overflow').first;expect(overflow).to_contain_text('4 overlapping segments not drawn');overflow.click()
            expect(page.get_by_role('tab',name='Features',exact=True)).to_have_attribute('aria-selected','true')
            passed('Dense tracks explicitly report hidden overlapping segments and link to all underlying features')
        elif case=='graphics':
            original=native();page.get_by_label('Map zoom',exact=True).select_option('1.5');assert native()==original
            button('Fit').click();expect(page.get_by_label('Map zoom',exact=True)).to_have_value('1');page.screenshot(path=str(OUT/'step6-map.png'))
            passed('Map zoom and fit do not modify DNA, topology or annotations')
            # Use document data containing XML-looking text; exports must remain data only.
            button('Properties').click();page.get_by_label('Document name',exact=True).fill('<script>window.x=1</script>');button('Apply').click();page.keyboard.press('Escape')
            with page.expect_download() as ev:button('Export SVG').click()
            text=Path(ev.value.path()).read_text();(OUT/'step6-map.svg').write_text(text)
            root=ET.fromstring(text);assert root.tag.endswith('svg');assert 'window.x=1' in ''.join(root.itertext())
            for element in root.iter():
                assert element.tag.rsplit('}',1)[-1] not in ['script','foreignObject','image','iframe','embed','object']
                for name in element.attrib:assert not name.lower().startswith('on') and not name.endswith('href')
            passed('SVG export is parseable self-contained vector XML; user labels stay text and contain no executable markup')
            with page.expect_download() as ev:button('Export PNG').click()
            png=Path(ev.value.path()).read_bytes();assert png[:8]==b'\x89PNG\r\n\x1a\n';w,h=struct.unpack('>II',png[16:24]);assert w>0 and h>0 and w*h<=32_000_000
            (OUT/'step6-map-export.png').write_bytes(png)
            passed('PNG export rasterizes the actual SVG locally and produces a valid bounded image')
        else:
            new('Compact','ATGAAAGCTTAA',desc='Original text')
            button('Properties').click();dialog=page.get_by_role('dialog');expect(dialog.get_by_role('button',name='Apply',exact=True)).to_be_in_viewport()
            page.get_by_label('Document description',exact=True).fill('Text kept while typing')
            page.get_by_label('Document description',exact=True).press('Control+n');expect(page.get_by_role('heading',name='Document properties',exact=True)).to_be_visible()
            dialog.get_by_role('button',name='Apply',exact=True).focus();page.keyboard.press('Tab');expect(button('Close without applying')).to_be_focused()
            page.screenshot(path=str(OUT/'step6-properties-1024.png'));button('Cancel').click()
            passed('At 1024×640 document dialogs fit, trap focus, and do not trigger global document shortcuts while editing text')
            page.get_by_role('tab',name='Sequence',exact=True).click();page.get_by_label('Translation track',exact=True).select_option('+1')
            expect(page.locator('.translation-track button').first).to_have_text('M')
            for tab in ['Translation','Enzymes','Primers','History','Features','Map']:
                page.get_by_role('tab',name=tab,exact=True).click()
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            button('Document information').click();assert page.locator('.view-panel').bounding_box()['width']>=719
            page.screenshot(path=str(OUT/'step6-compact.png'))
            passed('English panels remain navigable without window overflow on the compact viewport')
        assert not report['errors'],report['errors'];assert not report['network'],report['network'];report['success']=True
        passed('No JavaScript/CSP errors or external HTTP requests during this workflow')
    except Exception as e:
        report['success']=False;report['failure']=str(e)
        try:page.screenshot(path=str(OUT/f'workbench-{case}-failure.png'),timeout=5000)
        except Exception:pass
        raise
    finally:
        report['browser']=browser.version
        (OUT/f'workbench-{case}.json').write_text(json.dumps(report,indent=2,ensure_ascii=False));browser.close()
