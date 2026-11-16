# Kalango Cafés Especiais — Site e Loja

## Execução fora do Runable — pacote revisado em 16/11/2026

Leia **[LEIA-PRIMEIRO.md](LEIA-PRIMEIRO.md)** para VS Code, Bun, Hostinger, DNS do Resend e webhooks.

Na raiz do projeto, com Bun instalado e o `.env` preenchido:

```sh
bun install --frozen-lockfile
bun run dev
```

Abra `http://localhost:4200`. O mesmo processo serve **site + API**. Não use Live Server, `file://`, apenas `dist/` numa hospedagem estática nem `vite preview` para testar Gestão/checkout.

Produção com processo Bun persistente e proxy HTTPS:

```sh
bun run build
bun run serve
```

O diagnóstico `bun run check:config` consulta integrações sem alterar banco ou enviar e-mails/cobranças. Resend com DNS pendente faz esse comando retornar erro propositalmente.

**Não publique o `.env` no GitHub.** O arquivo é ignorado pelo Git e deve ser configurado separadamente no servidor. Não execute seed no banco de produção.

As seções abaixo são a documentação original do repositório, incluindo seu histórico. Para o estado desta cópia e os bloqueios externos atuais, consulte LEIA-PRIMEIRO.md.

Site institucional, loja online e painel de gestão da **Kalango Cafés Especiais**, torrefação de microlotes do Cerrado em Brasília (SHIN CA3 Lotes 33/34, Loja 7 — Lago Norte, DF).

