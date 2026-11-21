# Punk Bolos — Funcionalidades do Sistema

Sistema web integrado para gestão de pedidos, catálogo de produtos, controle de produção, CRM de clientes, inventário, precificação e cardápio digital da **Punk Bolos**.

> **Stack:** HTML5 + CSS3 + JavaScript (ES6+, módulos) — sem dependências pesadas.
> **Persistência:** LocalStorage (offline) e Supabase (nuvem em tempo real).
> **Autenticação:** Supabase Auth para administradores.
> **Responsividade:** Otimizado para celular, tablet e desktop.

---

## 1. Módulos e Abas do Painel Administrativo

### 1.1 Dashboard
- **Painel Operacional "Visão do Dia":** Widget no topo com foco na rotina diária da cozinha: Encomendas para Hoje (pendentes vs. prontas), Pronta Entrega disponível no estoque para venda imediata, e Alertas de Reposição de Insumos zerados ou em nível crítico com links de ação rápida (clique em Alertas abre o Inventário já filtrado por Estoque Baixo).
- **Cards de Métricas:** Faturamento total, quantidade de pedidos, ticket médio, lucro bruto com subtítulo dinâmico de Margem Média (%) e CMV Médio (%), além de contadores de status do fluxo de produção.
- **Ponto de Equilíbrio Inteligente:** Barra de progresso com status de meta mensal e diária, identificação automática de mês encerrado (*Meta Atingida com excedente* ou *Não Atingido*) e acompanhamento em tempo real para meses em aberto.
- **Gráficos e Logística:** Faturamento diário, distribuição por status, divisão de receita por meios de pagamento (PIX, Crédito, Débito, Dinheiro) e comparativo de canais de entrega (Retirada no Balcão, Entrega Própria e Uber Cliente).
- **Paridade de Categorias e Rankings de Sabores:** Filtros rápidos por categoria e rankings de sabores dedicados para 4 frentes: Fatias, Punkitos, Bolos (incluindo Bolo Naked) e Docinhos.
- **Filtro por Período:** Hoje, 7 dias, Este Mês e Faixa Customizada (De/Até).
- **Performance & Animação Contínua dos Gráficos:** Atualização inteligente via `chart.update()` reaproveitando as instâncias do Chart.js na troca de datas ou tema, eliminando destruição de canvases, vazamentos de memória e cintilação de tela.

### 1.2 Produtos
- **Micro-KPIs do Cardápio:** 4 indicadores analíticos no topo da tela (`Total de Produtos`, `Sem Estoque` com alerta visual, `Fichas Pendentes` sem precificação e `Preço Médio` do cardápio).
- **Modos de Exibição Grade vs. Tabela:** Alternador visual no topo permitindo alternar entre visualização em cards (`Grade`) ou tabela analítica tipo planilha (`Tabela`), com preferência salva no `localStorage`.
- **Faixa Financeira & Margem Real (%):** Exibição do Preço de Venda, Custo Unitário (CMV) e **Margem Real (%)** calculada a partir da ficha técnica com badges coloridos de rentabilidade (*Saudável >= 50%*, *Moderada 30-49%*, *Baixa < 30%* ou *Sem ficha*).
- **Tabela Analítica Responsiva:** Visualização compacta em modo Tabela com rolagem horizontal em dispositivos menores e colunas dedicadas para Categoria, Produto e Detalhes, Estoque, Preço de Venda, Custo Unitário, Margem e Ações.
- **Ações Ergonômicas:** Botões de ação em texto puro (`Editar`, `Precificar` com atalho direto para a ficha técnica, e `Excluir` com confirmação segura).
- **Pílulas de Categoria & Busca Instantânea:** Navegação rápida por categorias com badges de contagem em tempo real (`Todos`, `Fatias`, `Punkitos`, `Bolos`, `Docinhos`, etc.) e campo de busca textual por sabor/título.
- **Paginação Consistente:** Paginação de 12 produtos por página mantida de forma unificada entre a grade e a tabela.
- **Tamanhos e Detalhes:** Tamanhos exclusivos para bolos inteiros e bolos naked (Mini, PP, P, M, G, GG, Bento Cake, Coração).

### 1.3 Produção (Estoque de Bolos)
- **Modelo de Estoque Derivado:** `Disponível = Produzido - Reservado - Vendido`.
- **Busca Instantânea & Filtros por Categoria:** Barra de pesquisa em tempo real por nome/sabor de produto e pílulas interativas com contadores dinâmicos (`Todos`, `Fatias`, `Punkitos`, `Docinhos` e `Bolos`) para localização ágil dos itens na bancada de trabalho.
- **Ação Rápida "＋ Produzir":** Botão direto na linha da tabela de saldo que abre o modal pré-selecionado para agilizar o apontamento da cozinha.
- **Destaque Visual de Alerta:** Destaque automático em linhas com reservas pendentes sem estoque suficiente para entrega.
- **Controle de Disponibilidade:** Bloqueia automaticamente a venda de produtos sem produção suficiente.
- **Histórico de Produções:** Registro auditável de lotes produzidos com data e observações.

