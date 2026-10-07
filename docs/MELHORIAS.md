# Punk Bolos — Melhorias Implementadas

Registro das correções, evoluções e melhorias aplicadas ao sistema ao longo do desenvolvimento.

---

## Correções de bugs

### 1. Modal não abria ao clicar no botão "＋"
- **Problema:** em qualquer navegador, o modal de novo pedido não abria.
- **Causa raiz:** `saborInput.list = 'lista-sabores'` tentava atribuir valor à propriedade read-only `.list` de `HTMLInputElement`, lançando `TypeError`. Só aparecia no navegador real; testes com DOM simulado em Node não detectavam.
- **Correção:** usar `saborInput.setAttribute('list', 'lista-sabores')`. A partir daí os testes passaram a incluir **navegador headless** (Chrome).

### 2. Títulos dos cards do dashboard sumiam
- **Problema:** ao renderizar, o texto era escrito no card inteiro, apagando lendas.
- **Correção:** `setStat` grava apenas no `.stat-value`, preservando ícone e `.stat-label`.

### 3. Duplicar pedido mantinha o status original
- **Problema:** pedidos duplicados herdavam o status do original (ex.: "Concluído").
- **Correção:** `duplicateOrder` **sempre reinicia o status para "Pendente"**.

### 4. Variável CSS usada mas nunca definida
- **Problema:** `--color-on-primary` era referenciada em `styles.css` mas não existia em `themes.css`.
- **Correção:** definida nos dois temas (claro e escuro).

### 5. Produto em edição resolvido pelo produto errado
- **Problema:** ao editar um pedido, itens com mesmo preço eram casados com o produto errado do catálogo.
- **Correção:** resolução prioriza o **`produtoId`** (novo formato) e usa o **título** para desempatar no casador por tipo+tamanho+valor (`product.matchProduct`).

### 6. Estoque parando no seletor ao editar
- **Problema:** ao editar um pedido, o selo de produto do item podia sumir da listagem (por ter 0 de disponível).
- **Correção:** ao editar, o produto do item atual é **sempre** incluído no seletor (`requiredId`), descontando a própria reserva (`excludeOrderId`).

---

## Evoluções de funcionalidade

### 7. Múltiplos produtos por pedido
- **Antes:** um único tipo de produto por pedido e lista de sabores.
- **Agora:** cada **item** é um produto completo `{ tipoProduto, tamanho, sabor, quantidade, valorUnitario }`; um pedido pode misturar ex.: `2× Punkitos (Chocolate) · 1× Bolo Inteiro G (Cenoura) · 3× Fatia (Red Velvet)`.

### 8. Migração automática de pedidos/produtos antigos
- `storage.migrateOrder` converte pedidos em formatos legados (sem `itens` ou itens sem `tipoProduto`); `migrateProduct` converte o formato antigo (`nome/preco`) para o atual (`titulo/valor`).

### 9. Catálogo de produtos (novo)
- Tela **Produtos**: cadastro, edição, exclusão e busca; cada produto tem tipo, tamanho (Bolo Inteiro), título (sabor), valor e detalhes.
- O **valor do pedido vem do catálogo** — nada de digitar preço na hora de escolher sabor.
- Bloqueio de **duplicados** (mesmo tipo + título, tamanho para bolo).

### 10. Filtro por período de datas (compartilhado)
- Barra de período: presets **Hoje / 7 dias / Este mês / Tudo** + faixa **De/Até**.
- Filtra **simultaneamente** dashboard e lista de pedidos; estado persistido.

### 11. Dashboard completo (Punk Bolos 2.0)
- Novo módulo puro `dashboardService.js` (indicadores + agregações + rankings).
- Cards: receita, pedidos, quantidade vendida, ticket médio, lucro bruto e distribuição por status.
- Faturamento por dia e rankings de sabores/produtos com gráficos (Chart.js).

