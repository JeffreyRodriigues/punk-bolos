# Punk Bolos — Funcionalidades do Sistema

Sistema web integrado para gestão de pedidos, catálogo de produtos, controle de produção, CRM de clientes, inventário, precificação e cardápio digital da **Punk Bolos**.

> **Stack:** HTML5 + CSS3 + JavaScript (ES6+, módulos) — sem dependências pesadas.
> **Persistência:** LocalStorage (offline) e Supabase (nuvem em tempo real).
> **Autenticação:** Supabase Auth para administradores.
> **Responsividade:** Otimizado para celular, tablet e desktop.

---

## 1. Módulos e Abas do Painel Administrativo

### 1.1 Dashboard
- **Cards de Métricas:** Faturamento total, quantidade de pedidos, ticket médio, lucro bruto e contadores por status.
- **Gráficos e Rankings:** Top 5 sabores mais vendidos, top 3 tipos de produto e faturamento diário.
- **Filtro por Período:** Hoje, 7 dias, Este Mês e Faixa Customizada (De/Até).

### 1.2 Produtos
- **Catálogo Completo:** Cadastro de bolos inteiros, fatias e punkitos.
- **Tamanhos e Detalhes:** Tamanhos exclusivos para bolos inteiros (Mini, PP, P, M, G, GG, Bento Cake, Coração).
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

### 1.7 Precificação & Custos
- **Montagem de Receitas:** Associação de insumos e bases com quantidades exatas.
- **Importador Rápido do Excel:** Modal para colar 4 colunas (`Ingrediente`, `Custo Embalagem`, `Gramas Embalagem`, `Gramas Utilizadas`) com reconhecimento inteligente e criação de insumos.
- **Fatores de Custo:**
  - Margem para custos incalculáveis (gás, energia).
  - Multiplicador de lucro e mão de obra.
  - Rendimento e custo de embalagem por unidade.
- **Grid Padronizado:** Layout com alinhamento pixel-perfect para pesagem em gramas, ml ou unidades.

---

## 2. Cardápio Digital Público (`cardapio.html`)

Interface pública voltada para os clientes finais:
- **Catálogo Visual:** Exibição de fotos, sabores e preços dos produtos.
- **Pronta Entrega vs. Encomenda:**
  - *Fatias e Punkitos:* trava automática de quantidade baseada no estoque disponível.
  - *Bolos Inteiros:* sob encomenda com escolha de data e horário de entrega.
- **Sacola de Compras Flutuante:** Adição de itens, cálculo de totais e botão de checkout.
- **Área do Cliente:** Login simples via WhatsApp, cartão fidelidade e botão "Repetir Pedido".
- **Fechamento no WhatsApp & Supabase:** Envia o pedido estruturado diretamente para o banco de dados e abre a conversa no WhatsApp formatada.