### 1.4 Pedidos
- **Sincronização em Tempo Real (Supabase WebSockets):** Conexão nativa via Phoenix Channels (`realtime:public:orders`) autenticada com token de sessão (RLS), que escuta novos pedidos (`INSERT`), atualizações (`UPDATE`) e exclusões (`DELETE`) instantaneamente sem necessidade de recarregar a página ou disparar polling contínuo.
- **Alerta Sonoro de Cozinha (Web Audio API):** Sinal sonoro de comanda com 2 tons harmônicos (Ré e Lá / D5 e A5) sintetizado pelo próprio navegador via osciladores senoidais puros (zero latência, sem download de arquivos de áudio e 100% funcional offline). Inclui botão de controle ("Som: Ativado / Desativado") memorizado no `localStorage` e desbloqueio suave do contexto de áudio.
- **Destaque Visual Animado na Esteira:** Novos pedidos que chegam em tempo real recebem destaque imediato com efeito pulsante na borda e sombra (`orderHighlightPulse`) na esteira da cozinha para rápida identificação visual pela equipe.
- **Badge de Status de Conexão em Tempo Real:** Indicador de status no cabeçalho da página ("Tempo Real: Ativo" ou "Tempo Real: Reconectando...") com gerenciamento de reconexão automática por backoff exponencial e detecção de retorno da conexão de rede (`online`).
- **Modo Cozinha (Hoje / Ativos):** Alternador no topo da tela que isola a fila imediata de trabalho da cozinha (pedidos com entrega para hoje e pedidos ativos em `Pendente`, `Em Produção` ou `Embalado`), ignorando o histórico de pedidos concluídos/cancelados de outros períodos para foco total da equipe, com preferência memorizada no `localStorage`.
- **Visão Compacta & Detalhes Expansíveis:** Cards redesenhados com resumo inteligente de alto impacto (cliente, WhatsApp, entrega/retirada, resumo discriminado de itens `formatItemsSummary`, tag de observação e valor total em destaque no cabeçalho).
- **Avanço Rápido de Status (Esteira Operacional):** Botão contextual no card para transição imediata sem modais:
  - De **Pendente** para **"Iniciar Produção"**
  - De **Em Produção** para **"Marcar Embalado"**
  - De **Embalado** para **"Concluir"**
- **Expansão Individual e Global:** Botão "Ver detalhes / Ocultar detalhes" em cada card para exibir lista discriminada de itens com subtotais, endereço completo de entrega, observações e ações de gestão (Editar, Duplicar, Cancelar, Excluir), além do alternador global "Expandir Todos / Recolher Todos".
- **Filtros Rápidos por Status (Pills):** Pílulas interativas com contadores em tempo real (`Todos`, `Pendentes`, `Em Produção`, `Embalados`, `Concluídos`, `Cancelados`) integradas dinamicamente ao modo ativo (Modo Cozinha ou filtro global de data).
- **Gestão Completa de Pedidos:** Ações de criar, editar, duplicar (com reset de status), concluir, cancelar e excluir.
- **Numeração Automática:** Começa em 1001 e nunca repete.
- **Modal de Venda Ágil (Redesign Moderno de Novo Pedido):** Formulário reestruturado em 3 blocos visuais nítidos (*Cliente & Atendimento*, *Produtos & Quantidades* e *Pagamento & Entrega*):
  - *Atalho "Venda Rápida Balcão":* Botão no cabeçalho do modal que preenche automaticamente Cliente = "Balcão", Entrega = "Retirada no Balcão", Status = "Concluído", direcionando o foco diretamente para a seleção de produtos.
  - *Cards Modernos de Itens com Stepper Ergonômico:* Seletor integrado de produtos com exibição de preço unitário e disponibilidade, botões rápidos `[ - ]` e `[ + ]` para ajuste de quantidade sem necessidade de abrir o teclado virtual, e subtotal da linha calculado ao vivo.
  - *Segmented Controls (Pílulas de Toque Direto):* Substituição de dropdowns suspensos tradicionais por botões de seleção de 1 toque para Forma de Pagamento (`PIX`, `Crédito`, `Débito`, `Dinheiro`, `Cortesia`), Modalidade de Entrega (`Retirada`, `Entrega Própria`, `Uber Cliente`) e Status do Pedido.
  - *Barra Inferior Fixa (Sticky Bottom):* Rodapé fixado na parte inferior com valor total em destaque e botão principal "Salvar Pedido" sempre visível e acessível sem rolagem.
