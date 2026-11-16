# Cadastro automático de produtos no Bling

## Escopo confirmado
- Criar novo produto no Bling ao cadastrar café ou Lifestyle na gestão.
- Exigir preço para Lifestyle, inclusive em breve.
- Cópia ativa em /home/user/Kalango-3660; não tocar no projeto original.

## Plano
- Schema: vínculo/SKU/status de publicação e chave de criação nas duas tabelas; depósito inicial na conexão.
- Serviço de publicação: rascunho persistido, SKU estável, consulta por SKU antes de POST, vínculo salvo antes do estoque e retry controlado.
- Não repetir automaticamente POST com resposta ambígua. Nenhum produto real criado durante testes.
- Catálogo/checkout/feed excluem novos rascunhos ainda sem vínculo confirmado.
- Cafés com estoque inicial positivo exigem depósito configurado; Bling não aceita saldo como campo gravável no cadastro do produto.
- Lifestyle usa produto simples, preço obrigatório, estoque inicial zero; não criar variantes não solicitadas.
- UI: status do vínculo, erros legíveis e ação de tentar novamente. Repetição do formulário usa chave estável para não criar segundo anúncio.
- Usar id/sku do Lifestyle no processamento de produtos/estoque para não importá-lo como café.
- Verificar com APIs simuladas, build, schema aditivo no banco LOCAL e interface real sem alterações no ERP.

## Evidência de API
- OpenAPI oficial obtido de https://developer.bling.com.br/build/assets/openapi-CR5QY_N1.json.
- POST /produtos usa ProdutosDadosDTO; retorna data.id.
- GET /produtos aceita codigos[], criterio=5.
- Saldo virtual no cadastro é readOnly. POST /estoques exige produto, deposito, operacao e quantidade; usar B (balanço) para saldo inicial absoluto.

## Status
- Implementado nesta cópia: criação automática café/Lifestyle, SKU estável e vínculo persistido, preço obrigatório, rascunhos ocultos, ação de retry e depósito inicial.
- POST de produto/estoque sem retries cegos; resultado ambíguo só permite reconciliação por SKU/saldo. Marcadores persistidos sobrevivem a restart e bloqueiam exclusão antes da confirmação.
- Sync/webhooks reconhecem Lifestyle e ignoram rascunhos. Catálogo, URL de produto, checkout, bestsellers, feed e sitemap excluem publicações pendentes.
- Migração aditiva local aplicada duas vezes (idempotência verificada), com backup SQLite antes da alteração. Contagens preservadas: 10 cafés, 4 Lifestyle.
- Testes: 13 testes de API, 160 asserções, 0 falhas; coffee-ui.py, delete-ui.py e publication-ui.py aprovados com API simulada; bling-ui.py aprovado na prévia pública, OAuth externo interceptado. Build e diff --check aprovados.
- Servidor reiniciado no tmux kalango-review, porta 4200. Status público HTTP 200: conectado, 14 itens no painel Bling, depósito ainda não escolhido.
- Bloqueio externo confirmado em GET /depositos: 403 por privilégios insuficientes do token. Opções da gestão agora retornam HTTP 200 com aviso de permissão, sem derrubar categoria/canal/pagamento.
- Usuário precisa habilitar leitura de depósitos no aplicativo Bling, reconectar e escolher o depósito. Inclusão de produtos e lançamentos de estoque também precisam estar permitidos no aplicativo; não houve POST real para testar essas permissões.
- Nenhum produto ou balanço real criado nos testes. Nenhum dado do original/remoto alterado, nenhum push GitHub ou trabalho Hostinger executado.