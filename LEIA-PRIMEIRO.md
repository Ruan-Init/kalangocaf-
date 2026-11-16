# Kalango — VS Code, Bun e produção

## O que foi verificado nesta cópia

- O visual, as páginas, os textos e as imagens do repositório foram preservados. Não houve redesenho.
- Login real em `/gestao`, leitura do painel e catálogo: passaram.
- Imagens locais do catálogo e das páginas: presentes e carregando no navegador.
- Produto → carrinho → checkout: passou; botão de pagamento habilitado com configuração de produção.
- Mercado Pago: token aceito por `/users/me`, vendedor brasileiro de produção confirmado.
- 98 testes automatizados passaram com banco descartável e APIs simuladas: pagamento, webhook, newsletter, Bling e gestão de cafés.
- Build e lint passaram. Alertas de tamanho de bundle/depreciação de dependências não são erros de compilação.
- O ZIP foi extraído em outra pasta: instalação com lockfile congelado, lint, build e servidor `bun run serve` passaram; Gestão, imagens e checkout foram verificados novamente nesse servidor, fora do Vite/Runable.
- Nenhuma credencial privada foi encontrada nos bundles JavaScript do frontend.
- Storage de imagens: bucket acessível, CORS permite upload PUT pelo navegador e origem do site.

**Uma compra real de ponta a ponta não foi feita.** Não foi criada cobrança nem enviado e-mail a cliente. O funcionamento do retorno/webhook em `kalangocafe.com.br` depende de o domínio apontar para esta aplicação.

## 1. Abrir no VS Code

1. Extraia o ZIP e abra a pasta **kalango** no VS Code — a pasta que contém `package.json`, `.env` e `packages`.
2. Instale Bun se ele ainda não existir no seu computador. Confira `bun --version`. Esta revisão foi testada com Bun 1.4.4; o lockfile deve ser preservado.
3. Abra o terminal do VS Code **nessa raiz** e execute:

```sh
bun install --frozen-lockfile
bun run dev
```

4. Abra **http://localhost:4200**. Gestão: **http://localhost:4200/gestao**. Entre com o `OPS_TOKEN` que você configurou.

Não use a extensão **Live Server**, não abra `index.html` por `file://` e não execute apenas a pasta `dist`. Isso não inicia a API, e Gestão/pagamentos deixam de funcionar. `bun run dev` serve o site e a API no mesmo processo e na mesma porta.

As imagens estão em `packages/web/public/images` e são servidas por `/images/...`. Não mova essa pasta para `src`, não altere as URLs para caminhos do Windows e não envie apenas os arquivos `.tsx`.

Se a porta estiver ocupada, pare o outro servidor com Ctrl+C ou use `bun run kill:port`. Não mude a porta gerenciada em `__ports.cjs`.

## 2. Credenciais e GitHub

O pacote privado entregue contém **.env com as configurações de produção necessárias para o site**, inclusive banco, Gestão, Mercado Pago, Resend, Bling, segredo de acesso aos pedidos e storage. Não compartilhe esse ZIP publicamente.

- `.env` é ignorado pelo Git. Confira `git check-ignore .env` antes de fazer o primeiro commit.
- Para preencher localmente as 10 chaves de integração e gerar `.env.gpg`, instale o GPG e execute no PowerShell: `.\tooling\collect-integration-secrets.ps1`. Os valores são digitados sem aparecer no terminal; o GPG pedirá uma senha para criptografar. O script preserva as demais configurações do `.env` ou, se ele ainda não existir, começa pelo `.env.template`. O `.env` em texto claro permanece local para uso da aplicação, e os dois arquivos são ignorados pelo Git. Não envie as chaves por chat nem publique esses arquivos.
- Envie o **código** ao GitHub, não o ZIP privado e não o `.env`.
- No servidor Hostinger, coloque o `.env` na raiz do projeto separadamente, pelo painel seguro/SSH. Ele não vem em `git clone`.
- Em Linux: `chmod 600 .env`.
- Preserve `ORDER_ACCESS_SECRET`: trocar essa chave invalida links de pedidos existentes enviados por e-mail.
- `.env.template` contém apenas os nomes e orientações, sem credenciais; pode ir ao GitHub.
- Nunca coloque chaves privadas em variáveis `VITE_*`: elas podem ir para o navegador.

Diagnóstico seguro, sem gravações no banco ou chamadas de envio:

```sh
bun run check:config
```

Enquanto o Resend não estiver verificado, o diagnóstico retorna erro e explica a pendência. Isso é um bloqueio externo real, não uma falha oculta.

**Não execute `seed.ts`, `db:push --force` ou migrações automáticas nesse banco de produção.** O banco informado já tem schema compatível e catálogo. O seed original apaga tabelas antes de popular.

## 3. Produção com Bun na Hostinger

**Bun é o runtime, não um plano de hospedagem.** O servidor precisa permitir um processo Bun persistente e proxy HTTPS (por exemplo, VPS com SSH). Hospedagem só de PHP/arquivos estáticos não executa esta API. Não foi feita instalação/migração no servidor Hostinger nesta revisão.

Na raiz do projeto, depois de configurar o `.env`:

```sh
bun install --frozen-lockfile
bun run build
bun run serve
```

`serve` mantém o processo em primeiro plano e lê o `.env` da raiz explicitamente. Ele serve `packages/web/dist` **e** `/api/*`; a porta padrão é 4200. Em um painel com supervisor, use `bun run serve` como comando de inicialização e a raiz do repositório como diretório de trabalho.

Alternativa em VPS, com PM2 já instalado pelas dependências e PATH do Bun disponível:

```sh
bun run build
bun run start
```

