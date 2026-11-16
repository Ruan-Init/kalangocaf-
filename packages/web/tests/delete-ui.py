import json
from pathlib import Path
from playwright.sync_api import sync_playwright

# Intercepta a API somente neste navegador. Não exclui dados reais.
root = Path(__file__).resolve().parents[3]
port = json.loads((root / ".runable/ports.json").read_text())["website"]
coffee = dict(id=111, name="Café de teste", slug="cafe-de-teste", blingId=123,
              priceCents=4990, stock=10, weightGrams=250, active=True, notes=[],
              images=[], featured=False, position=0, sku="TESTE", publicationStatus="legacy", publicationError=None)
merch = dict(id=222, name="Boné de teste", slug="bone-de-teste", category="bone",
             tone="jungle", images=[], sizes=[], priceCents=4990, released=False,
             published=True, active=True, position=0, blingId=None, sku=None, publicationStatus="legacy", publicationError=None)
coffees, products, deleted = [coffee], [merch], []

def rpc(route):
    name = route.request.url.split("/api/rpc/")[-1].split("?")[0]
    result = []
    if name == "admin/summary":
        result = dict(total=0, aFazer=0, faturadoCents=0, leads=0, testes=0, porStatus=[])
    elif name == "admin/coffeeList":
        result = coffees
    elif name == "admin/merchList":
        result = products
    elif name == "admin/coffeeRemove":
        deleted.append(name)
        coffees.clear()
        result = dict(ok=True)
    elif name == "admin/merchRemove":
        deleted.append(name)
        products.clear()
        result = dict(ok=True)
    route.fulfill(status=200, content_type="application/json", body=json.dumps({"json": result}))

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.route("**/api/rpc/**", rpc)
    page.add_init_script("localStorage.setItem('kalango.ops.token', 'teste-interface')")
    page.goto(f"http://localhost:{port}/gestao?aba=cafes")
    # O aviso de diagnóstico de analytics no localhost pode cobrir o rodapé.
    page.add_style_tag(content=".dev-modal { pointer-events: none !important; }")
    page.get_by_role("button", name="Excluir Café de teste", exact=True).click()
    confirmation = page.get_by_role("group", name="Confirmar exclusão de Café de teste", exact=True)
    confirmation.get_by_text("Uma nova sincronização", exact=False).wait_for()
    assert not deleted
    confirmation.get_by_role("button", name="Cancelar", exact=True).click()
    assert confirmation.count() == 0
    assert not deleted
    page.get_by_role("button", name="Excluir Café de teste", exact=True).click()
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    confirmation.get_by_role("button", name="Confirmar exclusão", exact=True).click()
    page.get_by_text('Nenhum café ainda. Clique em "Novo café" ou "Puxar do Bling".', exact=True).wait_for()
    assert deleted == ["admin/coffeeRemove"]
    page.get_by_role("button", name="Lifestyle", exact=True).click()
    page.get_by_role("button", name="Excluir Boné de teste", exact=True).click()
    confirmation = page.get_by_role("group", name="Confirmar exclusão de Boné de teste", exact=True)
    assert deleted == ["admin/coffeeRemove"]
    confirmation.get_by_role("button", name="Cancelar", exact=True).click()
    page.get_by_role("button", name="Excluir Boné de teste", exact=True).click()
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    confirmation.get_by_role("button", name="Confirmar exclusão", exact=True).click()
    page.get_by_text('Nenhum produto lifestyle cadastrado. Clique em "Novo produto".', exact=True).wait_for()
    assert deleted == ["admin/coffeeRemove", "admin/merchRemove"]
    print("OK: Excluir visível nas duas abas, cancelar sem apagar, confirmar, lista atualizada e layout móvel.")
    browser.close()