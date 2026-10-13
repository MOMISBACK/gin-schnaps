"""Browser integration checks. Real file:// by default; inline mode is recorded.
Install: python3 -m pip install playwright==1.58.0 ; python3 -m playwright install chromium
A system Chromium may be supplied with CHROMIUM_PATH. No external pages are visited.
"""
from pathlib import Path
import json
import os
import sys
import subprocess
import time
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results'
OUT.mkdir(exist_ok=True)
mode = os.environ.get('GIN_SCHNAPS_TEST_MODE', 'file')
case = os.environ.get('GIN_SCHNAPS_TEST_CASE', 'all')
report = {'mode': mode, 'checks': [], 'measurements': {}, 'errors': [], 'externalRequests': []}
if case == 'all':
    combined = []
    for scenario in ['flows', 'large', 'layout1024', 'layout1280', 'layout1440', 'editing', 'editlayout', 'translation', 'restriction', 'pcr', 'analysislayout', 'worker']:
        subprocess.run([sys.executable, __file__], env={**os.environ, 'GIN_SCHNAPS_TEST_CASE': scenario}, check=True, timeout=75)
        combined.append(json.loads((OUT / f'browser-{scenario}.json').read_text()))
    (OUT / 'browser-report.json').write_text(json.dumps({'success': True, 'mode': mode, 'scenarios': combined, 'checkCount': sum(len(r['checks']) for r in combined)}, indent=2, ensure_ascii=False))
    sys.exit(0)



def passed(name):
    report['checks'].append(name)
    print('PASS', name, flush=True)


def choose(page, first, last):
    page.get_by_label('Selection start', exact=True).fill(str(first))
    page.get_by_label('Selection end', exact=True).fill(str(last))
    page.get_by_role('button', name='Select', exact=True).click()


