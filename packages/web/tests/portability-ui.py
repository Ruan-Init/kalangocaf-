"""Read-only UI smoke test against the running app. No purchases or ERP writes."""
import json
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[3]
port = subprocess.check_output(['bun', '--print', "require('./__ports.cjs').website"], cwd=root, text=True).strip()
base = f'http://127.0.0.1:{port}'
token = subprocess.check_output(['bun', '--env-file=.env', '--print', 'process.env.OPS_TOKEN'], cwd=root, text=True).strip()
assert token and token != 'undefined', 'OPS_TOKEN missing'
errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = browser.new_context(viewport={'width': 1440, 'height': 960})
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(base, wait_until='networkidle')
    expect(page.get_by_text('Torrefação de microlotes do Cerrado', exact=False).first).to_be_visible()
    page.screenshot(path='/home/user/kalango-home.png', full_page=True)
    for route in ['/loja', '/sobre', '/clube', '/conheca-seu-cafe', '/contato']:
        page.goto(base + route, wait_until='networkidle')
        assert page.locator('h1').count() >= 1, route
        images = page.locator('img')
        for i in range(images.count()):
            img = images.nth(i)
            if not img.is_visible():
                continue
            img.scroll_into_view_if_needed()
            expect(img).to_have_js_property('complete', True, timeout=15000)
            assert img.evaluate('(el) => el.naturalWidth > 0'), 'Broken image on ' + route
        print('UI OK:', route, 'images checked')
    page.goto(base + '/loja', wait_until='networkidle')
    product_links = page.locator('a[href^="/cafe/"]')
    assert product_links.count() >= 10, 'Catalog missing products'
    href = product_links.first.get_attribute('href')
    page.goto(base + href, wait_until='networkidle')
    add = page.get_by_role('button', name='Adicionar ao carrinho')
    expect(add).to_be_enabled()
    add.click()
    page.goto(base + '/checkout', wait_until='networkidle')
    button = page.get_by_role('button', name='Ir para o pagamento')
    expect(button).to_be_enabled(timeout=30000)
    assert page.get_by_role('alert').count() == 0, 'Checkout has a blocking alert'
    print('UI OK: product, cart, production checkout enabled; no order submitted')
    page.goto(base + '/gestao', wait_until='networkidle')
    page.get_by_label('Senha de operação').fill(token)
    page.get_by_role('button', name='Abrir painel').click()
    expect(page.get_by_role('button', name='Sair', exact=False)).to_be_visible(timeout=30000)
    expect(page.get_by_text('Pedidos', exact=True).first).to_be_visible()
    print('UI OK: real Gestão authentication and read-only dashboard')
    ctx.close()
    mobile = browser.new_context(viewport={'width': 390, 'height': 844})
    pg = mobile.new_page()
    pg.on('pageerror', lambda e: errors.append(str(e)))
    for route in ['/', '/loja', '/gestao']:
        pg.goto(base + route, wait_until='networkidle')
        assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Horizontal overflow on ' + route
    print('UI OK: mobile home, store, Gestão')
    mobile.close()
    browser.close()
assert not errors, json.dumps(errors)
print('Portability UI PASS; no browser runtime errors; no customer/ERP/payment writes.')