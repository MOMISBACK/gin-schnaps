"""Capture the real, synthetic default view for the repository's user guide."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright, expect
root=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    options={'headless':True}
    if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
    browser=p.chromium.launch(**options)
    page=browser.new_page(viewport={'width':1280,'height':800},device_scale_factor=1)
    if os.environ.get('GIN_SCHNAPS_TEST_MODE')=='inline':
        page.set_content((root/'dist/index.html').read_text(),wait_until='domcontentloaded')
    else:page.goto((root/'dist/index.html').as_uri())
    expect(page.get_by_test_id('map-view').locator('svg')).to_have_count(1)
    expect(page.locator('.brand')).to_contain_text('Gin Schnaps')
    assert ('snap'+'gene') not in page.locator('body').inner_text().lower()
    out=root/'docs/images/overview.png';out.parent.mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(out))
    browser.close()
