# Kalango Cafés Especiais — Design

Loja e site institucional da Kalango, torrefação de cafés especiais (Cerrado / Sul de Minas).
Plataforma: **web** (template gerenciado: Bun + Vite + React 19 + Hono + oRPC + Drizzle).
Direção visual: **editorial escuro**, tipografia display gigante em caixa alta, grids assimétricos,
alternância de blocos escuro ↔ creme, botões circulares com seta, fotos grandes com hover em zoom.
Referências: layout "Visual Alchemy" (dark editorial) + Onyx Coffee Lab (produto em destaque, muito ar).

## Brand & Colors

Tokens em `packages/web/src/web/styles.css` (`:root`), consumidos via Tailwind 4 `@theme inline`.

| Token | Valor | Uso |
|-------|-------|-----|
| ink | `#0B0907` | Fundo escuro dominante (hero, footer, blocos de destaque) |
| ink-soft | `#15110D` | Superfícies elevadas no escuro, cards |
| cream | `#F3EEE4` | Fundo claro das seções alternadas |
| cream-dim | `#E4DCCC` | Bordas e hairlines no claro |
| copper | `#C2703D` | Acento principal: CTAs, preços, setas, hover |
| copper-lit | `#E08A4F` | Hover do acento |
| leaf | `#5F7A43` | Acento secundário (verde do lagarto da logo), tags/badges |
| foreground | `#0B0907` no claro / `#F3EEE4` no escuro | Texto |
| muted | `#8A8073` | Texto secundário |

Regra: acento é pontual (preço, seta, linha, badge) — nunca fundo grande.

## Typography

- **Display**: `Anton` — caixa alta, tracking negativo (`-0.03em`), tamanhos brutais (`clamp(3rem, 12vw, 11rem)`), line-height 0.85.
- **Body**: `Poppins` (300/400/500) — line-height 1.7, tamanho base 16–18px.
- **Meta/label**: Poppins 500, 11px, uppercase, `tracking-[0.25em]`, cor muted.
- Fontes carregadas via Google Fonts no `index.html` (preconnect + display=swap).

## Layout

- Container `max-w-[1440px]`, padding lateral `px-6 md:px-10 lg:px-16`.
- Grid de 12 colunas; cards de produto quebram o grid (offsets verticais alternados no desktop).
- Espaçamento vertical de seção: `py-24 md:py-36`.
- Cantos: praticamente retos (`rounded-none`), exceto botões circulares e pills.

## Motion

- Load da home: reveal escalonado (mask-up do display, fade dos metadados) com Motion (`motion/react`).
- Scroll reveal por seção (once, 40px de deslocamento, stagger 60ms).
- Hover em card: imagem `scale(1.06)` 700ms ease-out + seta circular que preenche de copper.
- Sem parallax pesado; nada que atrapalhe no mobile.

## Pages

- **Home** (`pages/index.tsx`) — hero full-bleed, seleção de cafés, café em destaque, manifesto, depoimento, CTA newsletter.
- **Loja** (`pages/loja.tsx`) — grid completo + filtro por nota sensorial e faixa de preço.
- **Produto** (`pages/produto.tsx`, rota `/cafe/:slug`) — galeria, ficha (variedade, altitude, processo, aroma, acidez, corpo, produtor, origem), seletor de moagem e quantidade, add to cart.
- **Sobre** (`pages/sobre.tsx`) — história da torrefação, processo, valores.
- **Blog** (`pages/blog.tsx`, `pages/post.tsx`) — listagem editorial + post.
- **Clube & Atacado** (`pages/clube.tsx`) — planos de assinatura + formulário de atacado.
- **Contato** (`pages/contato.tsx`) — formulário + WhatsApp.
- **Carrinho** (`pages/carrinho.tsx`) e **Checkout** (`pages/checkout.tsx`) — dados pessoais + CPF, endereço com CEP (ViaCEP), frete, resumo e Mercado Pago Checkout Pro. Preservar visual; banner apenas no modo teste. Produção só é liberada com vendedor validado e webhook secret configurado.

## Key Flows

1. Home → card do café → página do produto → escolhe moagem/qtd → adiciona ao carrinho (drawer) → carrinho → checkout → pedido criado → pagamento.
2. Clube: escolhe plano → formulário → lead salvo.
3. Atacado/contato: formulário → lead salvo → WhatsApp como atalho.

## Architecture

- Estado do carrinho: contexto React + `localStorage`, sincronizado com a API no checkout.
- Dados de produto/post/pedido no Turso via Drizzle; seed com os 10 cafés reais importados do site atual.
- Query/mutation hooks em `src/web/queries/`, um arquivo por feature.

## Gestão de cafés — edição de novembro de 2026

- Preservar o visual existente do painel e o padrão do formulário Lifestyle.
- Oferecer “Novo café” e “Puxar do Bling” lado a lado.
- Identificar a origem do anúncio (Gestão ou Bling).
- Fotos e ficha sensorial editáveis em ambos; dados comerciais somente nos cafés sem vínculo ao Bling.
- Ações destrutivas exibem botão textual “Excluir”, confirmação com nome do item e erros na própria aba, também no celular. Café com histórico de pedidos não é apagado.
- Novos cafés e Lifestyle exibem vínculo, SKU, erro e “Tentar novamente” junto ao anúncio. Rascunhos ficam fora da loja até o Bling confirmar produto e estoque inicial.
- Preço obrigatório também para Lifestyle em breve. Preservar a linguagem visual existente; configuração de depósito na aba Bling, sem redesenhar o painel.

## Newsletter na Gestão
- Nova aba no painel escuro existente, sem redesenho: inscritos/campanhas/histórico, status do serviço e erros visíveis.
- Editor simples de assunto e mensagem; prévia em creme com cabeçalho Kalango e rodapé de cancelamento, sem HTML arbitrário executável.
- Confirmar assunto e total de inscritos antes de enviar. Separar aceitação pelo provedor de entrega, falhas e envios incertos.
- Tabelas responsivas com paginação; filtros e exportação CSV dos inscritos. Página de cancelamento pede clique explícito, nunca cancela ao abrir link.
- Pedidos pagos exibem status da confirmação e ação de tentar de novo para falhas explícitas. Compradores não viram inscritos automaticamente.
