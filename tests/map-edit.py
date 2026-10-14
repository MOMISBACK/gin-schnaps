"""Map gestures and guarded base typing, offline browser regression. CI uses real file://."""
from pathlib import Path
import json, os
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
mode=os.environ.get('GIN_SCHNAPS_TEST_MODE','file')
report={'success':False,'mode':mode,'checks':[],'errors':[]}
with sync_playwright() as p:
    opts={'headless':True}
    if os.environ.get('CHROMIUM_PATH'):opts['executable_path']=os.environ['CHROMIUM_PATH']
    browser=p.chromium.launch(**opts)
    page=browser.new_page(accept_downloads=True,viewport={'width':1280,'height':800})
    page.set_default_timeout(12000)
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    def check(name):report['checks'].append(name);print('PASS',name,flush=True)
    def pan():return page.locator('.map-render').evaluate('x => getComputedStyle(x).transform')
    def download():
        with page.expect_download() as d:page.get_by_role('button',name='Export native format (⌘/Ctrl S)',exact=True).click()
        return json.loads(Path(d.value.path()).read_text())
    try:
        if mode=='inline':page.set_content((ROOT/'dist/index.html').read_text(),wait_until='domcontentloaded')
        else:page.goto((ROOT/'dist/index.html').as_uri())
        expect(page.get_by_test_id('map-view').locator('svg')).to_have_count(1)
        scroll=page.locator('.map-scroll');r=scroll.bounding_box()
        x=r['x']+r['width']*.68;y=r['y']+r['height']*.45
        before=pan();page.mouse.move(x,y);page.mouse.wheel(0,-350)
        expect(page.get_by_role('combobox',name='Map zoom')).not_to_have_value('1')
        after=pan();assert before!=after,(before,after)
        check('Wheel zooms at pointer and changes scale')
        offset={'x':r['x']+8,'y':r['y']+8}
        before=pan();page.mouse.move(**offset);page.keyboard.down('Shift');page.mouse.down()
        page.mouse.move(offset['x']+90,offset['y']+55,steps=8)
        page.mouse.up();page.keyboard.up('Shift')
        assert pan()!=before
        check('Shift-drag pans without modifying DNA')
        page.get_by_role('button',name='Fit and center map').click()
        expect(page.get_by_role('combobox',name='Map zoom')).to_have_value('1')
        check('Fit resets zoom and center')
        fixture=json.loads((ROOT/'tests/fixtures/primer-library-demo.sg.json').read_text())
        fixture['name']='Joined typed'
        fixture['features']=[{'id':'f','name':'Joined','type':'CDS','strand':1,'color':'#229966',
          'segments':[{'start':2,'end':10},{'start':20,'end':32}],
          'qualifiers':[{'key':'translation','value':'OLD'},{'key':'note','value':'keep'}],
          'archivedQualifiers':[],'reviewRequired':False}]
        if fixture.get('schemaVersion')!=7:fixture.pop('creation',None)
        page.get_by_test_id('file-input').set_input_files({'name':'joined.sg.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()})
        expect(page.get_by_role('tab',name='Joined typed',exact=True)).to_be_visible()
        page.get_by_role('tab',name='Sequence',exact=True).click()
        page.get_by_label('Selection start',exact=True).fill('5')
        page.get_by_label('Selection end',exact=True).fill('5')
        page.get_by_role('button',name='Select',exact=True).click()
        button=page.get_by_role('button',name='Direct DNA typing',exact=True)
        button.click();expect(button).to_have_attribute('aria-pressed','true')
        page.keyboard.type('N')
        changed=download()
        assert changed['sequence'][4]=='N'
        assert changed['features'][0]['segments']==fixture['features'][0]['segments']
        assert changed['features'][0]['qualifiers']==[{'key':'note','value':'keep'}]
        assert changed['features'][0]['archivedQualifiers'][0]['key']=='translation'
        check('Direct base entry edits DNA and archives stale translation')
        page.keyboard.press('Control+z');restored=download()
        assert restored['sequence']==fixture['sequence'] and restored['features']==fixture['features']
        check('Undo restores joined feature and original sequence')
        button.click();expect(button).to_have_attribute('aria-pressed','false')
        page.keyboard.type('N');assert download()['sequence']==fixture['sequence']
        check('Typing is inert when direct edit mode is off')
        page.get_by_role('tab',name='Split',exact=True).click()
        expect(page.get_by_test_id('split-view').locator('.map-scroll')).to_be_visible()
        expect(page.get_by_role('button',name='Zoom in map')).to_be_visible()
        check('Zoom and gestures available in split view')
        assert not report['errors'],report['errors']
        report['success']=True
        page.screenshot(path=str(OUT/'map-edit-1280.png'))
    finally:
        (OUT/'map-edit-report.json').write_text(json.dumps(report,indent=2))
        browser.close()
assert report['success'],report