### 12. Autenticação (Supabase Auth)
- Login/logout com e-mail/senha, recuperação de senha via e-mail (PKCE).
- Sessão válida exigida; token expirado redireciona ao login automaticamente.
- Apenas os **3 administradores** (cadastrados no painel do Supabase) acessam o sistema.

### 13. Nuvem / sincronização (Supabase)
- `storage.js` vira camada unificada: cache em memória + LocalStorage + Supabase.
- Escritas **diferenciais** (insere/atualiza/exclui só o que mudou); backup local sempre; **reconciliação** offline→online no `init()`; migração inicial automática dos dados antigos do LocalStorage para a nuvem.

### 14. Controle de estoque (produção)
- Novo módulo `estoque.js` + tela **Produção** (`estoqueView.js`).
- Modelo **derivado**: `disponível = produzido − reservado − vendido` — sem contador que dessincroniza.
- **Produção obrigatória para vender**: sem produção suficiente, o pedido é bloqueado (criar ou editar) com mensagem clara; cancelado libera o estoque.
- Seletor de itens mostra **somente produtos disponíveis**; histórico de produção com exclusão; badges de saldo.
- Migração SQL `supabase/migration_estoque.sql` (colunas + tabela `productions` + RLS).

### 15. Planilha (CSV) de pedidos
- **Exportar** CSV compatível com Excel (separador `;`, BOM UTF-8), uma linha por item.
- **Importar** com detecção automática do cabeçalho, normalização de rótulos/enums (ex.: "Bolo"→"Bolo Inteiro", "Uber pelo cliente" → "Uber Cliente", "gratis" → "Cortesia"), **criação automática de produtos** no catálogo e **dry-run** de pré-visualização.
- Importados recebem `consomeEstoque = false` (não afetam o estoque).

### 16. Forma de pagamento Cortesia
- Novo método **Cortesia** zera o `valorTotal` do pedido (pedido grátis) em `order.orderTotalValue` e no modal (`recalcTotal`). Reconhece alias "grátis/gratuito" na importação.

### 17. Menu de navegação reorganizado
- Aba "Início" renomeada para **Dashboard** e a ordem ajustada para: **Dashboard, Produtos, Produção, Pedidos**.

### 18. Bases reutilizáveis (massas/recheios)
- Novo conceito **Base**: componente composto por insumos com quantidades (ex.: "Massa de bolo", "Recheio de brigadeiro"), com **custo total** e **custo por unidade de rendimento** calculados a partir dos insumos.
- Novo módulo puro `base.js` (regras: `createBase`, `custoBase`, `custoPorUnidadeBase`, `custoBaseItem`) e nova aba **Bases** (`inventoryView.js` + `index.html`), com modal de cadastro (nome, rendimento + unidade, componentes insumo/quantidade, preview de custo ao vivo).
- `storage.normalizeBase` garante o formato ao carregar; sincroniza com o Supabase via coluna JSONB.

### 19. Precificação usa bases + custo por linha
- O seletor de itens da Precificação agora lista **insumos e bases**; cada item da receita suporta `insumoId` **ou** `baseId`.
- Cada linha exibe o **custo proporcional ao vivo** e um **cabeçalho igual à tela de Bases**: *Ingrediente · Quantidade utilizada · Custo e gramas da embalagem · Quanto custou*.
- A detecção de "desatualizada" passa a considerar também mudanças de preço em insumos que compõem uma **base** usada na receita.
- `baseId` é preservado no `storage` (e no Supabase, pois `itens` viaja como JSONB).

---

## Segurança

- **Chave do Supabase fora do código versionado**: valores reais são injetados pelo `server.js` em `js/config.js` a partir de `.env` (local) ou env vars (Render); a `anon key` do Supabase é pública por design, com proteção via **RLS** do banco.
- **RLS** em `orders`, `products` e `productions`: somente usuários autenticados leem/escrevem.

---

## Performance