Não inicie PM2 e `serve` simultaneamente na mesma porta. Para persistência após reinicialização, configure o supervisor do seu servidor; encerrar o terminal sem supervisor interrompe o processo.

O proxy do domínio deve encaminhar **todas as rotas**, incluindo `/api/*`, `/images/*`, `/assets/*`, `/videos/*` e rotas de página, para o Bun. Não aponte somente para `dist` num servidor de arquivos.

Verificações após a migração:

```sh
curl https://kalangocafe.com.br/api/health
# Esperado: {"status":"ok"}
```

Abra `/gestao`, `/loja` e uma URL de produto diretamente. Todos devem funcionar inclusive após atualizar a página. Imagens devem responder com tipo de imagem, não HTML.

**Estado atual observado:** `kalangocafe.com.br` ainda responde WordPress/PHP. Esse domínio não foi migrado por esta tarefa e ainda não responde à API de saúde da Kalango em Bun.

## 4. Mercado Pago em produção

Configuração presente no `.env`: `MERCADOPAGO_ENV=production`, access token, public key, ID do vendedor verificado e segredo do webhook. A public key não precisa aparecer no frontend: o fluxo original usa Checkout Pro, gerando o link no servidor.

`WEBSITE_URL=https://kalangocafe.com.br` define URLs de retorno e notificações. Não troque para `http://localhost`: o fluxo de produção exige HTTPS. Para uma compra real em uma prévia, use o endereço HTTPS público que de fato serve essa prévia, com seu webhook correspondente.

No painel do aplicativo Mercado Pago, configure o webhook de produção de **Pagamentos**:

```text
https://kalangocafe.com.br/api/webhooks/mercadopago
```

O segredo do webhook no painel deve corresponder a `MERCADOPAGO_WEBHOOK_SECRET`. Depois que o domínio estiver no Bun, o endpoint passa a alcançar esta API. Antes disso, o retorno pode abrir o WordPress e a notificação pode falhar, mesmo com token válido.

O caminho completo de compra precisa ser confirmado **depois da migração**, com uma compra real autorizada por você: link do Mercado Pago, pagamento, retorno, pedido pago e confirmação. Os testes simulados conferem a lógica, mas não substituem essa verificação financeira real.

## 5. Resend: pendência DNS obrigatória

A chave de API foi aceita. O domínio **kalangocafe.com.br** está cadastrado na sua conta, mas a API retornou status **not_started**. O remetente informado era Gmail; foi ajustado para:

```text
Kalango Cafés Especiais <contato@kalangocafe.com.br>
```

Respostas continuam indo para **kalangocafe@gmail.com**, conforme o código original. Não é necessário usar Gmail como `EMAIL_FROM`; o Resend não verifica um domínio público que você não controla.

No DNS do domínio na Hostinger, configure os registros abaixo, obtidos da sua conta Resend em 16/11/2026. Se o painel completa o domínio automaticamente, use apenas o nome curto indicado. Não apague os registros de e-mail existentes nem o MX principal do domínio.

| Tipo | Nome | Valor | Prioridade |
|---|---|---|---|
| TXT | resend._domainkey | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDENQxFdgoqrlwCQn5PvMsjL8GJaMh1lRIpPNlR1Blo6v6D0fNPXlIjb1/Zw+M9hOtOGnKZeVH88ZASDjMXZ6IWdAPKm7DxOe/5RpRmYBrUxqDjJ0ZjdzkH3G5xWD2EM0jx8LgH0oCMUJ01RntUKtJZqVbn79ikknLDLbHLKHEpkQIDAQAB` | — |
| MX | send | `feedback-smtp.sa-east-1.amazonses.com` | 10 |
| TXT | send | `v=spf1 include:amazonses.com ~all` | — |
| CNAME | rsend | `send.forge.rmta.net` | — |

Use TTL automático; o CNAME foi indicado com TTL 3600 na API. Depois da propagação, abra **Resend → Domains → kalangocafe.com.br → Verify** e confirme status **Verified**. Se as instruções no painel Resend mudarem, use os valores atuais do painel.

Não foi alterado DNS na Hostinger. Não foi enviado e-mail de teste. Sem verificação, o Resend pode recusar envios com HTTP 403; nenhuma correção de código pode autenticar o domínio por você.

Referência: https://resend.com/docs/dashboard/domains/introduction

## 6. Bling, frete e uploads

- **Bling:** client ID e secret estão presentes, mas o banco informado não tem conexão OAuth. Cadastre no aplicativo Bling o callback `https://kalangocafe.com.br/api/bling/callback`, entre em Gestão → Bling e conecte a conta. Permissões de produtos, pedidos, depósitos e estoque são controladas pelo Bling. Não foi feita conexão/sincronização automática com a conta real.
- **Frete:** não foi fornecido `MELHOR_ENVIO_TOKEN`. O código original mantém retirada e tabela de contingência; PAC/SEDEX são estimativas, não preços reais consultados na transportadora. Para cotação real, configure o token e `MELHOR_ENVIO_ENV=production`.
- **Imagens existentes:** estão no código em `public`, e seus caminhos foram conferidos contra o banco. Nenhuma está faltando no catálogo atual.
- **Novos uploads da Gestão:** dependem dos quatro valores S3 no `.env`. Eles são preservados no pacote privado. O bucket está acessível e o CORS permite PUT. Não foi criado upload real no storage como teste.

## 7. O que a revisão não promete

Não é possível garantir ausência absoluta de erros em uma hospedagem ainda não configurada, em chaves futuras, serviços externos ou mudanças no banco. Esta revisão entrega uma execução testada e instruções específicas. As pendências conhecidas estão explícitas: DNS do Resend, domínio/proxy no Bun, OAuth do Bling, token de cotação real de frete e compra real após publicação.