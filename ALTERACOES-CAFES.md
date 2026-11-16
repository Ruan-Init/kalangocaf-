# Cadastro de cafés e Lifestyle integrado ao Bling

## O que muda

Em **Gestão → Cafés → Novo café** ou **Lifestyle → Novo produto**, o cadastro cria um produto simples no Bling e salva automaticamente seu ID e SKU na gestão. **Puxar do Bling** continua trazendo/atualizando cafés do ERP.

- Antes do envio: nome, endereço, descrição, preço, estoque e peso do café são preenchidos na gestão.
- Cafés vinculados ao Bling: nome, preço, estoque, descrição e situação continuam vindo do ERP. Fotos, ficha técnica, textos do site, destaque e ordem são editáveis pela gestão.
- Para enviar fotos: clique no lápis do anúncio, use a área **Fotos** e depois **Salvar alterações**. Não é necessário colocar a foto no Bling.
- Preço maior que zero obrigatório, também para Lifestyle “em breve”. Lifestyle inicia com estoque zero; tamanhos informativos não geram variantes.
- Se a integração falhar, o anúncio fica salvo como **rascunho**, fora da loja. Use **Tentar novamente no Bling** junto ao anúncio; não abra outro cadastro para repetir o envio.
- O SKU estável e os marcadores de tentativa evitam repetir POSTs ambíguos. Se o Bling não confirmar uma resposta, a retomada consulta o produto/saldo em vez de criar ou movimentar novamente.

## Configuração nesta cópia

1. Em seu aplicativo Bling, permita a leitura de depósitos, a inclusão de produtos e os lançamentos de estoque.
2. Após alterar permissões, use **Gestão → Bling → Reconectar** e autorize novamente.
3. Escolha a categoria dos cafés e o **Depósito do estoque inicial**. Clique em **Salvar escolhas**.
4. Cadastre normalmente nas abas Cafés e Lifestyle.

O café com estoque positivo recebe um balanço inicial no depósito selecionado. Estoque zero não exige depósito. Nenhum envio de teste alterou produtos ou estoque reais.

**Bloqueio verificado:** a conta está conectada, mas o Bling responde 403 ao listar depósitos. O painel mostra o aviso sem bloquear as demais escolhas. A permissão deve ser corrigida no aplicativo e a conta reconectada.

## Banco e ambiente

Implementação na cópia `/home/user/Kalango-3660`. Migração aditiva em `packages/web/src/api/database/migrate-product-publication.ts`, aplicada somente ao SQLite local com backup anterior. Itens antigos permanecem visíveis; não são cadastrados novamente no ERP. A migração recusa URLs de banco remoto.

Não houve alteração no projeto original, push ao GitHub ou publicação na Hostinger. Para outro ambiente, migrar as colunas aditivas antes de iniciar o código atualizado.

## Validação

Build aprovado; 13 testes de API / 160 asserções aprovados com banco em memória e Bling simulado. Interface de cadastro, rascunho, retry, exclusão e depósito verificada em desktop/celular. Status e leitura de opções conferidos na prévia pública.

Criação real de produtos e balanço real não foram executados como teste. Upload de fotos depende do storage configurado no ambiente. A implementação não adiciona checkout de Lifestyle nem variantes ao Bling.