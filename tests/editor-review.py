"""Regression for lossless feature-editor mode changes and isolated oligo dialogs."""
from pathlib import Path
import json, os
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results'
OUT.mkdir(exist_ok=True)
mode = os.environ.get('GIN_SCHNAPS_TEST_MODE', 'file')
report = {'mode': mode, 'success': False, 'checks': [], 'errors': [], 'network': []}
with sync_playwright() as p:
    options = {'headless': True}
    if os.environ.get('CHROMIUM_PATH'):
        options['executable_path'] = os.environ['CHROMIUM_PATH']
    browser = p.chromium.launch(**options)
    page = browser.new_page(accept_downloads=True, viewport={'width': 1024, 'height': 640})
    page.set_default_timeout(12000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    page.on('console', lambda m: report['errors'].append(m.text) if m.type == 'error' else None)
    page.on('request', lambda r: report['network'].append(r.url) if r.url.startswith(('http:', 'https:')) else None)
    def button(name):
        return page.get_by_role('button', name=name, exact=True)
    def tab(name):
        page.get_by_role('tab', name=name, exact=True).click()
    def passed(message):
        report['checks'].append(message)
        print('PASS', message, flush=True)
    def native():
        with page.expect_download() as download:
            button('Export native format (⌘/Ctrl S)').click()
        doc = json.loads(Path(download.value.path()).read_text())
        page.keyboard.press('Escape')
        return doc
    def upload(doc):
        page.get_by_test_id('file-input').set_input_files({'name':'review.sg.json','mimeType':'application/json','buffer':json.dumps(doc).encode()})
        expect(page.locator('.notification')).to_be_visible()
        assert page.get_by_role('alert').count() == 0
        page.keyboard.press('Escape')
    try:
        if mode == 'inline':
            page.set_content((ROOT/'dist/index.html').read_text(), wait_until='domcontentloaded')
        else:
            page.goto((ROOT/'dist/index.html').as_uri())
        expect(page.get_by_role('tab', name='Map', exact=True)).to_be_visible()
        doc = native()
        doc['name'] = 'Editor review'
        doc['features'] = [{**doc['features'][0], 'id':'joined-review', 'name':'Unstranded join', 'strand':0,
                            'segments':[{'start':10,'end':20},{'start':30,'end':50}]}]
        upload(doc)
        tab('Features')
        feature = doc['features'][0]
        button('Edit Unstranded join').click()
        switch = page.get_by_role('checkbox', name='Use a location expression (join, complement, uncertain or remote)', exact=True)
        expect(switch).to_be_checked()
        expect(page.get_by_role('checkbox', name='Unstranded exact feature', exact=True)).to_be_checked()
        switch.click()  # A refused toggle must remain checked; uncheck() would wrongly demand a change.
        expect(switch).to_be_checked()
        expect(page.get_by_role('dialog')).to_contain_text('would lose disjoint parts')
        page.get_by_label('Feature name', exact=True).fill('Renamed unstranded')
        button('Apply').click()
        page.keyboard.press('Escape')
        assert native()['features'][0] == {**feature, 'name':'Renamed unstranded'}
        passed('Metadata-only editing preserves an unstranded join and refuses a lossy switch to simple coordinates')

        doc = native()
        doc['name'] = 'Coordinate mode review'
        doc['features'] = [{**feature, 'name':'Continuous', 'segments':[{'start':10,'end':25}]}]
        upload(doc)
        tab('Features')
        button('Edit Continuous').click()
        page.get_by_label('Edit start', exact=True).fill('12')
        page.get_by_label('Edit end', exact=True).fill('24')
        switch.check()
        expect(page.get_by_label('Feature location expression', exact=True)).to_have_value('12..24')
        switch.uncheck()
        expect(page.get_by_label('Edit start', exact=True)).to_have_value('12')
        expect(page.get_by_label('Edit end', exact=True)).to_have_value('24')
        expect(page.get_by_label('Feature strand', exact=True)).to_have_value('0')
        button('Cancel').click()
        assert native() == doc
        passed('Switching coordinate controls preserves current values and strand; cancellation leaves the document unchanged')

        tab('Primers')
        page.locator('.primer-library summary').click()
        button('Add oligo').click()
        page.get_by_label('Oligo name', exact=True).fill('Dialog isolation')
        page.get_by_label('Oligo sequence', exact=True).fill('ACGTACGT')
        count = page.get_by_role('tablist', name='Open documents').get_by_role('tab').count()
        page.get_by_label('Oligo notes', exact=True).press('Control+n')
        expect(page.get_by_role('dialog', name='Library oligo', exact=True)).to_be_visible()
        assert page.get_by_role('tablist', name='Open documents').get_by_role('tab').count() == count
        assert page.get_by_role('dialog').count() == 1
        button('Cancel').click()
        assert native() == doc
        passed('Oligo dialog blocks background new-document actions; cancellation does not mutate the document')
        assert not report['errors'], report['errors']
        assert not report['network'], report['network']
        passed('No JavaScript/CSP errors or HTTP/HTTPS requests in the editor review scenario')
        report['success'] = True
    except Exception as error:
        report['failure'] = str(error)
        try:
            page.screenshot(path=str(OUT/'editor-review-failure.png'), timeout=4000)
        except Exception:
            pass
        raise
    finally:
        (OUT/'editor-review-report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False))
        browser.close()
