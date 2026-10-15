"""Annotation integration: real OS clipboard round trips, not just synthetic paste.
The optional inline HTML mode is reported and does not certify file:// launch.
"""
from pathlib import Path
import json, os, platform, subprocess, sys
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'test-results'; OUT.mkdir(exist_ok=True)
mode=os.environ.get('GIN_SCHNAPS_TEST_MODE','file')
case=os.environ.get('GIN_ANNOTATION_CASE','all')
if case=='all':
    reports=[]
    for scenario in ['editor','clipboard','features','navigation']:
        subprocess.run([sys.executable,__file__],env={**os.environ,'GIN_ANNOTATION_CASE':scenario},check=True,timeout=100)
        reports.append(json.loads((OUT/f'annotations-{scenario}.json').read_text()))
    (OUT/'annotations-clipboard-report.json').write_text(json.dumps({'success':True,'mode':mode,'scenarios':reports,'checkCount':sum(len(r['checks']) for r in reports)},indent=2))
    sys.exit(0)
report={'mode':mode,'success':False,'checks':[],'errors':[],'network':[],'realAnnotatedClipboard':False}
SEQ='ATGGCTCATAGTCGATGCTACGATCCGTAATAGTTCGATGCCGACTACGTGCTAGTCGTAACGCT'
def feature(name='Joined CDS',strand=1):
    return {'id':'f','name':name,'type':'CDS','color':'#336699','segments':[{'start':2,'end':8},{'start':14,'end':23}],'strand':strand,
            'qualifiers':[{'key':'codon_start','value':'1'},{'key':'transl_table','value':'11'},{'key':'translation','value':'OLD'},{'key':'note','value':'one'},{'key':'note','value':'two'}], 'archivedQualifiers':[],'reviewRequired':False}
def document(name,features=None,sequence=SEQ,circular=False):
    return {'schemaVersion':5,'id':name,'name':name,'description':'Synthetic test only','sequence':sequence,'topology':'circular' if circular else 'linear',
            'features':features or [],'primers':[],'pcrRecipe':None,'sourceArchive':None,'history':[],'historyOmitted':0,'provenance':'local-file'}