### 18. Otimização de inicial (mobile)
- **Logo otimizado:** `logo.png` 493 KB → **29 KB** (180×160) + `logo.webp` 3.5 KB usado via `<picture>` com `fetchpriority="high"` e dimensões explícitas; original preservado em `docs/logo-original-1179x1047.png`.
- **Fonte Quicksand assíncrona:** `@import` removido; `<link>` com `preconnect`, `media="print" onload` e `display=optional` — sem render-blocking.
- **CSS inline no HTML** via `tools/build-css.js` (marcadores `CSS_INLINE:START/END`) — elimina o bloqueio de renderização do CSS externo.
- **Cache inteligente no servidor:** HTML sem cache; arquivos `?v=NN` imutáveis por 1 ano em produção (bump de versão forçando atualização); módulos ES6 revalidam via **ETag** (304).
- **Compressão gzip/brotli** em produção.
- Resultado (Lighthouse mobile local): **94**, LCP ~2.5s, FCP ~2.4s, TBT ~29ms, **CLS 0.000**.

---

## Qualidade e manutenção

### 19. Testes automatizados (TDD)
- Suite com **node:test** (124/124 verdes): `order`, `product`, `estoque`, `dashboard`, `dateRange`, `describe`, `money`, `importExport`, helpers de storage mock.
- Regras de negócio em **funções puras** (sem DOM) para testes determinísticos; testes de integração com **navegador headless** (Chrome) para flagship de erros DOM read-only.

### 20. Servidor padrão da planilha
- `server.js`: servidor estático **Node puro** (sem dependências) com MIME, cache, ETag, compressão, proteção contra path traversal e injeção de env no `js/config.js`. Substitui o `npx serve`.

### 21. CRM de Clientes, Busca de CEP e Cartão Fidelidade
- Nova aba **Clientes** (`customerView.js`, `customerService.js`): visualização em tabela de clientes com histórico de compras, ticket médio e badges (VIP, Recorrente, Inativo, Aniversariante).
- **Busca de CEP Automática (ViaCEP)** no modal de cadastro com preenchimento instantâneo de logradouro, bairro, cidade e estado.
- **Cartão Fidelidade Digital**: a cada 10 pedidos o cliente conquista selos e recompensas automáticas.
- Ações rápidas de **resgate de clientes inativos** e parabéns com mensagens personalizadas no WhatsApp.

### 22. Cardápio Digital Público para Clientes (`cardapio.html`)
- Interface pública independente voltada para os clientes finais da confeitaria.
- **Pronta Entrega vs. Encomenda**: controle em tempo real de fatias e punkitos (com bloqueio por estoque) e bolos inteiros por encomenda.
- **Sacola Flutuante**: adição de itens, cálculo de taxa de entrega/retirada e envio estruturado para o Supabase e WhatsApp formatado.
- **Área do Cliente**: login por WhatsApp, histórico de pedidos e botão "Repetir Pedido".

### 23. Códigos Únicos PIN e PBA no Inventário
- Insumos identificados pelo padrão **`PIN0001`**, **`PIN0002`**...
- Bases identificadas pelo padrão **`PBA0001`**, **`PBA0002`**...
- Migração automática de itens legados (`ensureCodigos()`) sem duplicidades ou perda de histórico.

### 24. Controle de Estoque Físico de Insumos e Bases
- Adicionados campos **`Estoque Atual`** e **`Estoque Mínimo`** (ponto de reposição).
- Ao registrar uma nova compra de insumo, a quantidade comprada incrementa automaticamente o estoque atual.
- Semáforo visual de status: 🟢 **Normal**, 🟡 **Baixo** (atingiu ou ficou abaixo do mínimo) e 🔴 **Zerado**.

### 25. Filtros Rápidos por Categoria no Inventário
- Barra com pílulas interativas e contadores em tempo real: `[ Todos ]`, `[ 🥣 Ingredientes ]`, `[ 🍰 Bases ]` e `[ ⚠️ Estoque Baixo ]`.

