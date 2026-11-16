# Newsletter na Gestão e correções do checkout/e-mail

## Escopo confirmado
- Aba Newsletter: inscritos, busca/exportação CSV, composição de campanhas, envio pela Gestão, histórico e cancelamento.
- Usar Resend existente nos bastidores. Nenhum envio real durante testes.
- Confirmação de compra continua transacional, separada da lista de marketing; compradores não entram automaticamente na newsletter.
- Preservar visual/painel/senha de operação e original /home/user/kalango-projeto.

## Diagnóstico
- ORDER_ACCESS_SECRET ausente causava exceção no início do checkout. Chave aleatória persistida sem exibir, derivação verificada e servidor reiniciado.
- RESEND_API_KEY ausente: envio de confirmações é impossível; formulário seguro já oferecido.
- Código antigo usa MAIL_FROM, formulário ofereceu EMAIL_FROM: aceitar ambas, prioridade EMAIL_FROM.
- E-mail de confirmação antigo tinha link de pedido sem token: corrigir com token HMAC próprio de e-mail validado no servidor.

## Plano
- Schema aditivo: inscritos únicos, campanhas, destinatários e lotes persistidos; diário de confirmações transacionais.
- Migrar somente leads com kind=newsletter; deduplicar caixa/ espaços. Opt-out persistente e link de cancelamento de inscrição sem auto-cancelamento em GET.
- oRPC protegido por assertOps: listagem paginada, exportação, rascunho, preparação, lotes de envio, histórico. Contagens reais; não chamar aceitação do provedor de entrega na caixa de entrada.
- Envio em lotes pequenos, trava persistente, chave estável e registro antes da rede. Respostas ambíguas não reenviam destinatários cegamente; interrupção pode retomar só ainda pendentes.
- UI Newsletter: assunto/mensagem, prévia segura, confirmação do total, estado do serviço, exportação, histórico e erros. Página pública de cancelamento.
- Confirmações: diário + estado no pedido + ação protegida de reenviar; nunca marcar teste como operação real.
- Checkout: falha de configuração vira erro legível; jamais POST real de preference em teste de diagnóstico.
- Testes simulados/in-memory, migração local aditiva com backup, build e interface desktop/mobile.

## Pendências
- API key e domínio remetente verificado no Resend; sem isso rascunhos funcionam, mas o envio fica bloqueado.
- Publicação futura no domínio kalangocafe.com.br; WEBSITE_URL da prévia será trocada no lançamento.
## Status 2026-11-14 (fim da etapa)
- RESEND_API_KEY salva (acesso total). EMAIL_FROM trocado de gmail (não verificável no Resend) para `Kalango Cafés Especiais <contato@kalangocafe.com.br>`; respostas vão para kalangocafe@gmail.com (reply_to).
- Domínio kalangocafe.com.br criado no Resend via API (sa-east-1), status not_started — falta colar DKIM/SPF na zona DNS da Hostinger e clicar Verify.
- E-mail público do site trocado para kalangocafe@gmail.com (layout, contato, store.ts, index.html JSON-LD, llms.txt).
- Correções: escape do LIKE na busca, insert de audiência em blocos de 500, lote vazio não pula conclusão.
- Testes: newsletter 13/362, MP 53/189, bling 19/102, coffee-admin 13/160. tsc app ok, build ok, diff --check ok.
- Migração local aplicada 2x (idempotente), backup em backups/preview-before-newsletter.db.
- Nenhum e-mail real enviado em testes.
