"""Mouse-camera and direct-DNA regressions. Actual file launch in CI; explicit inline fallback only locally."""
from pathlib import Path
import json, os, sys, math, subprocess
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
mode=os.environ.get('GIN_SCHNAPS_TEST_MODE','file'); case=os.environ.get('GIN_MOUSE_CASE','all')
if case=='all':
    records=[]
    for c in ['camera','typing','compact']:
        subprocess.run([sys.executable,__file__],env={**os.environ,'GIN_MOUSE_CASE':c},check=True,timeout=100)
        records.append(json.loads((OUT/f'mouse-editing-{c}.json').read_text()))
    (OUT/'mouse-editing-report.json').write_text(json.dumps({'success':True,'mode':mode,'checks':sum(len(r['checks']) for r in records),'cases':records},indent=2));sys.exit(0)
report={'case':case,'mode':mode,'checks':[],'errors':[],'network':[]}
def passed(message):report['checks'].append(message);print('PASS',message,flush=True)
with sync_playwright() as p:
    options={'headless':True}
    if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
    browser=p.chromium.launch(**options);page=browser.new_page(accept_downloads=True,viewport={'width':1024 if case=='compact' else 1280,'height':640 if case=='compact' else 800})
    page.set_default_timeout(10000);page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
    page.on('request',lambda r:report['network'].append(r.url) if r.url.startswith(('http:','https:')) else None)
    def button(name):return page.get_by_role('button',name=name,exact=True)
    def tab(name):page.get_by_role('tab',name=name,exact=True).click()
    def native():
        with page.expect_download() as ev:button('Export native format (⌘/Ctrl S)').click()
        d=json.loads(Path(ev.value.path()).read_text());page.keyboard.press('Escape');return d
    def select(a,b):
        page.get_by_label('Selection start',exact=True).fill(str(a));page.get_by_label('Selection end',exact=True).fill(str(b));button('Select').click()
    def upload(name,data):
        if isinstance(data,dict):data=json.dumps(data).encode()
        page.get_by_test_id('file-input').set_input_files({'name':name,'mimeType':'application/octet-stream','buffer':data});expect(page.locator('.notification')).to_be_visible();page.keyboard.press('Escape')
    def cam():return page.get_by_test_id('map-camera').evaluate('(e)=>({zoom:+e.dataset.zoom,x:+e.dataset.panX,y:+e.dataset.panY})')
    def wait_zoom(previous):page.wait_for_function('(z)=>+document.querySelector("[data-testid=map-camera]").dataset.zoom!==z',arg=previous)
    def drag(dx,dy,kind='left'):
        b=page.get_by_test_id('map-camera').bounding_box();x=b['x']+b['width']*.4;y=b['y']+b['height']*.4
        page.mouse.move(x,y);page.mouse.down(button=kind);page.mouse.move(x+dx,y+dy,steps=8);page.mouse.up(button=kind)
    try:
        if mode=='inline':page.set_content((ROOT/'dist/index.html').read_text(),wait_until='load')
        else:page.goto((ROOT/'dist/index.html').as_uri())
        expect(page.locator('.map-render svg')).to_be_visible();page.keyboard.press('Escape')
        if case=='camera':
            original=native();select(4520,185);before_status=page.get_by_test_id('selection-status').inner_text()
            stage=page.get_by_test_id('map-camera');box=stage.bounding_box();anchor={'x':125,'y':-65};initial=cam()
            page.evaluate('window.__initialSvg=document.querySelector(".map-render svg")')
            page.mouse.move(box['x']+box['width']/2+anchor['x'],box['y']+box['height']/2+anchor['y']);page.mouse.wheel(0,-120)
            wait_zoom(initial['zoom']);after=cam();assert after['zoom']>initial['zoom']
            for k in ['x','y']:assert abs((anchor[k]-after[k])/after['zoom']-anchor[k])<.1
            assert page.evaluate('window.__initialSvg===document.querySelector(".map-render svg")')
            assert page.get_by_test_id('selection-status').inner_text()==before_status
            passed('Real wheel zoom keeps the pointer anchor and SVG identity, without changing the DNA selection')
            for kind in ['hand','space','middle']:
                if kind=='hand':button('Pan map').click()
                if kind=='space':stage.focus();page.keyboard.down('Space')
                before=cam();drag(110,-45,'middle' if kind=='middle' else 'left');after=cam()
                if kind=='space':page.keyboard.up('Space')
                if kind=='hand':button('Pan map').click()
                assert abs(after['x']-before['x']-110)<1 and abs(after['y']-before['y']+45)<1,(kind,before,after)
                assert page.get_by_test_id('selection-status').inner_text()==before_status
            passed('Pan button, Space+left drag and middle-button drag move the map while preserving selection')
            button('Pan map').click();b=stage.bounding_box();page.mouse.move(b['x']+30,b['y']+30);page.mouse.down();page.mouse.move(b['x']+70,b['y']+60,steps=3)
            stage.dispatch_event('pointercancel',{'pointerId':1});page.wait_for_timeout(100);stopped=cam();page.mouse.move(b['x']+100,b['y']+90,steps=3);page.mouse.up();page.wait_for_timeout(100);assert cam()==stopped
            button('Pan map').click();stage.focus();page.keyboard.down('Space');page.evaluate('window.dispatchEvent(new Event("blur"))');page.keyboard.up('Space')
            assert not stage.evaluate('(e)=>e.classList.contains("is-panning")||e.classList.contains("pan-ready")')
            passed('Pointer cancellation and window blur release pan state without a stuck drag or Space modifier')
            before=cam();stage.focus();page.keyboard.press('ArrowLeft');page.wait_for_timeout(80);assert cam()['x']==before['x']-20
            persisted=cam();tab('Sequence');tab('Map');assert cam()==persisted
            upload('another.fa',b'>Other document\nACGTACGT\n');assert cam()=={'zoom':1,'x':0,'y':0};tab(original['name']);assert cam()==persisted
            passed('Camera state survives view changes and stays independent between documents')
            button('Fit').click();expect(stage).to_have_attribute('data-zoom','1');assert cam()=={'zoom':1,'x':0,'y':0}
            page.get_by_label('Map zoom',exact=True).select_option('1.5');expect(stage).to_have_attribute('data-zoom','1.5')
            # Click a real feature at its transformed screen location, not a screen coordinate stub.
            feature=page.locator('.map-render svg').get_by_text('Region B',exact=True).first
            feature.click();expect(page.get_by_test_id('selection-status')).to_contain_text('1,020 bp')
            selected=page.get_by_test_id('selection-status').inner_text()
            button('Pan map').click();drag(-160,35);button('Pan map').click();assert page.get_by_test_id('selection-status').inner_text()==selected
            for fmt in ['SVG','PNG']:
                with page.expect_download() as ev:button('Export '+fmt).click()
                raw=Path(ev.value.path()).read_bytes();assert len(raw)>100
                if fmt=='SVG':assert b'<svg' in raw and original['name'].encode() in raw
                else:assert raw[:8]==b'\x89PNG\r\n\x1a\n'
            assert native()==original
            passed('Transformed feature selection remains exact; SVG/PNG export and camera changes leave the document byte-equivalent')
            button('Fit').click();tab('Split');expect(stage).to_be_visible();page.mouse.move(stage.bounding_box()['x']+60,stage.bounding_box()['y']+80);page.mouse.wheel(0,-80);wait_zoom(1)
            button('Pan map').click();drag(25,30);button('Pan map').click();assert native()==original
            passed('The paired workspace uses the same independent camera without contaminating scientific data')
            page.screenshot(path=str(OUT/'map-mouse-split.png'))
        elif case=='typing':
            text=(ROOT/'tests/fixtures/synthetic-120.gb').read_text().replace('     misc_feature    41..80','     CDS             join(41..50,61..80)')
            upload('joined.gb',text.encode());before=native();tab('Sequence');button('Type DNA').click();view=page.get_by_test_id('sequence-view');expect(view).to_be_focused()
            page.keyboard.press('Home');page.keyboard.type('nry');after=native();assert after['sequence']=='NRY'+before['sequence']
            assert after['features'][2]['segments']==[{'start':43,'end':53},{'start':63,'end':83}]
            assert after['primers']==before['primers'];passed('Rapid direct typing uses one current revision per key and shifts exact joined parts without filling gaps')
            view.focus();page.keyboard.press('z');assert native()==after;expect(page.locator('.typing-notice')).to_contain_text('IUPAC')
            # Ctrl+Z keeps the application undo path; external revisions leave typing mode.
            view.focus();page.keyboard.press('Control+z');undo=native();assert undo['sequence']=='NR'+before['sequence'];expect(button('Type DNA')).to_have_attribute('aria-pressed','false')
            page.keyboard.press('Control+Shift+z');assert native()==after
            passed('Invalid keys do not edit; document undo/redo restores exact typed states and disarms stale carets')
            button('Type DNA').click();select(6,8);view.focus()
            page.once('dialog',lambda d:d.dismiss());page.keyboard.press('a');assert native()==after
            view.focus();page.once('dialog',lambda d:d.accept());page.keyboard.press('a');replaced=native();assert replaced['sequence']==after['sequence'][:5]+'A'+after['sequence'][8:]
            passed('Replacing a multi-base selection needs explicit confirmation; cancellation is non-destructive')
            view.focus();page.keyboard.press('End');page.keyboard.press('Backspace');deleted=native();assert deleted['sequence']==replaced['sequence'][:-1]
            view.focus();page.keyboard.press('Delete');assert native()==deleted
            view.focus();page.keyboard.press('Escape');expect(button('Type DNA')).to_have_attribute('aria-pressed','false')
            view.focus();page.keyboard.type('acgt');assert native()==deleted
            passed('Backspace/Delete obey interbase boundaries; Escape returns to non-editing navigation')
            button('Type DNA').click();view.focus();page.keyboard.press('Home');page.keyboard.press('Shift+ArrowRight');page.keyboard.press('Shift+ArrowRight');page.keyboard.press('Shift+ArrowRight')
            expect(page.get_by_test_id('selection-status')).to_contain_text('3 bp');page.keyboard.press('Shift+ArrowLeft');expect(page.get_by_test_id('selection-status')).to_contain_text('2 bp')
            page.keyboard.press('Escape');assert native()==deleted
            passed('Repeated Shift arrows retain the interbase anchor and reverse selection direction without editing DNA')
            with page.expect_download() as ev:button('Export native format (⌘/Ctrl S)').click()
            data=Path(ev.value.path()).read_bytes();page.keyboard.press('Escape');upload('saved.sg.json',data);assert native()==deleted
            passed('Typed joined documents export and reopen with exact annotations, journal and unchanged oligos')
            tab('Sequence');button('Type DNA').click();view.focus();page.keyboard.press('Control+a');page.once('dialog',lambda d:d.accept());page.keyboard.press('Delete')
            empty=native();assert empty['sequence']==''
            view.focus();page.keyboard.type('ACGT');assert native()['sequence']=='ACGT'
            passed('Deleting all bases creates a valid empty working document that accepts new typed DNA')
            page.screenshot(path=str(OUT/'direct-dna-typing.png'))
        elif case=='compact':
            tab('Split');stage=page.get_by_test_id('map-camera');button('Pan map').click();drag(50,20);button('Pan map').click()
            button('Type DNA').click();view=page.get_by_test_id('sequence-view');view.focus();page.keyboard.press('End');page.keyboard.type('N')
            expect(page.get_by_test_id('selection-status')).to_contain_text('No selection')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            for name in ['Fit','Pan map','Export SVG','Export PNG','Type DNA']:
                b=button(name).bounding_box();assert b and b['x']>=0 and b['x']+b['width']<=1024 and b['y']+b['height']<=640,(name,b)
            passed('Mouse controls and opt-in typing remain accessible in the paired 1024×640 layout')
            page.screenshot(path=str(OUT/'map-mouse-1024.png'))
        assert not report['errors'],report['errors'];assert not report['network'],report['network'];passed('No recorded JavaScript/CSP errors or HTTP requests');report['success']=True
    except Exception as e:
        report['success']=False;report['failure']=str(e);page.screenshot(path=str(OUT/f'mouse-editing-{case}-failure.png'));raise
    finally:
        (OUT/f'mouse-editing-{case}.json').write_text(json.dumps(report,indent=2));browser.close()
