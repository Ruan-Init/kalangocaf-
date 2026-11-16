# Kalango Cafés Especiais

Site, loja virtual e painel de gestão. Este guia mostra como iniciar o projeto e o que configurar para habilitar as integrações.

## Rodar no computador

1. Instale o **Bun 1.3.14**.
2. No terminal PowerShell do VS Code, abra a pasta do projeto e rode:

   ```powershell
   bun install --frozen-lockfile
   if (!(Test-Path .env)) { Copy-Item .env.template .env }
   ```

3. Configure o `.env` na raiz do projeto. Para guardar uma cópia criptografada, rode:

   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass
   .\tooling\collect-integration-secrets.ps1
   ```

   O formulário pede as credenciais e cria `.env.gpg`. Guarde a senha do GPG. **Nunca envie `.env` ou chaves ao GitHub ou por mensagem.**

4. Configure um banco de desenvolvimento separado. Se ele estiver vazio, crie as tabelas e carregue o catálogo:

   ```powershell
   bun run db:push
   Push-Location .\packages\web
   bun --env-file=..\..\.env .\src\api\database\seed.ts
   Pop-Location
   ```

   Não rode esses comandos no banco de produção.

5. Inicie o site:

   ```powershell
   bun run dev
   ```

   Acesse `http://localhost:4200`. A API deve responder em `http://localhost:4200/api/health`.

## Para funcionar por completo

- **Banco:** configure `DATABASE_URL` e, para Turso remoto, `DATABASE_AUTH_TOKEN`.
- **Painel:** defina `OPS_TOKEN` e abra `/gestao`.
- **Pedidos:** defina `ORDER_ACCESS_SECRET` com pelo menos 32 caracteres.
- **Mercado Pago:** use credenciais do mesmo ambiente e conta. Em desenvolvimento, use credenciais de teste e `MERCADOPAGO_ENV=test`. `MERCADOPAGO_SELLER_ID` é o ID da conta do Mercado Pago dona do token; não é um ID do Mercado Livre e não exige vender por lá.
- **Pagamentos publicados:** configure o webhook `https://SEU-DOMINIO/api/webhooks/mercadopago`. O domínio precisa ter HTTPS e encaminhar as chamadas para este servidor.
- **E-mails:** configure `RESEND_API_KEY` e `EMAIL_FROM`; o domínio do remetente precisa estar verificado no Resend.
- **Bling:** configure `BLING_CLIENT_ID` e `BLING_CLIENT_SECRET`, o callback `https://SEU-DOMINIO/api/bling/callback` e conecte o Bling em `/gestao`.
- **Frete e fotos:** Melhor Envio precisa de `MELHOR_ENVIO_TOKEN`; uploads precisam das credenciais S3/Tigris. São opcionais para abrir o site.

Para verificar as configurações, rode `bun run check:config`. O comando é somente leitura: não cria pedidos, cobranças nem envia e-mails.

## Publicar na internet

A hospedagem precisa executar **Bun continuamente** e ter domínio com HTTPS. Hospedagem somente de arquivos estáticos não funciona para API, checkout ou webhooks.

Configure no servidor um `.env` de produção, faça o build e inicie:

```powershell
bun install --frozen-lockfile
bun run build
bun run serve
```

Confirme `https://SEU-DOMINIO/api/health` e configure novamente no domínio os webhooks, e-mail e callback do Bling. Teste primeiro com credenciais de sandbox. Pagamentos em produção movimentam dinheiro.

**Importante:** o Clube registra interesse, mas não cobra assinatura recorrente. Serviços externos só funcionam depois de configurados nas respectivas contas.