- **Formas de Pagamento:** PIX, Dinheiro, Crédito, Débito e Cortesia (R$ 0,00).
- **Resumo no WhatsApp:** Botão para enviar o resumo formatado do pedido diretamente para o cliente.

### 1.5 Clientes (CRM & Fidelidade)
- **Histórico do Cliente:** Visualização da linha do tempo de todos os pedidos realizados, valor acumulado e ticket médio.
- **Filtros Rápidos (Pills):** Todos, VIPs, Recorrentes, Inativos (para resgate) e Aniversariantes do mês/dia.
- **Busca de Endereço por CEP:** Integração automática com o **ViaCEP** preenchendo rua, bairro, cidade e estado.
- **Cartão Fidelidade:** Selos acumulados a cada pedido e cálculo automático de recompensas.

### 1.6 Inventário & Estoque Físico
- **Códigos Únicos de Identificação:**
  - `PIN0001`, `PIN0002`... para **Ingredientes / Insumos**.
  - `PBA0001`, `PBA0002`... para **Bases (receitas compostas)**.
- **Controle de Estoque Físico:** Campos de `Estoque Atual` e `Estoque Mínimo` (alerta de reposição).
- **Semáforo Visual de Status:** Normal, Baixo (no limite de reposição) e Zerado.
- **Tabela de 8 Colunas:** Código, Categoria, Nome, Custo Ref., Última Compra, Estoque Atual, Status e Ações.
- **Filtros Rápidos por Categoria:** `[ Todos ]`, `[ Ingredientes ]`, `[ Bases ]` e `[ Estoque Baixo ]`.
- **Lista de Compras Automática (Atacadista):** Botão "Lista de Compras" que abre modal consolidado de reposição para cotação em atacadista, calculando a quantidade sugerida de compra com base na margem de segurança (2x o estoque mínimo) e no histórico de tamanho de embalagens, com ações instantâneas de "Copiar p/ WhatsApp" (formatação limpa) e "Imprimir Lista" (prancheta física de conferência).
- **Entrada Inteligente de Compras:** Ao cadastrar uma compra, o estoque atual é somado automaticamente.

### 1.7 Precificação & Ficha Técnica Profissional
- **Metodologia Sebrae & Markup Divisor:** Formação de preço profissional dividida em Custos Variáveis (Insumos + Embalagens), Despesas Variáveis (Taxas + Impostos) e Margem de Contribuição unitária com termômetro Sebrae (*Excelente > 50%*, *Saudável 30-50%*, *Alerta < 30%*).
- **Preço Alvo / Fixar Preço:** Campo de formação reversa que permite fixar o preço de venda pretendido (ex.: R$ 22,80) e calcula a margem líquida real automaticamente.
- **Alerta de Insumo com Custo Zero:** Sinalização visual nas linhas de ingredientes e banner de aviso caso algum insumo esteja sem compra cadastrada no Inventário.
- **Ponto de Equilíbrio Operacional:** Metas em unidades (mês/dia) e faturamento mínimo para pagamento dos gastos fixos da confeitaria.
- **Montagem de Receitas:** Associação de insumos e bases com quantidades exatas.
- **Importador Rápido do Excel:** Modal para colar 4 colunas (`Ingrediente`, `Custo Embalagem`, `Gramas Embalagem`, `Gramas Utilizadas`) com reconhecimento inteligente de insumos e **Bases cadastradas (`PBA`)**, cálculo de custo em tempo real e criação facilitada.