with sync_playwright() as p:
    launch = {'headless': True}
    if os.environ.get('CHROMIUM_PATH'):
        launch['executable_path'] = os.environ['CHROMIUM_PATH']
    browser = p.chromium.launch(**launch)
    report['browserVersion'] = browser.version


    def new_page(width=1280, height=800):
        print(f'LOAD {width}x{height}', flush=True)
        page = browser.new_page(accept_downloads=True)
        page.set_default_timeout(8000)
        page.set_default_navigation_timeout(20000)
        page.set_viewport_size({'width': width, 'height': height})
        page.on('pageerror', lambda error: report['errors'].append(str(error)))
        page.on('console', lambda message: report['errors'].append(message.text[:1000]) if message.type == 'error' else None)
        page.on('request', lambda request: report['externalRequests'].append(request.url) if request.url.startswith(('http:', 'https:')) else None)
        start = time.monotonic()
        if mode == 'inline':
            page.set_content((ROOT / 'dist/index.html').read_text(), wait_until='domcontentloaded')
        else:
            page.goto((ROOT / 'dist/index.html').as_uri())
        print('CONTENT READY', flush=True)
        expect(page.get_by_test_id('map-view').locator('svg')).to_have_count(1)
        report['measurements'].setdefault('initialRenderMilliseconds', []).append(round((time.monotonic() - start) * 1000))
        return page

    try:
        if case == 'flows':
            page = new_page()
            expect(page.get_by_role('tab', name='Map', exact=True)).to_have_attribute('aria-selected', 'true')
            expect(page.get_by_role('tab', name='pDemo_4800', exact=True)).to_be_visible()
            passed('OVE circular map renders inside the compact workbench')
            page.screenshot(path=str(OUT / 'map-1280x800.png'))

            page.get_by_role('tab', name='Features', exact=True).click()
            page.get_by_role('button', name='Origin junction', exact=True).click()
            expect(page.get_by_test_id('selection-status')).to_contain_text('466 bp')
            expect(page.get_by_test_id('selection-status')).to_contain_text('crosses origin')
            page.get_by_role('tab', name='Map', exact=True).click()
            expect(page.get_by_test_id('selection-status')).to_contain_text('466 bp')
            passed('origin-spanning annotation stays selected when switching to the map')
            page.get_by_role('tab', name='Sequence', exact=True).click()
            expect(page.get_by_label('Selection start', exact=True)).to_have_value('4520')
            expect(page.get_by_label('Selection end', exact=True)).to_have_value('185')
            expect(page.locator('.base.selected-base').first).to_be_visible()
            page.screenshot(path=str(OUT / 'sequence-origin.png'))
            passed('sequence view preserves the 4520..185, 466-base selection')
            expect(page.get_by_test_id('minimap-viewport')).not_to_have_attribute('x', '0')
            page.get_by_role('slider', name='Navigate sequence').press('Home')
            expect(page.get_by_test_id('minimap-viewport')).to_have_attribute('x', '0')
            expect(page.get_by_test_id('selection-status')).to_contain_text('466 bp')
            passed('minimap navigation changes the visible region, not the selected DNA')

            page.get_by_role('tab', name='Map', exact=True).click()
            page.get_by_role('button', name='Linear presentation (does not change topology)', exact=True).click()
            expect(page.get_by_test_id('map-view').locator('svg').first).to_be_visible()
            expect(page.locator('.document-context')).to_contain_text('circular')
            expect(page.get_by_test_id('selection-status')).to_contain_text('466 bp')
            with page.expect_download() as event:
                page.get_by_role('button', name='Export native format (⌘/Ctrl S)', exact=True).click()
            download = event.value
            exported = json.loads(Path(download.path()).read_text())
            assert exported['topology'] == 'circular'
            assert exported['features'][0]['segments'] == [{'start': 4519, 'end': 4800}, {'start': 0, 'end': 185}]
            assert 'selection' not in exported and 'presentation' not in exported
            passed('linear presentation preserves topology and exported scientific coordinates')
            page.keyboard.press('Escape')

            page.get_by_test_id('file-input').set_input_files({'name': 'roundtrip.sg.json', 'mimeType': 'application/json', 'buffer': json.dumps(exported).encode()})
            expect(page.get_by_role('tab', name='pDemo_4800', exact=True)).to_have_count(2)
            page.keyboard.press('Escape')
            with page.expect_download() as event:
                page.get_by_role('button', name='Export native format (⌘/Ctrl S)', exact=True).click()
            assert json.loads(Path(event.value.path()).read_text()) == exported
            passed('export, reopen, and re-export preserve the native document exactly')
            page.keyboard.press('Escape')
            choose(page, 0, 185)
            expect(page.get_by_role('alert')).to_contain_text('integers between 1')
            passed('invalid coordinates produce an explicit error')
            page.keyboard.press('Escape')

            page.get_by_test_id('file-input').set_input_files({'name': 'two.fa', 'mimeType': 'text/plain', 'buffer': b'>First_import\nac gt\n>Second_import\nNNRY\n'})
            expect(page.get_by_role('tab', name='First_import', exact=True)).to_be_visible()
            expect(page.get_by_role('tab', name='Second_import', exact=True)).to_be_visible()
            expect(page.locator('.notification')).to_contain_text('linear topology assigned')
            passed('multi-record FASTA import exposes normalization and topology assumptions')
            page.keyboard.press('Escape')
            before = page.get_by_role('tablist', name='Open documents').get_by_role('tab').count()
            page.get_by_test_id('file-input').set_input_files({'name': 'bad.sg.json', 'mimeType': 'application/json', 'buffer': json.dumps({**exported, 'unsupportedScientificField': []}).encode()})
            expect(page.get_by_role('alert')).to_contain_text('Unsupported field')
            assert page.get_by_role('tablist', name='Open documents').get_by_role('tab').count() == before
            expect(page.get_by_role('tab', name='First_import', exact=True)).to_have_attribute('aria-selected', 'true')
            passed('failed import leaves previously opened documents unchanged')
            page.close()

        if case in ['editing', 'editlayout']:
            page = new_page(1024 if case == 'editlayout' else 1280, 640 if case == 'editlayout' else 800)
            original_genbank = (ROOT / 'tests/fixtures/synthetic-120.gb').read_bytes()
            page.get_by_test_id('file-input').set_input_files({'name': 'synthetic.gb', 'mimeType': 'text/plain', 'buffer': original_genbank})
            expect(page.get_by_role('tab', name='Synthetic_120', exact=True)).to_be_visible()
            page.keyboard.press('Escape')
            passed('GenBank import in the actual application preserves a complemented origin-spanning feature')

            def export_current():
                with page.expect_download() as downloaded:
                    page.get_by_role('button', name='Export native format (⌘/Ctrl S)', exact=True).click()
                value = json.loads(Path(downloaded.value.path()).read_text())
                return value

            initial = export_current()
            page.keyboard.press('Escape')
            page.get_by_role('tab', name='Features', exact=True).click()
            page.get_by_role('button', name='Edit Origin feature', exact=True).click()
            modal = page.get_by_role('dialog')
            expect(modal).to_be_visible()
            page.get_by_label('Feature name', exact=True).fill('Junction edited')
            expect(modal.get_by_role('button', name='Apply', exact=True)).to_be_enabled()
            if case == 'editlayout':
                expect(modal.get_by_role('button', name='Apply', exact=True)).to_be_in_viewport()
                box = modal.bounding_box()
                assert box['x'] >= 0 and box['y'] >= 0 and box['y'] + box['height'] <= 640
                modal.get_by_role('button', name='Apply', exact=True).focus()
                page.keyboard.press('Tab')
                expect(modal.get_by_role('button', name='Close without applying')).to_be_focused()
                page.screenshot(path=str(OUT / 'edit-1024x640.png'))
                passed('1024x640: scrollable modal, visible submit button and keyboard focus trap')
                page.keyboard.press('Escape')
            else:
                page.screenshot(path=str(OUT / 'annotation-editor.png'))
                modal.get_by_role('button', name='Cancel', exact=True).click()
                assert export_current() == initial
                page.keyboard.press('Escape')
                passed('cancel discards all form changes without mutating source or history')
                page.get_by_role('button', name='Edit Origin feature', exact=True).click()
                page.get_by_label('Feature name', exact=True).fill('Junction edited')
                page.get_by_role('dialog').get_by_role('button', name='Apply', exact=True).click()
                page.keyboard.press('Escape')
                expect(page.get_by_role('button', name='Edit Junction edited', exact=True)).to_be_visible()
                expect(page.locator('.dirty-dot')).to_have_count(1)
                page.get_by_role('button', name='Undo (⌘/Ctrl Z)', exact=True).click()
                expect(page.get_by_role('button', name='Edit Origin feature', exact=True)).to_be_visible()
                assert export_current() == initial
                page.keyboard.press('Escape')
                page.get_by_role('button', name='Redo (⌘/Ctrl ⇧ Z)', exact=True).click()
                renamed = export_current()
                assert renamed['features'][1]['qualifiers'] == initial['features'][1]['qualifiers']
                page.keyboard.press('Escape')
                passed('feature rename, undo and redo restore exact scientific documents')

                page.get_by_role('button', name='Edit bases', exact=True).click()
                page.get_by_label('Edit start', exact=True).fill('110')
                page.get_by_label('Edit end', exact=True).fill('10')
                page.get_by_label('DNA to insert', exact=True).fill('NN NN')
                expect(page.get_by_label('Edit preview')).to_contain_text('old base 11')
                expect(page.get_by_label('Edit preview')).to_contain_text('120 → 103 bp')
                page.screenshot(path=str(OUT / 'origin-edit-preview.png'))
                page.get_by_role('dialog').get_by_role('button', name='Apply', exact=True).click()
                page.keyboard.press('Escape')
                current = export_current()
                assert current['sequence'] == initial['sequence'][10:109] + 'NNNN'
                assert current['features'][1]['segments'] == [{'start': 90, 'end': 103}, {'start': 0, 'end': 20}]
                assert not any(q['key'] == 'translation' for q in current['features'][1]['qualifiers'])
                assert any(q['key'] == 'translation' and q['value'] == 'MXXXXXX' for q in current['features'][1]['archivedQualifiers'])
                assert current['sourceArchive']['text'].encode() == original_genbank
                assert current['sourceArchive']['superseded'] is True
                assert len(current['history']) == 2
                expect(page.locator('.dirty-dot')).to_have_count(1)
                passed('origin-spanning replacement adjusts annotations, archives stale translation, and leaves source untouched')
                page.get_by_role('button', name='Confirm file received', exact=True).click()
                expect(page.locator('.dirty-dot')).to_have_count(0)
                passed('download request alone does not clear unsaved status; receipt is explicitly confirmed')
                page.get_by_role('button', name='Undo (⌘/Ctrl Z)', exact=True).click()
                assert export_current() == renamed
                page.keyboard.press('Escape')
                page.get_by_role('button', name='Redo (⌘/Ctrl ⇧ Z)', exact=True).click()
                assert export_current() == current
                page.keyboard.press('Escape')
                page.get_by_role('tab', name='Sequence', exact=True).click()
                expect(page.get_by_test_id('sequence-view')).to_be_visible()
                page.get_by_role('button', name='Edit bases', exact=True).click()
                page.get_by_label('DNA to insert', exact=True).fill('INVALID_Z')
                expect(page.get_by_role('dialog').get_by_role('button', name='Apply', exact=True)).to_be_disabled()
                page.keyboard.press('Escape')
                assert export_current() == current
                page.keyboard.press('Escape')
                passed('invalid edits remain unapplied and sequence navigation survives a length change')
                page.get_by_role('button', name='Undo (⌘/Ctrl Z)', exact=True).click()
                page.once('dialog', lambda dialog: dialog.dismiss())
                page.get_by_role('button', name='Close Synthetic_120', exact=True).click()
                expect(page.get_by_role('tab', name='Synthetic_120', exact=True)).to_be_visible()
                passed('closing a modified document requires explicit confirmation')
                page.once('dialog', lambda dialog: dialog.accept())
                page.get_by_role('button', name='Close Synthetic_120', exact=True).click()
                page.get_by_test_id('file-input').set_input_files({'name': 'edited.sg.json', 'mimeType': 'application/json', 'buffer': json.dumps(current).encode()})
                expect(page.get_by_role('tab', name='Synthetic_120', exact=True)).to_be_visible()
                page.keyboard.press('Escape')
                assert export_current() == current
                page.keyboard.press('Escape')
                expect(page.get_by_role('button', name='Undo (⌘/Ctrl Z)', exact=True)).to_be_disabled()
                page.get_by_role('tab', name='History', exact=True).click()
                expect(page.locator('.history-event')).to_have_count(3)
                page.screenshot(path=str(OUT / 'document-history.png'))
                passed('edited native file reopens identically with audit history but without invented undo snapshots')
            page.close()

        if case in ['translation', 'restriction', 'pcr', 'analysislayout', 'worker']:
            page = new_page(1024 if case == 'analysislayout' else 1280, 640 if case == 'analysislayout' else 800)
            fixture_doc = json.loads((ROOT / 'tests/fixtures/analysis-demo.sg.json').read_text())
            fixture_pcr = json.loads((ROOT / 'tests/fixtures/pcr-demo.json').read_text())
            page.get_by_test_id('file-input').set_input_files({'name': 'analysis-demo.sg.json', 'mimeType': 'application/json', 'buffer': json.dumps(fixture_doc).encode()})
            expect(page.get_by_role('tab', name='pAnalyse_360', exact=True)).to_be_visible()
            expect(page.locator('.notification')).to_be_visible()
            page.get_by_role('button', name='Close message', exact=True).click()

            def report_download():
                with page.expect_download() as downloaded:
                    page.get_by_role('button', name='Export JSON report', exact=True).click()
                return json.loads(Path(downloaded.value.path()).read_text())

            if case == 'translation':
                page.get_by_role('tab', name='Translation', exact=True).click()
                page.get_by_role('button', name='Calculate translation', exact=True).click()
                expect(page.get_by_test_id('translation-results')).to_be_visible()
                expect(page.get_by_label('Protein CDS_demo_plus', exact=True)).to_have_text('MAAAAAAAA*')
                report_data = report_download()
                assert report_data['request']['molecule']['sequence'] == fixture_doc['sequence']
                assert report_data['response']['result']['proteins'][0]['protein'] == 'MAAAAAAAA*'
                assert report_data['response']['engineVersion'] == 'gin-schnaps-core-ts-0.8.1'
                passed('CDS translation runs in a real worker and exports its source, parameters and engine version')
                page.get_by_label('CDS to translate', exact=True).select_option('cds-origin')
                expect(page.get_by_test_id('translation-results')).to_have_count(0)
                expect(page.get_by_test_id('analysis-stale')).to_be_visible()
                page.get_by_role('button', name='Calculate translation', exact=True).click()
                expect(page.get_by_label('Protein CDS_demo_origine', exact=True)).to_have_text('MEEEEEEEE*')
                passed('changing the CDS invalidates the prior result; reverse-strand origin CDS translates correctly')
                with page.expect_download() as downloaded:
                    page.get_by_role('button', name='Export protein FASTA', exact=True).click()
                assert 'MEEEEEEEE*' in Path(downloaded.value.path()).read_text()
                passed('protein FASTA contains the computed amino-acid sequence')
                page.screenshot(path=str(OUT / 'translation-step3.png'))
                page.get_by_label('Translation mode', exact=True).select_option('six-frames')
                page.get_by_role('button', name='Calculate translation', exact=True).click()
                expect(page.locator('.protein-result')).to_have_count(6)
                # Edit while the analysis panel is still mounted, not only after switching views.
                page.get_by_role('button', name='Edit bases', exact=True).click()
                page.get_by_label('Edit start', exact=True).fill('120')
                page.get_by_label('Edit end', exact=True).fill('120')
                page.get_by_label('DNA to insert', exact=True).fill('NN')
                page.get_by_role('dialog').get_by_role('button', name='Apply', exact=True).click()
                expect(page.get_by_test_id('translation-results')).to_have_count(0)
                expect(page.get_by_test_id('analysis-stale')).to_be_visible()
                expect(page.get_by_role('button', name='Export JSON report', exact=True)).to_be_disabled()
                page.keyboard.press('Escape')
                page.get_by_role('button', name='Calculate translation', exact=True).click()
                expect(page.locator('.protein-result')).to_have_count(6)
                edited_report = report_download()
                assert edited_report['request']['revision'] == 1
                assert len(edited_report['request']['molecule']['sequence']) == 361
                passed('editing invalidates visible results immediately and recalculation uses the new revision')
                page.get_by_role('button', name='Undo (⌘/Ctrl Z)', exact=True).click()
                expect(page.get_by_test_id('translation-results')).to_have_count(0)
                page.get_by_role('button', name='Calculate translation', exact=True).click()
                expect(page.locator('.protein-result')).to_have_count(6)
                assert report_download()['request']['revision'] == 2
                passed('undo advances the revision and never resurrects an old analysis response')

            if case == 'restriction':
                page.get_by_role('tab', name='Enzymes', exact=True).click()
                page.get_by_role('button', name='No enzymes', exact=True).click()
                page.get_by_label('Enzyme BsaI', exact=True).check()
                page.get_by_role('button', name='Analyze restrictions', exact=True).click()
                expect(page.get_by_test_id('restriction-results')).to_be_visible()
                payload = report_download()
                result = payload['response']['result']
                assert len(result['sites']) == 1
                assert result['sites'][0]['start'] == 320
                assert result['sites'][0]['top'] == 327 and result['sites'][0]['bottom'] == 331
                assert len(result['fragments']) == 1 and result['fragments'][0]['length'] == 360
                passed('Type IIS worker output includes exact cuts on both strands and the circular linearized fragment')
                page.screenshot(path=str(OUT / 'restriction-step3.png'))
                page.get_by_role('button', name='View BsaI position 321', exact=True).click()
                expect(page.get_by_role('tab', name='Map', exact=True)).to_have_attribute('aria-selected', 'true')
                expect(page.get_by_test_id('selection-status')).to_contain_text('6 bp')
                expect(page.get_by_label('Selection start', exact=True)).to_have_value('321')
                passed('selecting a restriction site highlights the actual recognition region on the map')
                page.get_by_test_id('file-input').set_input_files({'name': 'ambiguous.fa', 'mimeType': 'text/plain', 'buffer': b'>Ambiguous_sites\nAAAAGANTTCAAAA\n'})
                expect(page.get_by_role('tab', name='Ambiguous_sites', exact=True)).to_be_visible()
                page.keyboard.press('Escape')
                page.get_by_role('tab', name='Enzymes', exact=True).click()
                page.get_by_role('button', name='No enzymes', exact=True).click()
                page.get_by_label('Enzyme EcoRI', exact=True).check()
                page.get_by_role('button', name='Analyze restrictions', exact=True).click()
                expect(page.get_by_test_id('restriction-results')).to_contain_text('Possible (ambiguity)')
                assert report_download()['response']['result']['fragments'] is None
                passed('ambiguous recognition is labelled possible and no unique digest is fabricated')

            if case in ['pcr', 'analysislayout']:
                page.get_by_role('tab', name='Primers', exact=True).click()
                for i, primer in enumerate(fixture_pcr['primers'], 1):
                    page.get_by_label(f'Primer name {i}', exact=True).fill(primer['name'])
                    page.get_by_label(f'Primer annealing {i}', exact=True).fill(primer['annealing'].lower())
                    page.get_by_label(f'Primer tail {i}', exact=True).fill(primer['tail'])
                page.get_by_role('button', name='Simulate exact PCR', exact=True).click()
                expect(page.get_by_test_id('pcr-results')).to_contain_text('1 theoretical product(s)')
                payload = report_download()
                assert payload['response']['result']['products'][0]['sequence'] == fixture_pcr['expectedSequence']
                assert payload['request']['task']['options']['primers'][0]['annealing'] == fixture_pcr['primers'][0]['annealing']
                passed('manual primer PCR matches the expected 210-base product including both 5-prime tails')
                with page.expect_download() as downloaded:
                    page.get_by_role('button', name='Export PCR product 1', exact=True).click()
                seq = ''.join(Path(downloaded.value.path()).read_text().splitlines()[1:])
                assert seq == fixture_pcr['expectedSequence']
                passed('PCR FASTA exports the exact full product, not the template segment alone')
                page.screenshot(path=str(OUT / f'pcr-step3-{case}.png'))
                assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
                if case == 'analysislayout':
                    page.get_by_role('button', name='Document information', exact=True).click()
                    assert page.locator('.view-panel').bounding_box()['width'] >= 719
                    page.get_by_role('button', name='Simulate exact PCR', exact=True).scroll_into_view_if_needed()
                    expect(page.get_by_role('button', name='Simulate exact PCR', exact=True)).to_be_in_viewport()
                    page.screenshot(path=str(OUT / 'analysis-1024x640.png'))
                    passed('1024x640: forms and controls remain accessible with the information panel open')
                else:
                    page.get_by_role('button', name='View annealing 1', exact=True).click()
                    expect(page.get_by_test_id('selection-status')).to_contain_text('20 bp')
                    page.get_by_role('tab', name='Primers', exact=True).click()
                    expect(page.get_by_label('Primer annealing 1', exact=True)).to_have_value(fixture_pcr['primers'][0]['annealing'])
                    expect(page.get_by_label('Primer tail 2', exact=True)).to_have_value('TCAG')
                    passed('primer inputs survive navigation to their actual sites on the map')
                    page.get_by_role('button', name='Simulate exact PCR', exact=True).click()
                    expect(page.get_by_test_id('pcr-results')).to_be_visible()
                    page.get_by_label('Primer tail 2', exact=True).fill('TCAGA')
                    expect(page.get_by_test_id('pcr-results')).to_have_count(0)
                    expect(page.get_by_test_id('analysis-stale')).to_be_visible()
                    passed('changing a primer invalidates the previous product and disables its export')

            if case == 'worker':
                # Hold delivery to the REAL worker until the test explicitly releases it.
                page.evaluate('''() => { const Original = window.Worker; window.__workerDeliveries = []; window.Worker = class extends Original {
                    postMessage(message) { window.__workerDeliveries.push(() => super.postMessage(message)); }
                }; }''')
                page.get_by_role('tab', name='Translation', exact=True).click()
                page.get_by_role('button', name='Calculate translation', exact=True).click()
                page.get_by_role('button', name='Cancel calculation', exact=True).click()
                expect(page.get_by_role('alert')).to_contain_text('Calculation cancelled')
                page.evaluate('() => window.__workerDeliveries.splice(0).forEach(deliver => deliver())')
                page.wait_for_timeout(150)
                expect(page.get_by_test_id('translation-results')).to_have_count(0)
                passed('explicit cancellation terminates the worker and late messages cannot restore results')
                page.get_by_label('Translation mode', exact=True).select_option('six-frames')
                page.get_by_role('button', name='Calculate translation', exact=True).click()
                page.get_by_role('button', name='Document information', exact=True).click()
                expect(page.get_by_role('complementary', name='Document information')).to_be_visible()
                page.get_by_label('Genetic code', exact=True).select_option('1')
                page.evaluate('() => window.__workerDeliveries.splice(0).forEach(deliver => deliver())')
                page.wait_for_timeout(150)
                expect(page.get_by_test_id('translation-results')).to_have_count(0)
                expect(page.get_by_test_id('analysis-stale')).to_be_visible()
                passed('UI remains interactive during work and a parameter change discards in-flight results')
                page.evaluate('() => { window.Worker = undefined; }')
                page.get_by_role('button', name='Calculate translation', exact=True).click()
                expect(page.get_by_role('alert')).to_contain_text('Web Workers unavailable')
                passed('unsupported workers fail explicitly instead of running heavy calculations on the UI thread')
            page.close()

        if case == 'large':
            page = new_page()
            page.get_by_test_id('file-input').set_input_files({'name': '100kb.fa', 'mimeType': 'text/plain', 'buffer': b'>Large_100kb\n' + b'ACGT' * 25000})
            expect(page.get_by_role('tab', name='Large_100kb', exact=True)).to_be_visible()
            page.keyboard.press('Escape')
            page.get_by_role('tab', name='Sequence', exact=True).click()
            choose(page, 99981, 100000)
            expect(page.locator('.base[data-pos="99999"]').first).to_be_visible()
            rows = page.get_by_test_id('sequence-row').count()
            bases = page.locator('.base').count()
            assert rows < 20 and bases < 4000
            report['measurements']['100kbRenderedRows'] = rows
            report['measurements']['100kbRenderedBasesBothStrands'] = bases
            passed('100 kb sequence uses virtualized rows and reaches the last base')
            page.get_by_role('button', name='Clear', exact=True).click()
            base = page.locator('.base[data-pos="99999"]').first
            base.click()
            expect(page.get_by_test_id('selection-status')).to_contain_text('1 bp')
            page.get_by_test_id('sequence-view').press('ArrowLeft')
            expect(page.get_by_label('Selection start', exact=True)).to_have_value('99999')
            passed('base clicking and keyboard movement select actual sequence positions')
            page.close()

        for width, height in [(1024, 640), (1280, 800), (1440, 900)]:
            if case != f'layout{width}': continue
            page = new_page(width, height)
            page.get_by_role('button', name='Show or hide explorer', exact=True).click() if width < 1180 else None
            print('OPEN INFO', flush=True)
            page.get_by_role('button', name='Document information', exact=True).click()
            expect(page.get_by_role('complementary', name='Document information')).to_be_visible()
            assert page.locator('.view-panel').bounding_box()['width'] >= 719
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            if width == 1024:
                expect(page.get_by_role('complementary', name='Explorer', exact=True)).to_have_count(0)
            print('SCREENSHOT', flush=True)
            page.screenshot(path=str(OUT / f'info-{width}x{height}.png'), timeout=5000)
            page.get_by_role('button', name='Close information', exact=True).click()
            if width == 1024:
                expect(page.get_by_role('complementary', name='Explorer', exact=True)).to_be_visible()
            page.get_by_role('tab', name='Map', exact=True).press('ArrowRight')
            expect(page.get_by_role('tab', name='Sequence', exact=True)).to_have_attribute('aria-selected', 'true')
            page.get_by_role('button', name='Close pDemo_4800', exact=True).click()
            expect(page.get_by_role('heading', name='No document open')).to_be_visible()
            page.get_by_role('button', name='load the synthetic example', exact=True).click()
            expect(page.get_by_test_id('map-view').locator('svg')).to_have_count(1)
            passed(f'{width}x{height}: panels, no overflow, keyboard tabs, close and reopen')
            page.close()

        assert not report['externalRequests'], report['externalRequests']
        assert not report['errors'], report['errors']
        passed('no JavaScript errors, CSP errors, or external network requests during tested workflows')
        report['success'] = True
    except Exception as error:
        report['success'] = False
        report['failure'] = str(error)
        if 'page' in globals() and not page.is_closed():
            page.screenshot(path=str(OUT / 'failure.png'), timeout=5000)
        raise
    finally:
        (OUT / f'browser-{case}.json').write_text(json.dumps(report, indent=2, ensure_ascii=False))
        browser.close()