### 26. Importador Inteligente do Excel na Precificação
- Modal dedicado (`excelModal.js`, `excelImporter.js`) para colar 4 colunas copiadas diretamente de planilhas do Excel.
- Reconhecimento automático de insumos existentes, novos insumos e variações de preços com prévia e confirmação.
- Grid de receitas e componentes calibrado com alinhamento pixel-perfect para pesagem em gramas, ml ou unidades.

### 27. Expansão da Suíte de Testes Automatizados
- Expansão de 124 para **227 testes unitários automatizados** com `node:test`, cobrindo 100% das novas regras de cardápio, checkout, clientes, fidelidade, insumos, bases e importador do Excel.

### 28. Reconhecimento de Bases (`PBA`) no Importador do Excel
- O importador do Excel (`excelImporter.js` e `excelModal.js`) agora reconhece automaticamente receitas **Bases cadastradas** (`PBA0001` ou nome da Base como "Base Brigadeiro Tradicional"), além de Insumos (`PIN`).
- Distinção visual no modal de conferência com badge roxo `🍰 Base Cadastrada` e `🍰 Base Similar`, exibindo o custo calculado dinamicamente em tempo real proporcional ao rendimento.
- Ao confirmar a importação, o item é inserido diretamente na precificação como `{ tipo: 'base', refId: baseId }`, sem gerar insumo duplicado no inventário.

### 29. Correção do Cálculo de Lucro Bruto e CMV no Dashboard
- O cálculo de Lucro Bruto do Dashboard (`dashboardService.js`) foi corrigido para utilizar o **Custo Real Unitário de Produção (CMV Real)** `(custoIngredientes ÷ rendimento + embalagem + custoAdicional)` em vez do preço sugerido de venda com multiplicador de lucro 3×.
- O faturamento/receita continua sendo apurado estritamente pelo **preço original que o confeiteiro cadastrou manualmente na Lista de Produtos** e vendeu nos pedidos, eliminando distorções de lucro negativo.

### 30. Wizard de Personalização de Bolos no Cardápio (7 Etapas) & Novo Tipo Bolo Naked
- Implementado assistente interativo passo a passo unificado sob o card **Monte seu Bolo** no Cardápio Digital (`cardapio.html` e `js/cardapio.js`):
  - **Etapa 1:** Seleção do tamanho (P, M, G, etc.) com exibição clara de peso e rendimento em fatias.
  - **Etapa 2:** Escolha do estilo (*Naked Cake* rústico ou *Bolo Decorado* em chantininho com adicionais e confeitos dinâmicos cadastrados na aba Produtos como `tipoProduto === 'Adicional'`).
  - **Etapa 3:** Escolha do sabor artesanal com filtro dinâmico baseado no estilo selecionado na Etapa 2 (quando *Naked Cake* for escolhido, lista apenas produtos cadastrados como `tipoProduto === 'Bolo Naked'`, com exemplo padrão *Pink Lemonade*; quando *Bolo Decorado* for escolhido, lista os produtos de `Bolo Inteiro`).
  - **Etapas 4 e 5:** Agendamento de data e horário/período de retirada/entrega sob encomenda.
  - **Etapa 6:** Termos essenciais com aceite obrigatório (transporte exclusivo no piso do carro com ar-condicionado, 100% pagamento integral PIX adiantado, alinhamento de decorações especiais no WhatsApp).
  - **Etapa 7:** Campo de observações (dedicatória/escrita na tábua, restrições) e resumo completo com valor total atualizado ao vivo.