### 1.8 Compras (Entrada de Notas / Feira em Lote)
- **Persistência Segura na Nuvem (Supabase):** Sincronização automática das compras em lote com tabela dedicada no banco de dados (`public.purchases`), garantindo backup contínuo, escrita diferencial, histórico seguro e acesso unificado entre computadores e celulares.
- **Registro em Lote de Entradas:** Formulário dinâmico para registrar múltiplos insumos de uma mesma nota ou compra na feira/atacadista com data, fornecedor (com sugestões via datalist: Assaí, Atacadão, Sam's Club, etc.), forma de pagamento e observações.
- **Gatilho de Lista de Compras:** Botão no cabeçalho permitindo conferir a lista de ingredientes em falta e insumos críticos antes de registrar novas entradas.
- **Cálculo Automático de Custo Unitário e Total:** Exibição em tempo real do custo por unidade (R$ / g, R$ / kg, R$ / un) e do valor total acumulado da compra.
- **Atualização Automática no Inventário & Precificação:** Ao salvar a compra, o estoque físico de cada insumo é somado imediatamente e o custo unitário vigente é atualizado para cálculo do custo de receitas no módulo de precificação.
- **Espelho da Compra & Exclusão Segura:** Modal detalhado com todos os itens da compra e modal de exclusão com reversão automática das quantidades no estoque e do histórico de compras.
- **Métricas & Gestão:** Cards com total gasto no mês, contagem de compras e itens adquiridos, busca textual instantânea por código CMP, fornecedor ou insumo, filtro por meio de pagamento e paginação (10 itens por página).
- **Leitura Inteligente de Notas (Foto IA & XML):** Botão "Ler Nota com IA" com suporte duplo: foto tirada com a câmera do celular ou upload de imagem lida via Google Gemini Vision API (Google AI Studio gratuito) e leitura instantânea de arquivo .XML de NF-e/NFC-e. Reconhece automaticamente o fornecedor, data, forma de pagamento, valores e cruza os ingredientes com o Inventário por casamento difuso de texto (fuzzy matching).

### 1.9 Financeiro & Metas (SENAC / Sebrae)
- **Gestão de Custos Fixos & Mão de Obra (MOD):** Cadastro e rateio de despesas operacionais da estrutura física (energia, gás, água, internet, manutenção, aluguel, contador/MEI) e equipe (pró-labore dos confeiteiros, ajudantes e encargos sociais CLT ou contratação fixa).
- **Desdobramento de Metas & Faturamento Alvo:** Planejamento de faturamento mensal e conversão automática em metas fracionadas por semana e por dia de produção.
- **Ponto de Equilíbrio Operacional (Break-Even):** Cálculo do faturamento mínimo necessário para cobrir 100% dos custos fixos e salários sem prejuízo. Acompanhamento real do mês vigente via termômetro interativo com percentual de atingimento, margem gerada acumulada pelas vendas e projeção de excedente de lucro.
- **DRE Sintético Projetado:** Demonstrativo financeiro completo (Faturamento Bruto, Deduções de Venda e Taxas, Faturamento Líquido, Custo das Mercadorias Vendidas - CMV, Margem de Contribuição, Gastos Operacionais e Lucro Líquido Final com badge de saúde financeira).
- **Modo de Edição Seguro:** Interface com alternador visual "Editar Custos / Salvar Parâmetros / Cancelar" e cálculo dinâmico em tempo real de horas produtivas e custo do minuto de produção.

---

## 2. Cardápio Digital Público (`cardapio.html`)

Interface pública voltada para os clientes finais:
- **Catálogo Visual:** Exibição de fotos, sabores e preços dos produtos.
- **Pronta Entrega vs. Encomenda:**
  - *Fatias e Punkitos:* trava automática de quantidade baseada no estoque disponível.
  - *Monte seu Bolo (Wizard de 7 Etapas):* personalização guiada passo a passo através de um card único:
    - **Etapa 1:** Escolha do tamanho do bolo (P, M, G com rendimento em fatias e peso aproximado).
    - **Etapa 2:** Estilo & Decoração (*Naked Cake* rústico sem cobertura ou *Bolo Decorado* com cobertura suave em chantininho e adicionais/confeitos como Granulado Belga, Morangos, etc.).
    - **Etapa 3:** Escolha do sabor (filtrado dinamicamente: lista sabores de *Bolo Naked* quando Naked Cake for escolhido, e sabores de *Bolo Inteiro* quando Bolo Decorado for escolhido).
    - **Etapa 4:** Escolha da data de entrega/retirada.
    - **Etapa 5:** Escolha do melhor horário/período.
    - **Etapa 6:** Termos e regras importantes (transporte exclusivamente de carro com ar-condicionado, 100% pagamento integral PIX adiantado para entrar na produção, alinhamento de acréscimos especiais no WhatsApp).
    - **Etapa 7:** Observações e escrita na tábua + Resumo detalhado com valor total atualizado em tempo real.
- **Sacola de Compras Flutuante & Persistente:** Adição de itens, cálculo de totais em tempo real e salvamento automático no `localStorage` do navegador para evitar perda de carrinho e do bolo personalizado caso o cliente recarregue a página ou alterne de aplicativo no celular.
- **Área do Cliente:** Login simples via WhatsApp, cartão fidelidade e botão "Repetir Pedido".
- **Fechamento no WhatsApp & Supabase:** Envia o pedido estruturado diretamente para o banco de dados e abre a conversa no WhatsApp formatada com todos os detalhes e adicionais do bolo, utilizando redirecionamento nativo blindado contra bloqueadores de popups no Safari (iOS) e Chrome (Android).
- **Metatags Open Graph & Redes Sociais:** Metadados ricos (`og:image`, `og:title`, `og:description`) e favicon para geração de prévias visuais convidativas com miniatura e resumo ao compartilhar o link do cardápio no WhatsApp, Instagram e redes sociais.