- Prévia: `https://kalango-nm8ta9a-preview-4200.runable.site`
- Domínio definitivo (vai substituir o WordPress atual): `https://kalangocafe.com.br`
- Contato público: kalangocafe@gmail.com · WhatsApp +55 61 99593-7582 · Instagram [@kalango_cafe](https://www.instagram.com/kalango_cafe/)

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Páginas públicas](#2-páginas-públicas)
3. [Carrinho, checkout e pagamento](#3-carrinho-checkout-e-pagamento)
4. [Frete](#4-frete)
5. [E-mails automáticos](#5-e-mails-automáticos)
6. [Painel de Gestão](#6-painel-de-gestão-gestao)
7. [Newsletter](#7-newsletter)
8. [Integração Bling (ERP)](#8-integração-bling-erp)
9. [SEO e feeds](#9-seo-e-feeds)
10. [Tecnologia e estrutura](#10-tecnologia-e-estrutura)
11. [Variáveis de ambiente](#11-variáveis-de-ambiente)
12. [Comandos](#12-comandos)
13. [Banco de dados e migrações](#13-banco-de-dados-e-migrações)
14. [Webhooks e rotas HTTP](#14-webhooks-e-rotas-http)
15. [Testes](#15-testes)
16. [Segurança](#16-segurança)
17. [Status atual e pendências](#17-status-atual-e-pendências)
18. [Checklist de publicação no domínio](#18-checklist-de-publicação-no-domínio)

---

## 1. Visão geral

| Área | O que faz |
|---|---|
| **Loja** | Catálogo de cafés (pacote de 250g) com ficha sensorial, moagem escolhida pelo cliente, carrinho e checkout. |
| **Pagamento** | Mercado Pago Checkout Pro em **produção**: Pix e cartão em até 3x, sem boleto. |
| **Frete** | Cotação pelo Melhor Envio a partir do CEP de origem 71503-503, com frete grátis a partir de R$ 250. |
| **Lifestyle** | Vitrine de produtos da marca (boné, caneca, camiseta, chaveiro). |
| **Conheça o seu café** | Guias e receitas de preparo, com textos editáveis pela Gestão. |
| **Clube & Atacado** | Planos de assinatura e formulário comercial para cafeterias, em modo de captação de interesse. |
| **Gestão** | Painel com senha para pedidos, cafés, receitas, Lifestyle, contatos, newsletter e Bling. |
| **E-mails** | Confirmação de compra, aviso de envio e campanhas de newsletter, todos via Resend. |
| **ERP** | Bling: importa cafés e estoque, cria produtos e envia pedidos pagos como pedidos de venda. |

Visual: editorial escuro, tipografia display em caixa alta e cores do mosaico da logo (o lagarto). Os detalhes estão em [`design.md`](design.md).

---

## 2. Páginas públicas

| Rota | Página | Funcionalidades |
|---|---|---|
| `/` | **Home** | Carrossel de abertura ("Torrefação de microlotes do Cerrado"), faixa animada, seleção de cafés, carrossel de destaques, manifesto, bloco sobre o pacote, chamada para receitas e cadastro na newsletter. |
| `/loja` | **Loja** | Abas **Cafés** e **Lifestyle**. Ordenação por curadoria, menor preço, maior preço ou pontuação. Mostra só produtos publicados; rascunhos pendentes no Bling ficam ocultos. |
| `/cafe/:slug` | **Produto** | Galeria de fotos, ficha técnica (variedade, altitude, processo, notas, acidez, corpo, produtor, origem), escolha de moagem (Grãos, Espresso, Coado, Prensa francesa, Italiana), quantidade, botão de adicionar ao carrinho e cafés relacionados. |
| `/sobre` | **Sobre** | História da torrefação, pilares e equipe. |
| `/clube` | **Clube & Atacado** | Três planos: **Descoberta** R$ 79/mês, **Duo** R$ 149/mês e **Obsessão** R$ 259/mês. Tem um formulário para pessoa física (clube) e outro para empresa (atacado). |
| `/conheca-seu-cafe` | **Conheça o seu café** | Receitas e guias de preparo cadastrados na Gestão. As rotas antigas `/diario` e `/diario/:slug` redirecionam para cá. |
| `/contato` | **Contato** | Formulário, WhatsApp, e-mail e endereço. |
| `/carrinho` | **Carrinho** | Itens, moagem, quantidades e subtotal. O carrinho fica salvo no navegador. |
| `/checkout` | **Checkout** | Dados pessoais e CPF, endereço com preenchimento pelo CEP (ViaCEP), opções de frete, resumo e botão "Ir para o pagamento". |
| `/pedido/:reference` | **Pedido** | Status do pedido e do pagamento, itens e frete. Só abre com o token do pedido, salvo no navegador do comprador ou presente no link do e-mail de confirmação. |
| `/newsletter/cancelar` | **Cancelar newsletter** | Página de confirmação: o descadastro só acontece depois que a pessoa clica no botão. A página não é indexada pelo Google. |
| `/gestao` | **Gestão** | Painel administrativo protegido por senha (ver seção 6). |
| `*` | **404** | Página "não encontrado". |

### Formulários (leads)

Todos os formulários gravam um registro na tabela `leads` com um tipo: `contato`, `atacado`, `clube`, `newsletter` ou `lifestyle`. Os registros aparecem em **Gestão → Contatos & Clube**.

Só o tipo `newsletter` inscreve a pessoa na lista de campanhas. Contatos, compradores e interessados no clube **não** entram na newsletter automaticamente.

> **Clube:** hoje o Clube **não** cobra pelo Mercado Pago. O formulário registra o interesse e o plano escolhido, e a equipe responde por e-mail. A cobrança recorrente automática precisaria de uma integração com as assinaturas do Mercado Pago (ainda não implementada).

---

## 3. Carrinho, checkout e pagamento

**Mercado Pago Checkout Pro, ambiente de produção.**

### Fluxo do comprador
1. O comprador monta o carrinho e preenche os dados e o endereço no `/checkout`.
2. Escolhe o frete. O site recalcula o total no servidor; o preço enviado pelo navegador nunca é usado.
3. Ao clicar em **Ir para o pagamento**, o pedido é criado com status `pending_payment` e o comprador vai para o Mercado Pago.
4. Ele paga com **Pix** ou **cartão em até 3x**. Boleto está desativado.
5. Ao voltar para `/pedido/:reference`, o site consulta o status do pagamento.
6. O webhook do Mercado Pago confirma o pagamento: o pedido passa para `paid`, os e-mails de confirmação entram na fila e o pedido é enviado ao Bling.

### Proteções implementadas
- **Validação do vendedor:** antes de cobrar, o site confirma que o token pertence ao vendedor configurado (`MERCADOPAGO_SELLER_ID`), que é uma conta real (não de teste) e do Brasil (`MLB`).
- **Produção bloqueada até estar completa:** o pagamento só é liberado com vendedor validado, endereço HTTPS do site e segredo do webhook configurado. Se faltar algo, o botão aparece desativado com uma explicação, em vez de dar erro.
- **Sem link de sandbox em produção.**
- **Pedidos de teste e de produção separados:** um pedido criado em teste não pode ser pago em produção, nem o contrário.
- **Pagamento conferido contra o pedido:** valor, referência, vendedor e `live_mode` precisam bater.
- **Webhook assinado:** a assinatura `x-signature` é validada com `MERCADOPAGO_WEBHOOK_SECRET`, e o pagamento é conferido de novo na API do Mercado Pago.
- **Sem cobrança duplicada por clique duplo:** a criação do link de pagamento tem chave estável por pedido, e pedidos simultâneos iguais são agrupados.
- **Acesso ao pedido:** cada pedido tem um token derivado por HMAC (`ORDER_ACCESS_SECRET`). Sem o token, ninguém vê os dados do pedido de outra pessoa.

### Status do pedido
`pending_payment` → `paid` → `roasting` → `shipped` → `delivered` (ou `cancelled`)

---

## 4. Frete

- Cotação pelo **Melhor Envio** (`MELHOR_ENVIO_TOKEN`; `MELHOR_ENVIO_ENV=production` para o ambiente real, sandbox nos demais casos).
- Origem: CEP **71503-503** (Lago Norte, Brasília-DF).
- Pacote padrão de 250g: 0,3 kg, 6 × 12 × 18 cm.
- **Frete grátis** a partir de **R$ 250,00** de subtotal.
- Endereço do comprador preenchido pelo CEP via ViaCEP.

> O `MELHOR_ENVIO_TOKEN` ainda não está configurado nesta cópia. Veja a seção 17.

---

## 5. E-mails automáticos

Enviados pelo **Resend** (API REST, sem SDK), com timeout de 10 s.

| E-mail | Quando sai | Para quem |
|---|---|---|
| **Confirmação de compra** | Quando o pagamento é aprovado | Comprador, com link do pedido já autenticado |
| **Cópia interna do pedido** | Quando o pagamento é aprovado | kalangocafe@gmail.com |
| **Pedido enviado** | Quando a Gestão marca o pedido como enviado e informa o código de rastreio | Comprador |
| **Campanhas da newsletter** | Quando a Gestão dispara uma campanha | Inscritos ativos |

- **Remetente:** `Kalango Cafés Especiais <contato@kalangocafe.com.br>` (variável `EMAIL_FROM`).
- **Respostas** vão para **kalangocafe@gmail.com** (`reply_to`).
- **Histórico de envios:** cada confirmação fica registrada na tabela `order_emails` com um destes status: `pending`, `sending`, `accepted`, `failed` ou `uncertain`.
- **Sem e-mail duplicado:** cada envio tem uma chave fixa (`order-confirmation/:ref/:audience`). Uma resposta ambígua (falha de rede, timeout) fica marcada como **incerta** e não é reenviada às cegas. Só falhas explícitas podem ser reenviadas, pelo botão na Gestão.
- O envio de e-mail não trava o checkout nem o webhook.
- O Resend aceitar o e-mail **não garante** que ele chegou à caixa de entrada.

> **Requisito:** o domínio `kalangocafe.com.br` precisa estar **verificado no Resend**. Sem isso, o Resend responde **HTTP 403** e nenhum e-mail sai. Veja a seção 17.

---

## 6. Painel de Gestão (`/gestao`)

Protegido pela senha `OPS_TOKEN`. A senha fica salva no navegador (`localStorage`) e o botão de sair apaga essa cópia. Cada ação do painel confere a senha também no servidor.

**Resumo no topo:** total de pedidos, pedidos para despachar, valor faturado e número de contatos.

Dá para abrir uma aba direto pelo endereço: `/gestao?aba=newsletter`, `?aba=cafes`, `?aba=bling` etc.

| Aba | Funcionalidades |
|---|---|
| **Pedidos** | Lista e filtra pedidos por status. Permite alterar o status, marcar como **enviado** com código e link de rastreio (o cliente recebe e-mail) e ver o status dos e-mails de confirmação. Confirmações que falharam podem ser reenviadas, com confirmação antes. |
| **Cafés** | Cadastra, edita e remove cafés: fotos (upload direto), ficha técnica, textos, destaque e ordem. Um café novo cria o produto no Bling automaticamente. Cafés ligados ao Bling recebem nome, preço, estoque e situação do ERP. Se a criação no Bling falhar, o café fica como rascunho com o botão **Tentar novamente no Bling**. |
| **Conheça o seu café** | Cadastra e edita receitas e guias de preparo e os textos da página. |
| **Lifestyle** | Produtos da marca (categorias: boné, caneca, camiseta, chaveiro), com cor, fotos e preço obrigatório, inclusive para os que estão "em breve". Também são criados no Bling, com estoque inicial zero. |
| **Contatos & Clube** | Mensagens de contato, pedidos de atacado, interessados no clube (com o plano escolhido), cadastros da newsletter e interessados em Lifestyle. |
| **Newsletter** | Inscritos, campanhas, envio e histórico (ver seção 7). |
| **Bling** | Conectar ou reconectar via OAuth, desconectar, ver status, sincronizar cafés e estoque, escolher categoria, canal, forma de pagamento e depósito do estoque inicial, e reenviar pedidos. |

Fotos enviadas pela Gestão vão para o armazenamento Tigris (S3) por URL pré-assinada. Formatos aceitos: JPG, PNG, WebP, GIF e AVIF.

---

## 7. Newsletter

Aba **Gestão → Newsletter**.

### Inscritos
- Entra na lista quem se cadastra no formulário de newsletter (home e outras páginas).
- Os e-mails são normalizados e sem duplicidade. Quem tinha cancelado e se cadastra de novo é reativado.
- **Busca** por nome ou e-mail, **filtro** (ativos, cancelados ou todos) e paginação de 50 em 50.
- **Exportar CSV** (até 10.000 linhas): UTF-8 com BOM e separador `;`, abre direto no Excel. O arquivo é protegido contra fórmulas maliciosas e nunca inclui o token de descadastro.
- **Cancelar inscrição** manualmente, com confirmação.
- Os cadastros de newsletter do site antigo (tabela `leads`) foram importados pela migração.

### Campanhas
1. **Nova campanha:** escreva o assunto e a mensagem em texto. A prévia mostra como fica o e-mail com o visual da Kalango.
2. **Salvar rascunho:** funciona mesmo sem o serviço de e-mail configurado.
3. **Enviar campanha:** o painel mostra o total de destinatários e pede confirmação. Se a lista ou o texto mudar nesse meio-tempo, o envio para e pede nova confirmação.
4. **Envio em lotes de 50:** mantenha a aba aberta até terminar. Dá para **pausar** e **retomar**.
5. **Histórico:** para cada campanha e destinatário aparece em fila, processando, aceito, falhou, incerto ou pulado.
6. **Tentar falhas novamente:** reenvia só para quem teve recusa explícita do serviço. E-mails aceitos ou incertos **nunca** são reenviados.

### Garantias
- Cada destinatário recebe um e-mail individual; ninguém vê o endereço de outro.
- Uma trava no banco impede dois operadores de disparar o mesmo lote ao mesmo tempo. Uma trava abandonada é liberada depois de 90 s com **Recuperar**.
- Quem cancela durante uma campanha sai da fila e não recebe o restante.
- Limite de 5.000 inscritos por campanha.

### Descadastro
- Todo e-mail tem no rodapé o link `/newsletter/cancelar?t=…`. A página pede confirmação; só abrir o link não cancela nada.
- Também envia os cabeçalhos `List-Unsubscribe` e `List-Unsubscribe-Post`, que ativam o botão "cancelar inscrição" do Gmail e de outros provedores (padrão RFC 8058, via POST `/api/webhooks/newsletter/unsubscribe`).
- Os e-mails de compra continuam chegando mesmo para quem saiu da newsletter.

---

## 8. Integração Bling (ERP)

- **Conexão** por OAuth (`BLING_CLIENT_ID` / `BLING_CLIENT_SECRET`), callback em `/api/bling/callback`.
- **Puxar do Bling:** importa e atualiza cafés (nome, preço, estoque, descrição, situação).
- **Webhook** `/api/webhooks/bling`: atualiza produtos e estoque em tempo real.
- **Cadastro automático:** um café ou produto Lifestyle criado na Gestão vira produto simples no Bling, com SKU fixo. Cafés com estoque inicial geram um lançamento de balanço no depósito escolhido.
- **Pedidos:** um pedido pago vira pedido de venda no Bling, com número `KLG-…` (não colide com os números do WooCommerce) e o cliente cadastrado como contato. O site não lança estoque nem nota fiscal; isso continua no fluxo normal do Bling.
- **Sem duplicidade:** marcadores persistentes e consulta por SKU antes de criar. Uma resposta ambígua não é repetida às cegas.

> **Pendência externa:** o Bling responde **403** ao listar depósitos. É preciso liberar no aplicativo Bling a leitura de depósitos, a inclusão de produtos e os lançamentos de estoque, e depois **Reconectar** e escolher o depósito na Gestão.

Mais detalhes em [`ALTERACOES-CAFES.md`](ALTERACOES-CAFES.md) e [`task-auto-bling.md`](task-auto-bling.md).

---

## 9. SEO e feeds

| Endereço | Conteúdo |
|---|---|
| `/api/sitemap.xml` | Sitemap com páginas e produtos publicados |
| `/api/robots.txt` | Regras para robôs de busca |
| `/api/llms.txt` e `/llms.txt` | Resumo da loja para assistentes de IA |
| `/api/feeds/google-merchant.xml` | Feed de produtos para o Google Merchant Center / Shopping |

- Título, descrição, canonical e Open Graph por página (`useSeo`).
- Dados estruturados (JSON-LD): loja (`Store`/`LocalBusiness`), produtos e ofertas do Clube.
- Rascunhos e produtos pendentes no Bling ficam fora do sitemap e do feed.
- Para gerar os feeds estáticos: `cd packages/web && bun run seo:feeds`.

---

## 10. Tecnologia e estrutura

**Stack:** Bun · Vite 7 · React 19 · Wouter · Tailwind CSS 4 · Motion · Hono · oRPC · TanStack Query · Drizzle ORM · libSQL/Turso (SQLite) · Resend · Mercado Pago · Melhor Envio · Bling · Tigris (S3).

Monorepo (Bun workspaces + Turborepo). O pacote `packages/web` serve **o site e a API na mesma porta** (4200).

```
.
├── .env                          # TODAS as variáveis (não vai para o git)
├── design.md                     # Direção visual
├── README.md
├── task-*.md / ALTERACOES-*.md   # Histórico das etapas
├── backups/                      # Cópias do SQLite antes das migrações (ignorado no git)
└── packages/
    ├── web/
    │   ├── index.html            # Fontes, JSON-LD da loja
    │   ├── public/               # Imagens, vídeos, llms.txt
    │   ├── src/api/
    │   │   ├── index.ts          # Composição do router + webhooks/feeds
    │   │   ├── config/store.ts   # Dados fixos da loja (endereço, CNPJ, frete…)
    │   │   ├── database/         # schema.ts, migrações, seeds
    │   │   ├── routes/           # admin, bling, catalog, leads, newsletter, orders, recipes
    │   │   ├── services/         # mercadopago*, order-*, email, mail-transport,
    │   │   │                     # newsletter*, melhor-envio, bling-*
    │   │   ├── seo/              # sitemap, robots, llms, feed Merchant
    │   │   └── lib/s3.ts         # Upload de fotos (Tigris)
    │   ├── src/web/
    │   │   ├── app.tsx           # Rotas
    │   │   ├── pages/            # Páginas públicas + gestao.tsx
    │   │   ├── components/       # Layout, cards, carrosséis, painéis da Gestão
    │   │   ├── queries/          # Hooks oRPC por funcionalidade
    │   │   └── lib/              # carrinho, token do pedido, SEO, formatação
    │   └── tests/                # Testes de API (bun test) e de interface (Playwright)
    ├── mobile/                   # Expo (não usado neste projeto)
    └── desktop/                  # Electron (não usado neste projeto)
```

**Rotas da API (oRPC, `/api/rpc/*`):**

| Grupo | Procedimentos |
|---|---|
| `catalog` | `list`, `get`, `related`, `merch` |
| `orders` | `quote`, `shippingOptions`, `paymentConfig`, `create`, `get`, `resumePayment`, `syncPayment` |
| `leads` | `create` |
| `recipes` | `list`, `texts` · admin: `adminList`, `save`, `remove`, `setTexts` |
| `admin` | `check`, `summary`, `orders`, `setStatus`, `ship`, `retryConfirmation`, `leads`, `coffeeList/Save/Remove`, `merchList/Save/Remove`, `retryPublication`, `uploadPresign` |
| `newsletter` | `summary`, `subscribers`, `exportSubscribers`, `unsubscribeSubscriber`, `campaigns`, `saveCampaign`, `prepare`, `sendChunk`, `recover`, `retryFailed`, `campaignRecipients` · públicos: `subscription`, `unsubscribe` |
| `bling` | `status`, `authorizeUrl`, `disconnect`, `options`, `saveSettings`, `sync`, `pushOrder` |

---

## 11. Variáveis de ambiente

Todas ficam **somente** no `.env` da raiz, que não vai para o git. Nunca crie `.env.local` ou `.env.production`.

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `WEBSITE_URL` | Sim | URL pública do site (links de e-mail, retorno do Mercado Pago). **Hoje aponta para a prévia; trocar para `https://kalangocafe.com.br` na publicação.** |
| `DATABASE_URL` / `DATABASE_AUTH_TOKEN` | Sim | Banco libSQL/Turso (local: `file:…/preview.db`) |
| `OPS_TOKEN` | Sim | Senha da Gestão |
| `ORDER_ACCESS_SECRET` | Sim | Segredo para os tokens de acesso aos pedidos (32+ caracteres). **Não trocar**: invalida os links de pedidos já feitos. |
| `MERCADOPAGO_ENV` | Sim | `production` (atual) ou `test` |
| `MERCADOPAGO_ACCESS_TOKEN` | Sim | Token do vendedor |
| `MERCADOPAGO_PUBLIC_KEY` | Sim | Chave pública |
| `MERCADOPAGO_SELLER_ID` | Sim | ID do vendedor esperado (`2105766791`) |
| `MERCADOPAGO_WEBHOOK_SECRET` | Sim (produção) | Valida a assinatura do webhook |
| `RESEND_API_KEY` | Para e-mails | Chave do Resend |
| `EMAIL_FROM` | Para e-mails | Remetente, ex.: `Kalango Cafés Especiais <contato@kalangocafe.com.br>` (`MAIL_FROM` também é aceito) |
| `MELHOR_ENVIO_TOKEN` | Para frete | Token do Melhor Envio |
| `MELHOR_ENVIO_ENV` | Não | `production` para o ambiente real |
| `BLING_CLIENT_ID` / `BLING_CLIENT_SECRET` | Para Bling | Aplicativo OAuth do Bling |
| `BLING_THROTTLE_MS` | Não | Intervalo entre chamadas ao Bling |
| `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET` | Para fotos | Armazenamento Tigris |
| `STORE_CNPJ` | Não | Sobrescreve o CNPJ padrão (49.568.547/0001-87) |
| `SITE_URL` | Não | URL usada no SEO, se for diferente de `WEBSITE_URL` |

---

## 12. Comandos

Rode da raiz do projeto.

| Comando | O que faz |
|---|---|
| `bun install` | Instala as dependências |
| `bun run dev` | Sobe site + API em desenvolvimento (porta **4200**, fixa em `__ports.cjs`) |
| `bun run build` | Compila todos os pacotes (verificação de tipos + build do Vite) |
| `bun run start` / `bun run stop` | Inicia ou para o servidor de produção (pm2) |
| `bun run lint` / `bun run typecheck` | Validações |
| `bun run kill:port` | Libera a porta 4200 se estiver ocupada |
| `bun run db:push` / `db:generate` / `db:migrate` | Gerenciamento do banco (Drizzle) |

> Estes nomes de comando são usados pela plataforma de deploy; não renomear. Arquivos e pastas com prefixo `__` são do template e não devem ser editados.

---

## 13. Banco de dados e migrações

SQLite (libSQL/Turso) via Drizzle. Tabelas principais:

`products` (cafés) · `merch` (Lifestyle) · `orders` / `order_items` · `payment_events` · `order_emails` · `leads` · `recipes` / `site_texts` · `newsletter_subscribers` / `newsletter_campaigns` / `newsletter_recipients` / `newsletter_batches` · `bling_connection` / `bling_events` · `site_cache`

**Migrações aditivas** (não apagam dados, podem rodar mais de uma vez e recusam banco remoto):

```sh
# sempre faça backup antes
python3 -c "import sqlite3;s=sqlite3.connect('preview.db');d=sqlite3.connect('backups/preview-antes.db');s.backup(d)"

bun packages/web/src/api/database/migrate-product-publication.ts   # vínculo Bling dos produtos
bun packages/web/src/api/database/migrate-newsletter.ts            # newsletter + histórico de e-mails
```

Em outro ambiente (ex.: Turso de produção), aplique as mesmas colunas e tabelas **antes** de subir o código novo.

---

## 14. Webhooks e rotas HTTP

| Método | Rota | Uso |
|---|---|---|
| POST | `/api/webhooks/mercadopago` | Notificações de pagamento (assinadas) |
| POST | `/api/webhooks/newsletter/unsubscribe` | Descadastro em um clique (RFC 8058) |
| GET | `/api/bling/callback` | Retorno do OAuth do Bling |
| POST | `/api/webhooks/bling` | Eventos de produto e estoque do Bling |
| GET | `/api/health` | Health check |

**URL definitiva do webhook no Mercado Pago** (já cadastrada, evento "Pagamentos"):
`https://kalangocafe.com.br/api/webhooks/mercadopago`
Hoje essa URL responde 404 porque o domínio ainda serve o WordPress. Ela passa a funcionar quando o site for publicado no domínio.

---

## 15. Testes

Os testes usam banco descartável e APIs simuladas: **nenhuma cobrança, e-mail ou produto real é criado.**

```sh
# Mercado Pago (53 testes)
bun test --preload ./packages/web/tests/preload.ts packages/web/tests/mercadopago.test.ts packages/web/tests/mercadopago-orders.test.ts

# Newsletter + e-mails de pedido (13 testes)
bun test --preload ./packages/web/tests/preload.ts packages/web/tests/newsletter.test.ts

# Bling (19 testes)
bun test --preload ./packages/web/tests/preload.ts packages/web/tests/bling.test.ts

# Cafés / Gestão (13 testes)
bun test packages/web/tests/coffee-admin.test.ts

# Tipos do app
bunx tsc --noEmit -p packages/web/tsconfig.app.json --types node,vite/client
```

Rode cada grupo separadamente, porque cada um simula módulos diferentes. Os testes de interface (Playwright) ficam em `packages/web/tests/*-ui.py`.

---

## 16. Segurança

- Senhas, tokens e chaves só no `.env`. Nunca no código, em prints ou em mensagens.
- O webhook do Mercado Pago só é aceito com assinatura válida e pagamento conferido na API.
- Os dados de um pedido só abrem com o token HMAC daquele pedido.
- Toda ação da Gestão confere o `OPS_TOKEN` no servidor.
- O CSV exportado é protegido contra fórmulas e não leva tokens.
- Mensagens de erro não repetem respostas de provedores, tokens ou dados de clientes.
- Abrir um link (GET) nunca cancela uma inscrição; só o clique de confirmação ou o POST one-click.
- Se um segredo vazar (por exemplo, num print), gere outro no painel do provedor e atualize o `.env`.

---

## 17. Status atual e pendências

| Item | Status |
|---|---|
| Mercado Pago em produção | ✅ Configurado e vendedor validado (conta real, MLB). Pagamento real de ponta a ponta **ainda não testado**: faça uma compra de valor baixo depois de publicar. |
| Erro "Bad Gateway" no pagamento | ✅ Corrigido (faltava `ORDER_ACCESS_SECRET`) |
| Webhook Mercado Pago | ⏳ Cadastrado no domínio definitivo; passa a funcionar quando o site for publicado em kalangocafe.com.br |
| Newsletter na Gestão | ✅ Pronta |
| E-mails (confirmação e newsletter) | ⚠️ **Bloqueado:** o domínio `kalangocafe.com.br` ainda não está verificado no Resend (o envio responde 403). Faltam os registros DNS na Hostinger (abaixo). |
| Frete Melhor Envio | ⚠️ `MELHOR_ENVIO_TOKEN` não configurado |
| Bling: depósitos | ⚠️ Token sem permissão (403). Liberar no aplicativo Bling e reconectar. |
| Clube com cobrança recorrente | ❌ Não implementado (hoje só capta interesse) |

### Registros DNS do Resend (Hostinger → Domínios → kalangocafe.com.br → DNS)

No campo **Nome**, digite só a parte curta; a Hostinger completa o domínio.

| Tipo | Nome | Valor | Prioridade |
|---|---|---|---|
| TXT | `resend._domainkey` | valor DKIM mostrado em Resend → Domains → kalangocafe.com.br (começa com `p=MIGf…`) | — |
| MX | `send` | `feedback-smtp.sa-east-1.amazonses.com` | 10 |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | — |
| CNAME | `rsend` | `send.forge.rmta.net` | — |

Depois de criar os registros, clique em **Verify** no Resend. Quando aparecer **Verified**, vá em Gestão → Newsletter e use **Tentar falhas novamente** na campanha que falhou.

---

## 18. Checklist de publicação no domínio

1. [ ] Verificar o domínio no Resend (seção 17).
2. [ ] Configurar o `MELHOR_ENVIO_TOKEN` (e `MELHOR_ENVIO_ENV=production`).
3. [ ] Trocar `WEBSITE_URL` para `https://kalangocafe.com.br`.
4. [ ] Aplicar as migrações no banco de produção (seção 13), com backup.
5. [ ] Publicar o site e apontar o domínio (substituindo o WordPress) pelas configurações da plataforma.
6. [ ] Confirmar que `https://kalangocafe.com.br/api/webhooks/mercadopago` responde (não 404).
7. [ ] Fazer uma compra real de valor baixo: pagamento, webhook, status `paid`, e-mail de confirmação e pedido no Bling.
8. [ ] Enviar uma campanha de teste da newsletter para um e-mail próprio.
9. [ ] Liberar as permissões do Bling, reconectar e escolher o depósito.
10. [ ] Enviar o novo sitemap ao Google Search Console e o feed ao Merchant Center.

---

Desenvolvido por **Ruan Carlos** · © Kalango Cafés Especiais · CNPJ 49.568.547/0001-87
