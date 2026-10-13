"""Interaction regressions and synthetic performance probe, with no private data."""
from pathlib import Path
import os, json
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
mode=os.environ.get('GIN_SCHNAPS_TEST_MODE','file')
report={'mode':mode,'checks':[],'errors':[],'externalRequests':[]}
def passed(text):
    report['checks'].append(text); print('PASS',text,flush=True)
with sync_playwright() as p:
    options={'headless':True}
    if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
    browser=p.chromium.launch(**options)
    context=browser.new_context(accept_downloads=True,viewport={'width':1280,'height':800})
    page=context.new_page();page.set_default_timeout(10000);page.set_default_navigation_timeout(45000)
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
    page.on('request',lambda r:report['externalRequests'].append(r.url) if r.url.startswith(('http:','https:')) else None)
    def load(name):
        if mode=='inline':page.set_content((ROOT/'dist'/name).read_text(),wait_until='domcontentloaded')
        else:page.goto((ROOT/'dist'/name).as_uri())
    def select(start,end):
        page.get_by_label('Selection start',exact=True).fill(str(start));page.get_by_label('Selection end',exact=True).fill(str(end));page.get_by_role('button',name='Select',exact=True).click()
    try:
        load('index.html');page.get_by_role('tab',name='Sequence',exact=True).click()
        select(4520,185);view=page.get_by_test_id('sequence-view')
        view.press('Shift+ArrowRight');expect(page.get_by_test_id('selection-status')).to_contain_text('467 bp')
        expect(page.get_by_label('Selection end',exact=True)).to_have_value('186')
        view.press('Shift+ArrowLeft');expect(page.get_by_test_id('selection-status')).to_contain_text('466 bp')
        passed('Circular keyboard extension/reduction preserves 4520..185 and does not truncate at the origin')
        page.screenshot(path=str(OUT/'selection-step5.png'))
        select(1,1);view.press('Shift+ArrowLeft');expect(page.get_by_label('Selection start',exact=True)).to_have_value('4800')
        expect(page.get_by_test_id('selection-status')).to_contain_text('2 bp')
        view.press('Shift+ArrowRight');expect(page.get_by_test_id('selection-status')).to_contain_text('1 bp')
        view.press('Shift+ArrowRight');expect(page.get_by_label('Selection end',exact=True)).to_have_value('2')
        passed('Anchor survives shrinking to one base and reversing direction across the origin')
        select(1,4800);view.press('Shift+ArrowRight');expect(page.get_by_test_id('selection-status')).to_contain_text('4,800 bp')
        view.press('Shift+ArrowLeft');expect(page.get_by_label('Selection end',exact=True)).to_have_value('4799')
        passed('Whole-circle selection remains bounded to one turn and can shrink')
        page.get_by_test_id('file-input').set_input_files({'name':'one.fa','mimeType':'text/plain','buffer':b'>one\nA'})
        page.keyboard.press('Escape');page.get_by_role('tab',name='Sequence',exact=True).click();select(1,1)
        view.press('ArrowRight');view.press('Shift+ArrowLeft');expect(page.get_by_test_id('selection-status')).to_contain_text('1 bp')
        passed('Single-base linear document and empty-history navigation do not exceed boundaries')
        page.close();page=context.new_page();page.set_default_timeout(10000);page.set_default_navigation_timeout(45000)
        page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
        page.on('request',lambda r:report['externalRequests'].append(r.url) if r.url.startswith(('http:','https:')) else None)
        load('diagnostic.html');page.get_by_role('button',name='Run measurements',exact=True).click()
        data=page.get_by_test_id('diagnostic-report');expect(data).to_be_visible(timeout=120000)
        diagnostic=json.loads(data.inner_text());assert diagnostic['success'],diagnostic
        assert [x['bases'] for x in diagnostic['cases']]==[10000,100000]
        assert all(0<x['visibleRows']<30 and len(x['mapMilliseconds'])==3 for x in diagnostic['cases'])
        (OUT/'performance.json').write_text(json.dumps(diagnostic,indent=2,ensure_ascii=False))
        with page.expect_download() as event:page.get_by_role('button',name='Export report',exact=True).click()
        assert json.loads(Path(event.value.path()).read_text())==diagnostic
        passed('Actual OVE maps, virtualized sequences, circular selection and worker translation measured on two synthetic fixtures; report roundtrip exact')
        assert not report['errors'],report['errors'];assert not report['externalRequests'],report['externalRequests']
        passed('No JavaScript/CSP errors or external HTTP requests in the consolidation and diagnostic workflows')
        report['success']=True
    except Exception as e:
        report['success']=False;report['failure']=str(e)
        page.screenshot(path=str(OUT/'consolidation-failure.png'))
        raise
    finally:
        (OUT/'consolidation-report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False));browser.close()
