# Kalango Cafés Especiais

Site, loja virtual e painel de gestão. O site e a API precisam rodar juntos.

## Rodar localmente

Instale o Bun 1.3.14. No terminal PowerShell, na pasta do projeto:

```powershell
bun install --frozen-lockfile
if (!(Test-Path .env)) { Copy-Item .env.template .env }
bun run dev
```

Abra `http://localhost:4200`. O `.env` guarda as configurações locais; preencha banco, `OPS_TOKEN` e `ORDER_ACCESS_SECRET`. Para preparar um banco de desenvolvimento vazio e inserir o catálogo:

```powershell
bun run db:push
Push-Location .\packages\web
bun --env-file=..\..\.env .\src\api\database\seed.ts
Pop-Location
```

Nunca use esses comandos no banco de produção.

## Credenciais

- `.env`: configura o servidor local. Não envie ao GitHub.
- `.env.gpg`: cópia criptografada do `.env`; atualize com `gpg -c .env`. Não é lida automaticamente pela aplicação.
- `.env.template`: modelo sem valores secretos, usado para saber quais variáveis configurar.

O GitHub guarda o código, não as credenciais. Para publicar, configure as variáveis no servidor de hospedagem.

## Pagamentos

Configure `MERCADOPAGO_ENV`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY` e `MERCADOPAGO_SELLER_ID` da mesma conta e ambiente. Seller ID é o ID da conta do Mercado Pago, não do Mercado Livre.

Use credenciais de teste para testar sem cobranças reais. Em produção, publique a API em domínio HTTPS e configure o webhook `https://SEU-DOMINIO/api/webhooks/mercadopago` para notificações de pagamentos e assinaturas. Sem webhook público, a confirmação do pagamento não chega ao site. Produção pode movimentar dinheiro.

E-mails precisam de `RESEND_API_KEY`, `EMAIL_FROM` e domínio verificado no Resend. Bling, Melhor Envio e armazenamento de imagens também exigem credenciais próprias.

No Clube, a pessoa escolhe Pix mensal (código da primeira cobrança por e-mail; as próximas mensalidades Pix precisam ser emitidas separadamente) ou cartão mensal. No cartão, o Mercado Pago hospeda o cadastro e a autorização; o site não recebe os dados do cartão, e as cobranças recorrentes começam após a autorização e confirmação do primeiro pagamento. Após o primeiro pagamento confirmado, a newsletter envia uma mensagem transacional de boas-vindas. O formulário permite optar separadamente por receber campanhas e notificações de marketing; a adesão ao Clube, sozinha, não inscreve a pessoa na lista.

Em banco existente, antes de publicar o novo fluxo do Clube, configure o `.env` com o banco do ambiente desejado e rode `bun run db:migrate:club`. Essa migração cria as tabelas aditivas `club_subscriptions` e `club_subscription_payments`; não execute `db:push` em produção.

## Publicar

Use hospedagem que mantenha Bun e a API rodando; hospedagem de arquivos estáticos não basta. Configure o `.env` de produção no servidor, domínio HTTPS e proxy para `/api/*`. Depois rode:

```powershell
bun install --frozen-lockfile
bun run build
bun run serve
```

Confira `https://SEU-DOMINIO/api/health`. Push para o GitHub, sozinho, não publica a aplicação. Nunca faça commit de `.env` ou `.env.gpg`.