with sync_playwright() as p:
    options={'headless':True}
    if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
    browser=p.chromium.launch(**options)
    page=browser.new_page(accept_downloads=True,viewport={'width':1280,'height':800});page.set_default_timeout(12000)
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
    page.on('request',lambda r:report['network'].append(r.url) if r.url.startswith(('https:','http:')) else None)
    modifier='Meta' if platform.system()=='Darwin' else 'Control'
    def button(name):return page.get_by_role('button',name=name,exact=True)
    def tab(name):page.get_by_role('tab',name=name,exact=True).click()
    def mark(name):report['checks'].append(name);print('PASS',name,flush=True)
    def dismiss():
        if button('Close message').count():button('Close message').click()
    def upload(doc):
        page.get_by_test_id('file-input').set_input_files({'name':doc['name']+'.sg.json','mimeType':'application/json','buffer':json.dumps(doc).encode()})
        expect(page.get_by_role('tab',name=doc['name'],exact=True)).to_be_visible();dismiss()
    def native():
        print('Export active document',flush=True)
        with page.expect_download() as e:button('Export native format (⌘/Ctrl S)').click()
        result=json.loads(Path(e.value.path()).read_text());dismiss();return result
    def choose(a,b):
        page.get_by_label('Selection start',exact=True).fill(str(a));page.get_by_label('Selection end',exact=True).fill(str(b));button('Select').click()
    def biological(d,f):
        text=''.join(d['sequence'][s['start']:s['end']] for s in f['segments'])
        return text.translate(str.maketrans('ACGT','TGCA'))[::-1] if f['strand']==-1 else text
    try:
        if mode=='inline':page.set_content((ROOT/'dist/index.html').read_text(),wait_until='domcontentloaded')
        else:page.goto((ROOT/'dist/index.html').as_uri())
        expect(page.get_by_test_id('map-navigation')).to_have_attribute('data-navigation-ready','true')
        source=document('Source',[feature()]); target=document('Target')
        upload(target);upload(source)
        if case=='editor':
            tab('Features');button('Edit Joined CDS').click()
            expect(page.get_by_role('dialog',name='Edit feature')).to_be_visible()
            page.get_by_label('Feature location expression',exact=True).fill('join(4..8,15..23)')
            page.get_by_label('CDS codon_start',exact=True).select_option('2');button('Apply').click();dismiss()
            edited=native();q=edited['features'][0];assert next(x['value'] for x in q['qualifiers'] if x['key']=='codon_start')=='2'
            assert any(x['key']=='codon_start' and x['value']=='1' for x in q['archivedQualifiers'])
            assert not any(x['key']=='translation' for x in q['qualifiers'])
            mark('Geometry and explicit CDS phase can change together without archiving the new declaration')
            button('Undo (⌘/Ctrl Z)').click();assert native()==source
            button('Edit Joined CDS').click();button('Edit segments…').click()
            page.get_by_label('Segment 1 start',exact=True).fill('4');page.get_by_label('Segment-list strand',exact=True).select_option('0')
            expect(page.get_by_label('Feature location expression',exact=True)).to_have_value('join(4..8,15..23)')
            page.screenshot(path=str(OUT/'annotation-segment-editor.png'))
            button('Apply').click();dismiss();changed=native();assert changed['features'][0]['strand']==0;assert changed['features'][0]['segments'][0]['start']==3
            button('Undo (⌘/Ctrl Z)').click();assert native()==source
            mark('Segment list retains declared order and genuine unstranded state, with exact Undo')
            page.get_by_label('Select feature Joined CDS',exact=True).check()
            expect(page.locator('.feature-selection-state')).to_contain_text('1 selected')
            page.get_by_label('Filter features',exact=True).fill('no-match')
            expect(page.locator('.feature-selection-state')).to_contain_text('1 hidden by filter')
            page.get_by_label('Filter features',exact=True).fill('')
            button('Edit selected…').click();page.get_by_label('Feature batch operation',exact=True).select_option('duplicate');button('Apply feature operation').click();dismiss()
            assert len(native()['features'])==2;button('Undo (⌘/Ctrl Z)').click();assert native()==source
            expect(page.get_by_label('Select feature Joined CDS',exact=True)).to_be_checked()
            mark('Object selection survives filtering and Undo; batch duplication does not alter DNA')
        if case=='clipboard':
            tab('Sequence');choose(1,30)
            button('Copy DNA + features').click();button('Copy fragment').click();dismiss()
            tab('Target');tab('Sequence');choose(4,4);page.keyboard.press(modifier+'+v')
            expect(page.get_by_role('dialog',name='Paste annotated fragment',exact=True)).to_be_visible()
            page.get_by_label('Reverse-complement fragment and feature orientation',exact=True).check()
            page.screenshot(path=str(OUT/'annotated-paste-preview.png'))
            button('Apply annotated paste').click();dismiss();pasted=native()
            rc=SEQ[:30].translate(str.maketrans('ACGT','TGCA'))[::-1]
            assert pasted['sequence']==SEQ[:3]+rc+SEQ[3:];assert len(pasted['features'])==1
            assert pasted['features'][0]['id']!='f';assert biological(pasted,pasted['features'][0])==biological(source,source['features'][0])
            assert len(pasted['history'])==1;report['realAnnotatedClipboard']=True
            mark('Actual OS clipboard transfers annotated DNA across tabs with reverse orientation and one history operation')
            button('Undo (⌘/Ctrl Z)').click();assert native()==target;button('Redo (⌘/Ctrl ⇧ Z)').click();assert native()==pasted
            tab('Source');assert native()==source
            mark('Annotated paste Undo/Redo and native round-trip are exact; source remains unchanged')
            # A second independent browser context reads the real OS clipboard; no session fragment is available.
            second=browser.new_page(accept_downloads=True,viewport={'width':1024,'height':640});second.set_default_timeout(12000)
            if mode=='inline':second.set_content((ROOT/'dist/index.html').read_text(),wait_until='domcontentloaded')
            else:second.goto((ROOT/'dist/index.html').as_uri())
            expect(second.get_by_test_id('map-navigation')).to_be_visible();second.keyboard.press(modifier+'+v')
            expect(second.get_by_role('dialog',name='Paste annotated fragment',exact=True)).to_be_visible()
            second.get_by_role('button',name='Cancel',exact=True).click();second.close()
            mark('Annotated clipboard remains readable in a separate browser context without in-memory matching')
        if case=='features':
            tab('Features');page.get_by_label('Select feature Joined CDS',exact=True).check();button('Copy features').click();button('Copy fragment').click();dismiss()
            tab('Target');assert native()==target
            button('Paste session fragment…').click();page.get_by_label('Annotated paste start',exact=True).fill('3');button('Apply annotated paste').click();dismiss()
            only=native();assert only['sequence']==target['sequence'];assert len(only['features'])==1
            mark('Features-only paste uses an exact DNA placement check and never changes the destination bases')
            button('Undo (⌘/Ctrl Z)').click();button('Paste session fragment…').click();page.get_by_label('Annotated paste start',exact=True).fill('4')
            expect(button('Apply annotated paste')).to_be_disabled();expect(page.get_by_role('dialog',name='Paste annotated fragment')).to_contain_text('Destination DNA differs')
            button('Cancel').click();assert native()==target
            mark('Mismatching features-only placement is refused unless separately approved')
            tab('Source');tab('Sequence');choose(6,10);button('Copy DNA + features').click()
            expect(button('Copy fragment')).to_be_disabled();page.get_by_label('I accept the clipped or omitted annotations',exact=True).check();button('Copy fragment').click();dismiss()
            tab('Target');page.keyboard.press(modifier+'+v');expect(button('Apply annotated paste')).to_be_disabled()
            page.get_by_label('Accept 1 clipped and 0 omitted annotations',exact=True).check();button('Apply annotated paste').click();dismiss()
            clipped=native()['features'][0];assert clipped['reviewRequired'];assert any(q['key']=='translation' for q in clipped['archivedQualifiers'])
            mark('Partial feature copy and paste expose loss and archive stale biological claims')
            button('Undo (⌘/Ctrl Z)').click()
        if case=='navigation':
            tab('Source');tab('Sequence');choose(1,30);button('Copy DNA + features').click();button('Cancel').click();assert native()==source
            page.set_viewport_size({'width':1024,'height':640});tab('Features');button('Edit Joined CDS').click()
            assert button('Apply').bounding_box()['y'] < 640
            page.keyboard.press(modifier+'+n');expect(page.get_by_role('dialog')).to_have_count(1);button('Cancel').click()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            mark('Cancellation and global-shortcut guards preserve source; editor footer remains accessible at 1024x640')
            tab('Map');nav=page.get_by_test_id('map-navigation');expect(nav).to_have_attribute('data-navigation-ready','true')
            rect=nav.bounding_box();page.mouse.move(rect['x']+rect['width']/2,rect['y']+rect['height']/2);page.mouse.wheel(0,-120)
            page.wait_for_function("Number(document.querySelector('[data-testid=\"map-navigation\"]').dataset.zoom)>1")
            zoom=nav.get_attribute('data-zoom');page.set_viewport_size({'width':1280,'height':800});expect(nav).to_have_attribute('data-zoom',zoom)
            mark('Wheel handler is ready before use and a resize no longer discards the camera gesture')
            # Malformed rich payload must not downgrade silently to a base-only paste.
            page.evaluate("""() => {const data=new DataTransfer(); data.setData('text/plain','ACGT');data.setData('application/x-gin-schnaps-fragment+json','{}');window.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));}""")
            expect(page.get_by_role('alert')).to_contain_text('clipboard');assert page.get_by_role('dialog').count()==0
            mark('Malformed structured clipboard payload is rejected instead of silently losing metadata')
        assert not report['network'],report['network'];assert not report['errors'],report['errors'];report['success']=True
    except Exception as e:
        report['failure']=str(e)
        try:page.screenshot(path=str(OUT/'annotations-failure.png'))
        except Exception:pass
        raise
    finally:
        report['browserVersion']=browser.version
        (OUT/f'annotations-{case}.json').write_text(json.dumps(report,indent=2,ensure_ascii=False));browser.close()
