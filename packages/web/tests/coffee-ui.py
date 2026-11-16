import json
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

# Respostas simuladas somente neste navegador; não toca dados de produção.
row = dict(id=1, name="Café do Bling", slug="cafe-do-bling", blingId=123,
           priceCents=4990, stock=12, active=True, sku="TESTE", description="Descrição ERP",
           notes=["Doce", "Chocolate"], images=[], featured=False, position=0,
           weightGrams=250, publicationStatus="legacy", publicationError=None, productAttempted=False)
saved = []
root = Path(__file__).resolve().parents[3]
port = json.loads((root / ".runable/ports.json").read_text())["website"]
screenshots = Path(tempfile.mkdtemp(prefix="kalango-cafes-"))

def rpc(route):
    name = route.request.url.split("/api/rpc/")[-1].split("?")[0]
    result = []
    if name == "admin/summary":
        result = dict(total=0, aFazer=0, faturadoCents=0, leads=0, testes=0, porStatus=[])
    elif name == "admin/coffeeList":
        result = [row]
    elif name == "admin/coffeeSave":
        saved.append(route.request.post_data_json)
        result = row
    elif name == "admin/check":
        result = dict(ok=True, emailReady=False)
    route.fulfill(status=200, content_type="application/json", body=json.dumps({"json": result}))

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.route("**/api/rpc/**", rpc)
    page.add_init_script("localStorage.setItem('kalango.ops.token', 'teste-interface')")
    page.goto(f"http://localhost:{port}/gestao")
    page.get_by_role("button", name="Cafés", exact=True).click()
    page.get_by_role("button", name="Novo café", exact=True).click()
    page.get_by_label("Nome do café", exact=True).fill("Café São João")
    assert page.get_by_label("Endereço (slug)", exact=True).input_value() == "cafe-sao-joao"
    page.get_by_label("Preço (R$)", exact=True).fill("49,90")
    page.get_by_label("Estoque", exact=True).fill("10")
    page.screenshot(path=str(screenshots / "desktop.png"), full_page=True)
    page.get_by_role("button", name="Adicionar café", exact=True).click()
    page.get_by_role("button", name="Editar Café do Bling", exact=True).click()
    page.get_by_text("Vem do Bling (edite lá)", exact=True).wait_for()
    assert page.get_by_label("Nome do café", exact=True).count() == 0
    assert page.get_by_role("button", name="Soltar ou escolher fotos", exact=True).count() == 1
    page.get_by_role("button", name="Salvar alterações", exact=True).click()
    page.get_by_role("button", name="Novo café", exact=True).click()
    page.set_viewport_size({"width": 390, "height": 844})
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    page.screenshot(path=str(screenshots / "mobile.png"), full_page=True)
    assert len(saved) == 2, saved
    print("Interface OK: criar anúncio, slug automático, salvar, editar Bling, fotos e layout móvel.")
    browser.close()