- Mensagem de WhatsApp estruturada detalhando todas as escolhas, estilo, adicionais, agendamento e observações do bolo personalizado.
### 31. Auto-Criação de Produtos a Partir de Pedidos, Reconhecimento Flexível de Decorações e Layout Detalhado de Pedidos
- **Auto-criação no Catálogo (`ensureProduct`):** Quando um pedido inclui um bolo personalizado (sabor/tamanho) ou adicionais/decorações (ex.: *Papel Arroz*, *Granulado*) que ainda não existem no catálogo/inventário, o sistema cadastra o produto automaticamente no inventário com seu tipo, tamanho e valor unitário, permitindo que seja preenchido e selecionado nos detalhes e na edição de pedidos sem deixar campos vazios.
- **Reconhecimento Flexível de Adicionais e Decorações:** Suporte a tipos compatíveis (`Decoração` $\leftrightarrow$ `Adicional` e `Bolo Inteiro` $\leftrightarrow$ `Bolo Naked`) e higienização inteligente de prefixos (`Decoração`, `Adicional`, `Confeito`) e sufixos de tamanho, garantindo que confeitos como *Granulado Belga*, *Confeito Granulado Belga Callebaut* e *Papel Arroz* sejam sempre reconhecidos e vinculados corretamente.
- **Layout de Pedidos, Impressão Otimizada e Badge de Alerta:**
  - Alternador de visualização entre Grade e Lista Detalhada (100% texto, sem emojis) com paginação de 10 pedidos por página e controles mobile.
  - Botão de impressão individual em destaque no cabeçalho do pedido e botão de impressão em lote de todos os pedidos filtrados.
  - Regras de impressão avançadas (`@page { margin: 6mm 8mm; }` e `page-break-inside: avoid`) para evitar quebra de comandas em folhas A4 e suporte natural a bobinas térmicas de 80mm/58mm.
  - Indicador numérico (badge de alerta) em tempo real na aba **Pedidos** sinalizando a quantidade de encomendas com status `Pendente` aguardando confirmação.

### 32. Padronização Visual da Tela de Produtos e Modal Elegante de Exclusão
- **Botões e Cards de Produtos Padronizados (`productList.js` & `styles.css`):**
  - Substituição dos emojis soltos (`✏️` e `🗑️`) por botões de ação em texto limpos e elegantes (`Editar` e `Excluir` com variante `action-danger`), no mesmo padrão do painel de Pedidos.
  - Reorganização visual dos cards com cabeçalho (tipo do produto + status do estoque), corpo tipográfico estruturado e rodapé com preço em destaque e botões de ação alinhados.
- **Modal de Cadastro e Edição Modernizado (`index.html` & `productForm.js`):**
  - Campos em grid harmonioso com labels claras, foco visual nos inputs e seletor de tamanho dinâmico (com opções descritivas de rendimento e medidas em cm).
- **Modal Personalizado de Confirmação de Exclusão (`productDeleteModal`):**
  - Substituição do `window.confirm` nativo do navegador por um diálogo modal integrado ao tema da aplicação (Dark/Light mode), exibindo o nome do produto a ser excluído, texto de alerta, botão de cancelamento e botão destrutivo (`Sim, Excluir`).

### 33. Padronização Visual da Tela de Inventário e Modal Customizado de Exclusão
- **Ações e Badges na Tabela de Insumos e Bases (`inventoryView.js` & `styles.css`):**
  - Substituição dos botões de emoji soltos (`✏️` e `🗑️`) por botões de ação em texto puro (`Editar` e `Excluir` em vermelho suave `action-danger`), com layout compacto e alinhamento à direita na coluna de ações.
  - Badges de estoque higienizados para texto puro (*Zerado*, *Baixo*, *Normal*), eliminando emojis visuais.
- **Modal Personalizado de Confirmação de Exclusão (`inventoryDeleteModal`):**
  - Fim do `window.confirm` para Insumos e Bases: exibição de diálogo modal temático com código (`PINXXXX`/`PBAXXXX`), nome do item e botões *Cancelar* e *Sim, Excluir*.
- **Padronização dos Modais de Cadastro/Edição de Insumos e Bases:**
  - Botões de rodapé unificados (*Salvar Insumo* e *Salvar Base*).

### 34. Padronização Visual da Tela de Produção, Modal de Registro e KPIs em Tempo Real
- **Modal de Registro de Produção (`#producaoModal`):**
  - Transformação do antigo formulário inline no topo da página em um modal dedicado (`#producaoModal`), seguindo o padrão de design do sistema.
  - Abertura através do botão `＋ Registrar Produção` no cabeçalho ou ao clicar em `＋ Produzir` diretamente na linha do produto no saldo (pré-selecionando o item e focando no campo de quantidade).
