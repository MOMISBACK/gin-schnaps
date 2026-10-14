"""Real DOM gestures and guarded direct editing; file:// in CI, explicit inline fallback locally."""
from pathlib import Path
import json, os, math
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
mode=os.environ.get('GIN_SCHNAPS_TEST_MODE','file')
report={'mode':mode,'success':False,'checks':[],'errors':[],'network':[]}
with sync_playwright() as p:
    opts={'headless':True}
    if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
    browser=p.chromium.launch(**opts)
    page=browser.new_page(accept_downloads=True,viewport={'width':1280,'height':800})
    page.set_default_timeout(10000)
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
    page.on('request',lambda r:report['network'].append(r.url) if r.url.startswith(('http:','https:')) else None)
    def button(name):return page.get_by_role('button',name=name,exact=True)
    def tab(name):page.get_by_role('tab',name=name,exact=True).click()
    def done(name):report['checks'].append(name);print('PASS',name,flush=True)
    def native():
        with page.expect_download() as event:button('Export native format (⌘/Ctrl S)').click()
        d=json.loads(Path(event.value.path()).read_text());page.keyboard.press('Escape');return d
    def upload(d):
        page.get_by_test_id('file-input').set_input_files({'name':'interactive.sg.json','mimeType':'application/json','buffer':json.dumps(d).encode()})
        expect(page.locator('.notification')).to_be_visible();assert page.get_by_role('alert').count()==0;page.keyboard.press('Escape')
    def choose(start,end):
        page.get_by_label('Selection start',exact=True).fill(str(start));page.get_by_label('Selection end',exact=True).fill(str(end));button('Select').click()
    def camera():
        nav=page.get_by_test_id('map-navigation')
        return {k:float(nav.get_attribute(a)) for k,a in [('zoom','data-zoom'),('x','data-pan-x'),('y','data-pan-y')]}
    def drag(button_name,dx,dy,space=False):
        nav=page.get_by_test_id('map-navigation');r=nav.bounding_box();x,y=r['x']+r['width']/2,r['y']+r['height']/2
        nav.focus();page.mouse.move(x,y)
        if space:page.keyboard.down('Space')
        before=camera();page.mouse.down(button=button_name);page.mouse.move(x+dx,y+dy,steps=6);page.mouse.up(button=button_name)
        if space:page.keyboard.up('Space')
        after=camera();assert abs(after['x']-before['x']-dx)<1 and abs(after['y']-before['y']-dy)<1,(before,after)
    try:
        if mode=='inline':page.set_content((ROOT/'dist/index.html').read_text(),wait_until='domcontentloaded')
        else:page.goto((ROOT/'dist/index.html').as_uri())
        expect(page.get_by_test_id('map-navigation')).to_be_visible()
        before=native();choose(4520,185);selection=page.get_by_test_id('selection-status').inner_text()
        nav=page.get_by_test_id('map-navigation');r=nav.bounding_box();x,y=r['x']+r['width']*.63,r['y']+r['height']*.4
        old=camera();page.mouse.move(x,y);page.mouse.wheel(0,-120)
        page.wait_for_function("Number(document.querySelector('[data-testid=\"map-navigation\"]').dataset.zoom)>1")
        new=camera();assert abs((x-r['x']-old['x'])/old['zoom']-(x-r['x']-new['x'])/new['zoom'])<1
        assert page.get_by_test_id('selection-status').inner_text()==selection
        done('Mouse wheel zoom anchors the content under the cursor, preserving the DNA selection')
        drag('middle',86,-31);assert page.get_by_test_id('selection-status').inner_text()==selection
        done('Middle-button pan moves the map without changing the selected bases')
        drag('left',-54,42,space=True);assert page.get_by_test_id('selection-status').inner_text()==selection
        done('Space plus left drag pans without making a biological selection')
        button('Pan map').click();drag('left',37,18);button('Pan map').click()
        done('Explicit hand tool provides the same pan gesture with a one-button mouse')
        nav.focus();page.keyboard.press('0');assert camera()=={'zoom':1.,'x':0.,'y':0.}
        page.get_by_label('Map zoom',exact=True).select_option('1.5');expect(nav).to_have_attribute('data-zoom','1.5')
        button('Fit').click();assert camera()=={'zoom':1.,'x':0.,'y':0.}
        done('Fit and keyboard 0 reset zoom and position; numerical zoom remains available')
        # Select a feature via actual OVE geometry after zoom/pan, not our feature table.
        page.get_by_label('Map zoom',exact=True).select_option('1.25');drag('middle',18,8)
        page.get_by_test_id('map-view').get_by_text('Region B',exact=True).click()
        expect(page.get_by_label('Selection start',exact=True)).to_have_value('661')
        expect(page.get_by_label('Selection end',exact=True)).to_have_value('1680')
        assert native()==before
        done('OVE feature hit testing still works after camera transforms; exported document is unchanged')
        # Full map export must not become a cropped viewport or acquire a camera transform.
        button('Fit').click()
        with page.expect_download() as event:button('Export SVG').click()
        svg_before=Path(event.value.path()).read_text();drag('middle',-750,300)
        with page.expect_download() as event:button('Export SVG').click()
        svg_after=Path(event.value.path()).read_text();assert svg_before==svg_after
        done('Panning does not crop or change the full-map SVG export')
        button('Fit').click();nav.focus()
        r=nav.bounding_box();page.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2);page.mouse.down(button='middle')
        page.mouse.move(r['x']+r['width']/2+12,r['y']+r['height']/2+8)
        held=camera();nav.dispatch_event('pointercancel',{'pointerId':1,'pointerType':'mouse','bubbles':True})
        page.mouse.move(r['x']+r['width']/2+45,r['y']+r['height']/2+30);page.mouse.up(button='middle')
        assert camera()==held;assert 'is-panning' not in nav.get_attribute('class')
        nav.focus();page.keyboard.down('Space');page.evaluate("window.dispatchEvent(new Event('blur'))");page.keyboard.up('Space')
        assert 'pan-ready' not in nav.get_attribute('class')
        done('Pointer cancellation and window blur release the pan gesture instead of leaving it stuck')
        button('Fit').click();nav.focus();page.keyboard.press('+');page.keyboard.press('ArrowRight');assert camera()['x']!=0
        page.set_viewport_size({'width':1024,'height':640});expect(nav).to_have_attribute('data-zoom','1')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(OUT/'map-navigation-1024.png'))
        done('Map controls remain usable in a compact window; resizing recenters safely')
        # A joined, unstranded feature to exercise core editing without fake CDS claims.
        d={**before,'id':'typed-synthetic','name':'Typed joined document','sequence':'ACGT'*8,'topology':'linear','history':[],'historyOmitted':0,'sourceArchive':None,'primers':[],'pcrRecipe':None}
        d['features']=[{**before['features'][0],'id':'joined','name':'Exact joined region','type':'misc_feature','strand':0,'segments':[{'start':2,'end':8},{'start':12,'end':20}],'qualifiers':[],'archivedQualifiers':[],'reviewRequired':False}]
        page.get_by_label('Map zoom',exact=True).select_option('2');upload(d);assert camera()=={'zoom':1.,'x':0.,'y':0.}
        tab('Sequence');start_doc=native();seq=page.get_by_test_id('sequence-view')
        seq.focus();page.keyboard.type('N');assert native()==start_doc
        done('Selection mode cannot silently type into DNA')
        button('Type DNA').click();expect(button('Type DNA')).to_have_attribute('aria-pressed','true')
        # Click the left side of base 5, i.e. boundary 5, then type into part 1.
        base=page.locator('.reference-line .base[data-pos="5"]');base.click(position={'x':1,'y':8});page.keyboard.type('N')
        changed=native();assert changed['sequence']==d['sequence'][:5]+'N'+d['sequence'][5:]
        assert changed['features'][0]['segments']==[{'start':2,'end':9},{'start':13,'end':21}]
        expect(page.get_by_test_id('dna-caret')).to_have_attribute('data-position','6')
        done('Direct typing inserts at an explicit reference-strand boundary and remaps joined parts')
        button('Paste DNA (⌘/Ctrl V)').click();expect(page.get_by_label('Paste start',exact=True)).to_have_value('7')
        page.get_by_label('DNA to paste',exact=True).fill('GG');button('Apply paste').click();page.keyboard.press('Escape')
        assert native()['sequence']==changed['sequence'][:6]+'GG'+changed['sequence'][6:]
        expect(page.get_by_test_id('dna-caret')).to_have_attribute('data-position','8')
        button('Undo (⌘/Ctrl Z)').click();assert native()==changed
        done('Paste uses the typing caret, then places the caret after the inserted DNA')
        button('Undo (⌘/Ctrl Z)').click();assert native()==start_doc
        expect(page.get_by_test_id('dna-caret')).to_have_attribute('data-position','5')
        button('Redo (⌘/Ctrl ⇧ Z)').click();assert native()==changed
        done('Undo and redo restore exact document and typing caret')
        # Invalid nucleotide must not alter DNA, including in a typing session.
        seq.focus();page.keyboard.type('U');expect(page.get_by_role('alert')).to_contain_text('IUPAC');page.keyboard.press('Escape')
        assert native()==changed
        # Escape on the sequence turns typing off; re-enable explicitly if so.
        if button('Type DNA').get_attribute('aria-pressed')!='true':button('Type DNA').click()
        seq.focus();page.keyboard.press('Backspace');assert native()['sequence']==d['sequence']
        done('Invalid letters are rejected and Backspace uses the same reversible edit command')
        # A shared selection made through the coordinate controls is replaced, not appended.
        choose(3,6);seq.focus();page.keyboard.type('R')
        replaced=native();assert replaced['sequence']==d['sequence'][:2]+'R'+d['sequence'][6:]
        done('Typing replaces exactly the shared selection, not the whole document or a stale caret')
        # Text fields keep regular text edits and application dialogs isolate DNA typing.
        button('Properties').click();page.get_by_label('Document name',exact=True).fill('ACGT in a text field');button('Cancel').click();assert native()==replaced
        done('Text-field and dialog keyboard input does not leak into nucleotide editing')
        seq.focus();page.keyboard.press('Control+a');page.keyboard.press('Delete');empty=native();assert empty['sequence']=='';assert not empty['features']
        expect(seq).to_be_visible();seq.focus();page.keyboard.type('ACGT',delay=20);assert native()['sequence']=='ACGT'
        done('Deleting the whole molecule produces an editable empty draft; sequential typing remains ordered')
        page.screenshot(path=str(OUT/'direct-dna-typing-1024.png'))
        # Origin-spanning replacement in typing mode and cross-document state isolation.
        circle={**start_doc,'id':'typed-circle','name':'Circular typing','topology':'circular'};upload(circle);tab('Sequence')
        expect(button('Type DNA')).to_have_attribute('aria-pressed','false');button('Type DNA').click();choose(30,3);seq.focus();page.keyboard.type('N')
        after=native();assert after['sequence']==circle['sequence'][3:29]+'N';assert after['topology']=='circular'
        done('Circular replacement uses explicit selected bases; typing state is separate for each document')
        tab('Split')
        expect(button('Type DNA')).to_have_attribute('aria-pressed','true');button('Fit').click();drag('middle',20,-20)
        assert native()==after
        done('Paired Sequence / Map keeps the same document while typing and panning independently')
        assert not report['errors'],report['errors'];assert not report['network'],report['network']
        done('Tested workflows produce no JavaScript/CSP errors or external network requests')
        report['success']=True
    except Exception as e:
        report['failure']=str(e)
        page.screenshot(path=str(OUT/'interactive-editing-failure.png'))
        raise
    finally:
        (OUT/'interactive-editing-report.json').write_text(json.dumps(report,indent=2))
        browser.close()
