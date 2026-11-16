import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

# Somente leituras reais. Toda simulação de checkout é interceptada no navegador.
root = Path(__file__).resolve().parents[3]
port = json.loads((root / '.runable/ports.json').read_text())['website']
base = f'http://127.0.0.1:{port}'
cart = [dict(slug='cafe-kalangoalquimia-250g', name='Café de interface', image=None,
             unitCents=9500, grind='Grãos', quantity=1)]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    page = browser.new_page()
    page.goto(base)
    expect(page.get_by_text('Torrefação de microlotes do Cerrado')).to_be_visible()
    assert 'API Status: Pong!' not in page.locator('body').inner_text()
    page.evaluate('(cart) => localStorage.setItem("kalango.cart.v1", JSON.stringify(cart))', cart)
    page.goto(base + '/checkout')
    expect(page.get_by_role('alert')).to_contain_text('Pagamento online indisponível')
    expect(page.get_by_role('button', name='Ir para o pagamento')).to_be_disabled()
    page.close()

    for env in ['production', 'test', 'disabled']:
        for width in [1280, 390]:
            ctx = browser.new_context(viewport={'width': width, 'height': 900})
            ctx.add_init_script('localStorage.setItem("kalango.cart.v1", ' + json.dumps(json.dumps(cart)) + ')')
            writes = []

            def rpc(route):
                name = route.request.url.split('/api/rpc/')[-1].split('?')[0]
                result = []
                if name == 'orders/paymentConfig':
                    result = dict(env=env, maxInstallments=3)
                elif name == 'orders/shippingOptions':
                    result = dict(options=[dict(id='pac', label='PAC', cents=2590, days=5)], source='estimate', live=False, freeFrom=30000)
                elif name == 'orders/quote':
                    result = dict(items=[], missing=[], outOfStock=[], subtotalCents=9500, shippingCents=2590, totalCents=12090, shippingLabel='PAC')
                elif name in ['orders/create', 'orders/resumePayment']:
                    writes.append(name)
                    route.abort()
                    return
                route.fulfill(status=200, content_type='application/json', body=json.dumps({'json': result}))

            ctx.route('**/api/rpc/**', rpc)
            pg = ctx.new_page()
            pg.goto(base + '/checkout')
            button = pg.get_by_role('button', name='Ir para o pagamento')
            if env == 'disabled':
                expect(button).to_be_disabled()
                expect(pg.get_by_role('alert')).to_contain_text('Pagamento online indisponível')
            else:
                expect(button).to_be_enabled()
            banner = pg.get_by_text('Ambiente de teste — use apenas contas e cartões de teste.', exact=True)
            expect(banner).to_have_count(1 if env == 'test' else 0)
            assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            assert not writes
            ctx.close()
    browser.close()
    print('UI OK: Kalango correto, bloqueio real sem webhook; produção/teste/desativado em desktop/mobile, zero criação de pedidos.')