- **Cards de Métricas e KPIs de Produção:**
  - Painel de 4 indicadores em tempo real no topo da view: *Produzido no Período*, *Reservado* (em pedidos abertos), *Disponível* (pronto para entrega) e *Itens Zerados* (sem saldo).
- **Barra de Busca e Filtros Rápidos:**
  - Campo de busca em tempo real por nome do produto ou categoria (`#estoqueSearch`).
  - Pílulas de filtro por categoria (*Todos*, *Fatias*, *Punkitos*, *Bolos*) com contadores dinâmicos integrados.
- **Modal Personalizado de Exclusão no Histórico de Produção (`#producaoDeleteModal`):**
  - Substituição do `window.confirm` nativo por modal temático de confirmação com quantidade, produto e data formatada.
### 35. Matriz de Rentabilidade na Tela de Precificação
- **Tabela Geral de Rentabilidade (`#precOverviewPanel` / `pricingView.js`):**
  - Tabela comparativa consolidada exibindo todos os produtos do catálogo com: *Custo Unitário Real (CMV)*, *Preço de Venda*, *Lucro Bruto (R$)*, *Margem Real (%)* e *Status da Ficha*.
  - Pílulas de filtro dinâmico (*Todos*, *Precificados*, *Sem Ficha*, *Desatualizados*) com contadores ao vivo e campo de busca instantânea.
  - Ao clicar em qualquer produto da matriz ou no botão *Editar Ficha / Precificar*, o sistema carrega a receita e foca na edição.

### 36. Resumo Consolidado de Cozinha (Produção do Dia)
- **Impressão Direta para Bancada de Preparo (`orderList.js`):**
  - Botão **`Resumo da Cozinha`** na barra de ferramentas da tela de Pedidos.
  - Consolida automaticamente as quantidades totais de todos os itens a preparar a partir dos pedidos filtrados (agrupados por tipo, tamanho e sabor), além de compilar dedicatórias e restrições alimentares.
  - Saída compatível com impressoras térmicas (80mm/58mm) e folhas A4.

### 37. Padronização Visual, Paginação e Modal de Exclusão no CRM de Clientes
- **Modal Personalizado de Exclusão (`#customerDeleteModal`):**
  - Fim do diálogo nativo do navegador para exclusão de clientes.
- **Ações e Navegação Paginada (`customerView.js`):**
  - Botões de ação em texto limpo (*Histórico*, *Editar*, *Excluir* com variante `action-danger`), eliminando emojis soltos.
  - Paginação rápida (10 clientes por página) com contador e navegação.

### 38. Sinalização de "Esgotado" no Cardápio Digital Público
- **Feedback Visual Instantâneo (`cardapio.js` & `cardapio.css`):**
  - Produtos de pronta entrega (Fatias, Punkitos) sem estoque de produção passam a exibir badge *Esgotado por hoje*, botão desabilitado e opacidade diferenciada.

### 39. Indicador de Versão e Modal de Novidades do Sistema (v2.4.0)
- **Botão de Versão no Rodapé do Menu (`#btnSystemInfo` & `systemInfo.js`):**
  - Badge fixo na barra lateral esquerda (`v2.4.0` / *Novidades*) com indicador pulsante de novidades não visualizadas (`#versionDot` + `localStorage`).
- **Modal Interativo de Novidades (`#modalSystemInfo`):**
  - Painel com resumo visual das melhorias divididas por categorias: *Produção & Cozinha*, *Precificação*, *CRM de Clientes* e *Cardápio Digital*.
  - Acessível a qualquer momento por administradores e funcionários da equipe.

