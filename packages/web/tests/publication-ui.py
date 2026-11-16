import json
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

# Simulação exclusiva do navegador: nenhum produto, estoque ou configuração real muda.
root = Path(__file__).resolve().parents[3]
port = json.loads((root / '.runable/ports.json').read_text())['website']
coffees, merch, saves, retries, settings = [], [], [], [], []
shots = Path(tempfile.mkdtemp(prefix='kalango-publication-'))

def rpc(route):
    name = route.request.url.split('/api/rpc/')[-1].split('?')[0]
    body = route.request.post_data_json or {}
    payload = body.get('json', body)
    result = []
    if name == 'admin/summary':
        result = dict(total=0, aFazer=0, faturadoCents=0, leads=0, testes=0, porStatus=[])
    elif name == 'admin/coffeeList':
        result = coffees
    elif name == 'admin/merchList':
        result = merch
    elif name in ['admin/coffeeSave', 'admin/merchSave']:
        item = payload['item']
        saves.append((name, item))
        assert item['creationKey']
        result = dict(item, id=1 if name == 'admin/coffeeSave' else 2, blingId=None,
                      sku='KG-CF-TESTE' if name == 'admin/coffeeSave' else 'KG-LS-TESTE',
                      publicationStatus='error', publicationError='Escolha o depósito na aba Bling.',
                      productAttempted=False, images=item.get('images', []), notes=item.get('notes', []),
                      stock=item.get('stock', 0), sizes=item.get('sizes', []), featured=False, active=True)
        (coffees if name == 'admin/coffeeSave' else merch).append(result)
    elif name == 'admin/retryPublication':
        retries.append(payload)
        result = (coffees if payload['kind'] == 'coffee' else merch)[0]
        result.update(publicationStatus='ready', publicationError=None, blingId=888 if payload['kind'] == 'coffee' else 999)
    elif name == 'bling/status':
        result = dict(configured=True, connected=True, needsReconnect=False, companyName=None,
                      lastSync=None, lastError=None, lastSyncAt=None, syncing=False, pendingOrders=[], products=[],
                      settings=dict(cafeCategoryId=None, initialDepositId=None, lojaId=None, formaPagamentoId=None),
                      redirectUrl='https://preview.example/api/bling/callback', webhookUrl='https://preview.example/api/webhooks/bling')
    elif name == 'bling/options':
        result = dict(categorias=[], canais=[], formas=[], depositos=[dict(id=7, nome='Geral')])
    elif name == 'bling/saveSettings':
        settings.append(payload)
        result = dict(ok=True)
    route.fulfill(status=200, content_type='application/json', body=json.dumps({'json': result}))

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    page.route('**/api/rpc/**', rpc)
    page.add_init_script("localStorage.setItem('kalango.ops.token', 'teste-interface')")
    page.goto(f'http://localhost:{port}/gestao?aba=cafes')
    page.add_style_tag(content='.dev-modal { pointer-events: none !important; }')
    page.get_by_role('button', name='Novo café', exact=True).click()
    page.get_by_label('Nome do café', exact=True).fill('Café automático')
    page.get_by_label('Preço (R$)', exact=True).fill('49,90')
    page.get_by_label('Estoque', exact=True).fill('12')
    page.get_by_role('button', name='Adicionar café', exact=True).click()
    page.get_by_text('Rascunho · fora da loja até confirmar no Bling', exact=False).wait_for()
    page.get_by_text('Escolha o depósito na aba Bling.', exact=True).wait_for()
    page.screenshot(path=str(shots / 'cafe-rascunho.png'), full_page=True)
    page.get_by_role('button', name='Tentar novamente no Bling', exact=True).click()
    page.get_by_text('Bling #888', exact=False).wait_for()
    assert retries[0]['kind'] == 'coffee'
    page.get_by_role('button', name='Lifestyle', exact=True).click()
    page.get_by_role('button', name='Novo produto', exact=True).click()
    page.get_by_label('Nome do produto', exact=True).fill('Boné automático')
    page.get_by_role('button', name='Adicionar produto', exact=True).click()
    page.get_by_text('Informe um preço maior que zero, inclusive para produtos em breve.', exact=False).wait_for()
    assert len(saves) == 1
    page.get_by_label('Preço', exact=True).fill('89,90')
    page.get_by_role('button', name='Adicionar produto', exact=True).click()
    page.get_by_text('Rascunho · fora da loja até confirmar no Bling', exact=False).wait_for()
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.screenshot(path=str(shots / 'lifestyle-mobile.png'), full_page=True)
    page.get_by_role('button', name='Tentar novamente no Bling', exact=True).click()
    page.get_by_text('Bling #999', exact=False).wait_for()
    page.get_by_role('button', name='Editar Boné automático', exact=True).click()
    assert page.get_by_label('Preço', exact=True).is_disabled()
    assert page.get_by_label('Nome do produto', exact=True).is_disabled()
    page.get_by_role('button', name='Bling', exact=True).click()
    page.get_by_label('Depósito do estoque inicial', exact=True).select_option('7')
    page.get_by_role('button', name='Salvar escolhas', exact=True).click()
    page.get_by_text('Salvo.', exact=True).wait_for()
    assert settings[0]['initialDepositId'] == 7
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    print('OK: preço obrigatório, chave de cadastro, rascunhos, retry, vínculo nas duas abas, campos ERP protegidos, depósito e mobile. API totalmente simulada.')
    browser.close()