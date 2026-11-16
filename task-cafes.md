# Gestão de cafés — 2026-11-04

## Escopo confirmado
- Criar anúncios pela gestão e também pelo Bling.
- Manter Bling como fonte de nome, preço, estoque, descrição e situação dos vinculados.
- Preservar upload de fotos e ficha sensorial nos dois caminhos.

## Implementado
- Formulário reutilizado para criar e editar cafés.
- Slug automático, descrição, preço em reais, estoque, peso e visibilidade para cafés locais.
- Validação de campos e conflito de slug; verificação de vínculo no servidor.
- Cadastro local sem SKU e sem blingId: sincronização não o vincula automaticamente.
- Nenhuma mudança de schema, credencial ou integração existente.

## Verificação
- `bun run build`: sucesso.
- `bun test packages/web/tests/coffee-admin.test.ts`: 1 teste, 17 verificações, sucesso.
- `python packages/web/tests/coffee-ui.py`: criação, edição, fotos disponíveis e largura móvel, sucesso (API simulada no navegador).
- `git diff --check`: sucesso.
- Upload real e sincronização real não testados: credenciais do ambiente publicado não estão neste clone.

## Entrega
- Código para aplicar no repositório existente, sem push e sem publicação no Runable.

## Atualização: excluir anúncios
- Adicionado coffeeRemove protegido por OPS_TOKEN e validação de existência.
- Cafés com histórico em order_items têm exclusão bloqueada para preservar pedidos.
- Botão textual “Excluir” e confirmação com nome nas abas Cafés e Lifestyle.
- Erros exibidos no painel; botões bloqueados durante a operação; formulário fecha caso o item editado seja excluído.
- Vinculados ao Bling avisam que o produto do ERP não é apagado e que sincronização pode recriar o anúncio.
- Teste da API: 27 verificações aprovadas, incluindo exclusão local, vinculada, autenticação, item inexistente e histórico de pedidos.
- Testes de interface de criação/edição e exclusão aprovados com API simulada. Nenhum item do usuário apagado durante os testes.
- Build aprovado. Prévia atual servida em 4200 a partir deste clone.
- Correção de runtime após relato “Not Found”: interface recebeu HMR, mas servidor mantinha o router antigo; coffeeRemove retornava HTTP 404. Reiniciado o serviço kalango-review sem mudar a porta.
- Nova verificação na URL pública: rota carregada (id inválido retorna 400); exclusão real via interface aprovada em Cafés e Lifestyle usando apenas dois itens temporários criados para o teste. Confirmado por consulta que ambos foram removidos. Anúncios existentes do usuário preservados.

## Bling: configuração da cópia ativa
- Client ID e Client Secret recebidos pelo formulário seguro no .env deste clone ativo.
- WEBSITE_URL corrigida para https://kalango-nm8ta9a-preview-4200.runable.site, sem usar localhost para OAuth/webhook.
- URL de autorização inclui callback explícito e state assinado.
- Autorização abre nova aba, evitando login do Bling dentro do iframe; mostra bloqueio de popup e erros mesmo desconectado.
- Guia de conexão mostrado na aba e status recarregado ao retornar o foco.
- Layout dos links corrigido para celular.
- Verificação real na prévia: configured=true, connected=false; callback sem código retorna erro controlado; webhook sem assinatura rejeitado com 401.
- Teste de interface aprovado interceptando somente o domínio externo de autorização. Build e 27 testes da API aprovados.
- Pendente: usuário cadastrar o callback correto no aplicativo Bling e autorizar sua conta. Nenhuma troca real de código/token, sincronização real ou envio de pedido foi realizado nesta etapa.