# Punk Bolos — Funcionalidades do Sistema

Sistema web integrado para gestão de pedidos, catálogo de produtos, controle de produção, CRM de clientes, inventário, precificação e cardápio digital da **Punk Bolos**.

> **Stack:** HTML5 + CSS3 + JavaScript (ES6+, módulos) — sem dependências pesadas.
> **Persistência:** LocalStorage (offline) e Supabase (nuvem em tempo real).
> **Autenticação:** Supabase Auth para administradores.
> **Responsividade:** Otimizado para celular, tablet e desktop.

---

## 1. Módulos e Abas do Painel Administrativo

### 1.1 Dashboard
- **Painel Operacional "Visão do Dia":** Widget no topo com foco na rotina diária da cozinha: Encomendas para Hoje (pendentes vs. prontas), Pronta Entrega disponível no estoque para venda imediata, e Alertas de Reposição de Insumos zerados ou em nível crítico com links de ação rápida.
- **Cards de Métricas:** Faturamento total, quantidade de pedidos, ticket médio, lucro bruto com subtítulo dinâmico de Margem Média (%) e CMV Médio (%), além de contadores de status do fluxo de produção.
- **Ponto de Equilíbrio Inteligente:** Barra de progresso com status de meta mensal e diária, identificação automática de mês encerrado (*Meta Atingida com excedente* ou *Não Atingido*) e acompanhamento em tempo real para meses em aberto.
- **Gráficos e Logística:** Faturamento diário, distribuição por status, divisão de receita por meios de pagamento (PIX, Crédito, Débito, Dinheiro) e comparativo de canais de entrega (Retirada no Balcão, Entrega Própria e Uber Cliente).
- **Paridade de Categorias e Rankings de Sabores:** Filtros rápidos por categoria e rankings de sabores dedicados para 4 frentes: Fatias, Punkitos, Bolos (incluindo Bolo Naked) e Docinhos.
- **Filtro por Período:** Hoje, 7 dias, Este Mês e Faixa Customizada (De/Até).

### 1.2 Produtos
- **Catálogo Completo:** Cadastro de bolos inteiros, bolos naked, fatias, punkitos, docinhos, adicionais e confeitos.
- **Pílulas de Categoria & Busca Instantânea:** Navegação rápida por categorias com badges de contagem em tempo real (`Todos`, `Fatias`, `Punkitos`, `Bolos`, `Docinhos`, etc.) e campo de busca textual por sabor/título.
- **Paginação Eficiente:** Visualização em grade de 12 produtos por página, com navegação responsiva (Anterior/Próxima e total de páginas/itens).
- **Tamanhos e Detalhes:** Tamanhos exclusivos para bolos inteiros e bolos naked (Mini, PP, P, M, G, GG, Bento Cake, Coração).
- **Valores e Descrições:** Valores de venda sugeridos e integração com controle de estoque.

### 1.3 Produção (Estoque de Bolos)
- **Modelo de Estoque Derivado:** `Disponível = Produzido - Reservado - Vendido`.
- **Controle de Disponibilidade:** Bloqueia automaticamente a venda de produtos sem produção suficiente.
- **Histórico de Produções:** Registro auditável de lotes produzidos com data e observações.

### 1.4 Pedidos
- **Gestão Completa de Pedidos:** Ações de criar, editar, duplicar (com reset de status), concluir, cancelar e excluir.
- **Numeração Automática:** Começa em 1001 e nunca repete.
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
- **Semáforo Visual de Status:** 🟢 Normal, 🟡 Baixo (no limite de reposição) e 🔴 Zerado.
- **Tabela de 8 Colunas:** Código, Categoria, Nome, Custo Ref., Última Compra, Estoque Atual, Status e Ações.
- **Filtros Rápidos por Categoria:** `[ Todos ]`, `[ 🥣 Ingredientes ]`, `[ 🍰 Bases ]` e `[ ⚠️ Estoque Baixo ]`.
- **Entrada Inteligente de Compras:** Ao cadastrar uma compra, o estoque atual é somado automaticamente.

### 1.7 Precificação & Ficha Técnica Profissional
- **Metodologia Sebrae & Markup Divisor:** Formação de preço profissional dividida em Custos Variáveis (Insumos + Embalagens), Despesas Variáveis (Taxas + Impostos) e Margem de Contribuição unitária com termômetro Sebrae (*Excelente > 50%*, *Saudável 30-50%*, *Alerta < 30%*).
- **Preço Alvo / Fixar Preço:** Campo de formação reversa que permite fixar o preço de venda pretendido (ex.: R$ 22,80) e calcula a margem líquida real automaticamente.
- **Alerta de Insumo com Custo Zero:** Sinalização visual nas linhas de ingredientes e banner de aviso caso algum insumo esteja sem compra cadastrada no Inventário.
- **Ponto de Equilíbrio Operacional:** Metas em unidades (mês/dia) e faturamento mínimo para pagamento dos gastos fixos da confeitaria.
- **Montagem de Receitas:** Associação de insumos e bases com quantidades exatas.
- **Importador Rápido do Excel:** Modal para colar 4 colunas (`Ingrediente`, `Custo Embalagem`, `Gramas Embalagem`, `Gramas Utilizadas`) com reconhecimento inteligente de insumos e **Bases cadastradas (`PBA`)**, cálculo de custo em tempo real e criação facilitada.

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
- **Sacola de Compras Flutuante:** Adição de itens, cálculo de totais e botão de checkout.
- **Área do Cliente:** Login simples via WhatsApp, cartão fidelidade e botão "Repetir Pedido".
- **Fechamento no WhatsApp & Supabase:** Envia o pedido estruturado diretamente para o banco de dados e abre a conversa no WhatsApp formatada com todos os detalhes e adicionais do bolo.