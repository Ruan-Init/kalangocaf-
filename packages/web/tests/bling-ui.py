from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright

# Login somente na própria prévia. A autorização externa é interceptada;
# não conecta contas, sincroniza produtos nem envia pedidos como teste.
root = Path(__file__).resolve().parents[3]
values = {}
for line in (root / ".env").read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        values[k] = v.strip().strip("\"'")
base = values["WEBSITE_URL"].rstrip("/")

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    context.route("**://www.bling.com.br/Api/v3/oauth/authorize**", lambda route:
                  route.fulfill(status=200, content_type="text/plain", body="Autorização interceptada pelo teste."))
    page = context.new_page()
    page.goto(base + "/gestao?aba=bling")
    page.get_by_label("Senha de operação").fill(values["OPS_TOKEN"])
    page.get_by_role("button", name="Abrir painel", exact=True).click()
    page.get_by_text(base + "/api/bling/callback", exact=True).wait_for()
    connected = page.get_by_role("button", name="Reconectar", exact=True).count() > 0
    if connected:
        page.get_by_label("Depósito do estoque inicial", exact=True).wait_for()
    else:
        page.get_by_text("Credenciais configuradas · falta autorizar a conta", exact=True).wait_for()
    with page.expect_popup() as opened:
        page.get_by_role("button", name="Reconectar" if connected else "Conectar ao Bling", exact=True).click()
    popup = opened.value
    popup.wait_for_url("**/Api/v3/oauth/authorize?**")
    query = parse_qs(urlparse(popup.url).query)
    assert query["redirect_uri"] == [base + "/api/bling/callback"]
    assert query["response_type"] == ["code"]
    assert query.get("state")
    page.get_by_text("Autorize sua conta na nova aba. Depois volte aqui para conferir a conexão.", exact=True).wait_for()
    page.set_viewport_size({"width": 390, "height": 844})
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    print("Bling: instruções visíveis, callback público correto e autorização em nova aba verificados.")
    browser.close()