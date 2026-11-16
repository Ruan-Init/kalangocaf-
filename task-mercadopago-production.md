 # Mercado Pago — produção

## Escopo
- Somente /home/user/Kalango-3660. Preservar Checkout Pro, Pix e cartão até 3 parcelas, sem boleto.
- Credenciais recebidas no .env; /users/me (GET) confirmou vendedor brasileiro sem tag test_user.
- Não criar preferences, pagamentos, produtos ou estoque reais nos testes.

## Plano
- Validar vendedor esperado em teste/produção; cache vinculado ao token e ambiente.
- Exigir webhook secret em produção e HTTPS; bloquear checkout até configuração completa.
- Isolar pedidos de teste e reais, validar live_mode e usar apenas link de produção no modo produção.
- Permitir produção nas rotas, conciliação, webhook e frontend, com testes simulados.
- Reutilizar chave estável da preference e coalescer tentativas simultâneas no mesmo processo.
- Build, testes e verificação da prévia antes da entrega.

## Pendências externas
- Chave secreta de Webhooks > Produção > Pagamentos ausente.
- WEBSITE_URL atual é a prévia Runable; configurar URL permanente antes de vendas reais.
- Nenhuma cobrança ou confirmação de webhook real executada.

## Progresso
- Implementado: conta/ambiente esperado, cache vinculado às credenciais, isolamento de pedidos e live_mode, links de produção sem fallback sandbox, rotas/retorno/webhook/frontend compatíveis com produção.
- Retries usam chave estável; concorrência no mesmo processo compartilha tentativa. Sem alegação de exatamente uma preference entre múltiplos servidores ou garantia não documentada do provedor.
- MERCADOPAGO_ENV=production e vendedor validado gravados no .env ignorado pelo Git. Checkout permanece disabled porque webhook secret está ausente.
- 53 testes de pagamento aprovados, 189 asserções; build e git diff --check aprovados.
- mercadopago-ui.py aprovado: frontend Kalango correto, bloqueio real sem webhook, teste/produção/desativado desktop e mobile com APIs simuladas; nenhum pedido criado.
- Servidor concorrente do original parado (nenhum arquivo alterado); cópia ativa reiniciada, único listener 0.0.0.0:4200.
- API pública paymentConfig HTTP 200 com env=disabled. Endpoint público do webhook existe (POST sem ID: 400 missing_data_id); POST com ID sem segredo retorna 503 local / 502 via proxy público.
- Domínio https://kalangocafe.com.br ainda é WordPress/Hostinger; HEAD /api/webhooks/mercadopago retorna 404. Não usar esse endereço para esta cópia antes de publicá-la nesse domínio.
- Usuário enviou captura com assinatura secreta visível; não transcrever/repetir. Recomendar renovar e solicitar a nova pelo formulário seguro.
- URL configurada atual: https://kalango-nm8ta9a-preview-4200.runable.site/api/webhooks/mercadopago. Evento da tela: Pagamentos (legacy), modo produção.