### 40. Precificação Profissional & Parâmetros de Custos (SENAC / Sebrae)
- **Nova Ficha Técnica com DRE Unitário & Markup Divisor (`pricing.js` & `pricingView.js`):**
  - Cálculo oficial por Markup Divisor eliminando perdas ocultas por multiplicador fixo.
  - Apontamento de tempo de preparo/decoração em minutos e margem de lucro líquido real desejada.
  - Demonstrativo de Preço (DRE) com detalhamento de insumos, mão de obra, custos fixos rateados, embalagens, preço mínimo viável (ponto de equilíbrio), preço sugerido e lucro líquido em R$ por unidade.
  - Interface 100% texto puro, sem emojis, com botões e badges elegantes integrados ao tema.

### 41. Novo Tipo "Docinho" e Filtragem de Itens Não Precificáveis
- **Novo Tipo de Produto "Docinho" (`PRODUCT_TYPES`):**
  - Adicionado suporte nativo ao tipo `Docinho` em todo o ecossistema (catálogo de produtos, pedidos, controle de estoque e precificação).
  - Produto de exemplo **Brigadeiro** criado como padrão (`tipoProduto: 'Docinho'`, `valor: R$ 4,00`, `detalhes: 'Brigadeiro tradicional artesanal 100% cacau'`).
- **Filtragem Inteligente na Tela de Precificação (`pricingView.js`):**
  - Itens dos tipos `Adicional` e `Decoração` passam a ser ocultados da tela de Precificação (seletor de produtos, filtro de tipos e Matriz de Rentabilidade), uma vez que são itens acessórios/complementares que não passam por ficha técnica.

### 42. Padronização de Nomenclaturas Financeiras & Margem de Contribuição
- **Margem de Contribuição no DRE (`pricing.js` & `pricingView.js`):**
  - Adicionada linha explícita no Demonstrativo de Preço exibindo a **Margem de Contribuição** em R$ e % por unidade.
- **Nomenclaturas Padronizadas e Claras (`index.html` & `pricingView.js`):**
  - Ficha Técnica: Atualizado para *Margem Líquida Desejada (%)*.
  - Demonstrativo: Atualizado para *Margem Líquida Real: R$ X,XX /un (XX.X%)*.
  - Matriz de Rentabilidade: Colunas renomeadas para *Lucro Líquido (R$)* e *Margem Líquida (%)*.
  - Parâmetros de Custo: Atualizado para *Margem Líquida Padrão (%)*.

### 43. Indicadores de Ponto de Equilíbrio Operacional (Break-Even) & Ajustes nos Parâmetros de Custo
- **Ponto de Equilíbrio por Produto na Precificação (`pricing.js` & `pricingView.js`):**
  - Cálculo automático da meta de vendas em unidades por mês e por dia útil necessárias para cobrir o total de custos fixos e pró-labore da empresa através da Margem de Contribuição unitária.
  - Box informativo no DRE da Precificação destacando a meta mensal (`un/mês`), meta diária (`un/dia`) e o faturamento mínimo mensal correspondente.
- **Card de Progresso do Ponto de Equilíbrio no Dashboard (`dashboard.js`, `dashboardService.js` & `index.html`):**
  - Painel de acompanhamento em tempo real no topo da tela inicial de Vendas.
  - Mede a Margem de Contribuição acumulada pelos pedidos ativos no período contra a meta mensal dos Gastos Fixos Operacionais (Custos Fixos + Pró-Labore/Equipe).
  - Barra de progresso visual com badge percentual e status dinâmico (*Faltam R$ X,XX para o ponto de equilíbrio* / *Contas do mês 100% pagas!*).
- **Regime de Contratação nos Parâmetros de Custo (`costSettings.js` & `pricingView.js`):**
  - Ao alternar para o regime *Prestador / Fixo (Sem encargos)*, o campo *Encargos Sociais CLT (%)* é automaticamente zerado e configurado como somente leitura, recalculando as taxas horárias e persistindo `0%` sem reverter para o padrão. Ao retornar para *CLT*, o campo é reabilitado para edição.

---

> **Nota:** o histórico antigo destes documentos fica preservado no git (versões anteriores da branch `main`).