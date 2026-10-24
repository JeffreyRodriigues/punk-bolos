/* ============================================================
   RECEIPTPARSER.JS — Extração Inteligente de Notas Fiscais e Cupons
   ------------------------------------------------------------
   Responsável por:
   - Parsear notas fiscais eletrônicas em XML (NF-e / NFC-e)
   - Chamar a Gemini Vision API (Google AI Studio) para ler fotos de cupons
   - Fazer casamento inteligente (fuzzy matching) entre as descrições
     do cupom e os insumos cadastrados no Inventário
   - Normalizar datas, fornecedores, pagamentos e valores
   ============================================================ */

/**
 * Remove acentos, pontuações e converte para minúsculas.
 * @param {string} str
 * @returns {string}
 */
export function normalizeText(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tabela de sinônimos e abreviações comuns de supermercados e atacadistas.
 */
const ABBREVIATIONS_MAP = {
  ac: 'acucar',
  acuc: 'acucar',
  ref: 'refinado',
  mant: 'manteiga',
  ferm: 'fermento',
  cr: 'creme',
  choc: 'chocolate',
  far: 'farinha',
  trig: 'trigo',
  leite: 'leite',
  cond: 'condensado',
  crem: 'creme',
  ov: 'ovo',
  ovos: 'ovos',
  maca: 'maca',
  limao: 'limao',
  doc: 'doce',
  morg: 'morango',
  emb: 'embalagem',
  sac: 'saco',
  cx: 'caixa',
  pt: 'pote',
  pct: 'pacote',
  un: 'unidade',
  und: 'unidade',
  kg: 'quilo',
  gr: 'gramas',
  g: 'gramas',
  lt: 'litro',
  ml: 'mililitro',
};

/**
 * Expande abreviações em uma string de descrição de cupom.
 * @param {string} text
 * @returns {string}
 */
export function expandAbbreviations(text) {
  const norm = normalizeText(text);
  const words = norm.split(' ');
  const expanded = words.map((w) => ABBREVIATIONS_MAP[w] || w);
  return expanded.join(' ');
}

/**
 * Cruza a descrição de um item da nota fiscal com a lista de insumos existentes.
 * Retorna o insumo com melhor pontuação de similaridade, ou null se não houver boa correspondência.
 * 
 * @param {string} itemDescricao - Descrição do produto na nota (ex: "AC REF UNIAO 1KG")
 * @param {Array<Object>} insumos - Lista de insumos do inventário
 * @returns {Object|null} Insumo correspondente ou null
 */
export function matchInsumo(itemDescricao, insumos) {
  if (!itemDescricao || !Array.isArray(insumos) || insumos.length === 0) {
    return null;
  }

  const descNorm = normalizeText(itemDescricao);
  const descExpanded = expandAbbreviations(itemDescricao);
  const descWords = descExpanded.split(' ').filter((w) => w.length > 1);

  let bestMatch = null;
  let highestScore = 0;

  for (const insumo of insumos) {
    if (!insumo || !insumo.nome) continue;

    const nomeNorm = normalizeText(insumo.nome);
    const nomeWords = nomeNorm.split(' ').filter((w) => w.length > 1);

    // 1. Casamento exato
    if (descNorm === nomeNorm) {
      return insumo;
    }

    // 2. Se o nome do insumo estiver completamente contido na descrição
    if (descExpanded.includes(nomeNorm) || descNorm.includes(nomeNorm)) {
      const score = 100 + (nomeNorm.length / (descNorm.length || 1)) * 50;
      if (score > highestScore) {
        highestScore = score;
        bestMatch = insumo;
      }
      continue;
    }

    // 3. Casamento por sobreposição de palavras-chave
    let matchedWordsCount = 0;
    for (const w of nomeWords) {
      if (descWords.includes(w) || descNorm.includes(w)) {
        matchedWordsCount++;
      }
    }

    if (matchedWordsCount > 0) {
      // Score proporcional à cobertura do nome do insumo
      const coverage = matchedWordsCount / nomeWords.length;
      const score = coverage * 80;

      if (coverage >= 0.5 && score > highestScore) {
        highestScore = score;
        bestMatch = insumo;
      }
    }
  }

  // Só aceita se a pontuação for confiável
  return highestScore >= 35 ? bestMatch : null;
}

/**
 * Converte códigos de pagamento comuns da SEFAZ para as opções do Punk Bolos.
 * @param {string} tPag
 * @returns {string}
 */
export function mapPaymentMethod(tPag) {
  const code = String(tPag || '').trim();
  switch (code) {
    case '01':
      return 'Dinheiro';
    case '02':
    case '03':
      return 'Cartão de Crédito';
    case '04':
      return 'Cartão de Débito';
    case '15':
      return 'Boleto';
    case '17':
    case '19':
    case 'PIX':
      return 'PIX';
    default:
      if (/pix/i.test(code)) return 'PIX';
      if (/cr[eé]dito/i.test(code)) return 'Cartão de Crédito';
      if (/d[eé]bito/i.test(code)) return 'Cartão de Débito';
      if (/dinheiro/i.test(code)) return 'Dinheiro';
      if (/boleto/i.test(code)) return 'Boleto';
      return 'Outro';
  }
}

/**
 * Normaliza a unidade de medida para o padrão do Punk Bolos ('unidade', 'kg', 'g', 'l', 'ml').
 * @param {string} uCom
 * @returns {string}
 */
export function normalizeUnit(uCom) {
  const u = normalizeText(uCom);
  if (['kg', 'kilo', 'quilo'].includes(u)) return 'kg';
  if (['g', 'gr', 'grama', 'gramas'].includes(u)) return 'g';
  if (['l', 'lt', 'litro', 'litros'].includes(u)) return 'l';
  if (['ml', 'mililitro', 'mililitros'].includes(u)) return 'ml';
  return 'unidade';
}

/**
 * Parseia o conteúdo de um arquivo XML de NF-e ou NFC-e brasileira.
 * Funciona tanto no navegador (DOMParser) quanto em Node.js (Regex fallback para testes).
 * 
 * @param {string} xmlString
 * @returns {Object} Dados extraídos da nota fiscal
 */
export function parseReceiptXml(xmlString) {
  if (!xmlString || typeof xmlString !== 'string') {
    throw new Error('Conteúdo XML inválido ou vazio.');
  }

  // Função auxiliar para extrair tags via Regex (compatível universalmente)
  const extractTag = (xml, tag) => {
    const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return m ? m[1].trim() : '';
  };

  const extractAllTags = (xml, tag) => {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
    const matches = [];
    let m;
    while ((m = regex.exec(xml)) !== null) {
      matches.push(m[1]);
    }
    return matches;
  };

  // 1. Fornecedor (emitente)
  const emitBlock = extractTag(xmlString, 'emit');
  const xFant = extractTag(emitBlock, 'xFant');
  const xNome = extractTag(emitBlock, 'xNome');
  const fornecedor = xFant || xNome || 'Fornecedor Desconhecido';

  // 2. Data de emissão (dhEmi ou dEmi)
  const ideBlock = extractTag(xmlString, 'ide');
  const dhEmi = extractTag(ideBlock, 'dhEmi') || extractTag(ideBlock, 'dEmi');
  let dataFormatada = new Date().toISOString().slice(0, 10);
  if (dhEmi && dhEmi.length >= 10) {
    dataFormatada = dhEmi.slice(0, 10);
  }

  // 3. Forma de pagamento
  const pagBlock = extractTag(xmlString, 'pag');
  const tPag = extractTag(pagBlock, 'tPag');
  const formaPagamento = mapPaymentMethod(tPag);

  // 4. Valor total da nota
  const totalBlock = extractTag(xmlString, 'total');
  const icmsTot = extractTag(totalBlock, 'ICMSTot');
  const vNF = extractTag(icmsTot, 'vNF') || extractTag(totalBlock, 'vNF');
  const valorTotal = Number(vNF) || 0;

  // 5. Itens da nota
  const detBlocks = extractAllTags(xmlString, 'det');
  const itens = [];

  detBlocks.forEach((det) => {
    const prodBlock = extractTag(det, 'prod');
    if (!prodBlock) return;

    const xProd = extractTag(prodBlock, 'xProd');
    const qCom = Number(extractTag(prodBlock, 'qCom')) || 1;
    const uCom = extractTag(prodBlock, 'uCom') || 'UN';
    const vProd = Number(extractTag(prodBlock, 'vProd')) || 0;
    const cProd = extractTag(prodBlock, 'cProd') || '';
    const cEAN = extractTag(prodBlock, 'cEAN') || '';

    if (xProd && vProd > 0) {
      itens.push({
        descricao: xProd,
        quantidade: qCom,
        unidade: normalizeUnit(uCom),
        custoTotal: Math.round(vProd * 100) / 100,
        codigoBarras: cEAN && cEAN !== 'SEM GTIN' ? cEAN : cProd,
      });
    }
  });

  return {
    fornecedor,
    data: dataFormatada,
    formaPagamento,
    valorTotal,
    itens,
  };
}

/**
 * Monta o prompt otimizado para o Gemini Vision extrair dados do cupom/nota fiscal.
 */
export function getGeminiVisionPrompt() {
  return `Você é um assistente especialista em leitura de notas fiscais e cupons de compras (NFC-e / NF-e / cupom fiscal) de confeitarias e padarias no Brasil.
Analise a imagem da nota fiscal/cupom fiscal fornecida com extrema precisão e extraia os dados estruturados no formato JSON estrito.

Regras de Extração:
1. "fornecedor": Razão social ou nome fantasia do estabelecimento emitente (ex.: "Assaí Atacadista", "Atacadão", "Sam's Club"). Se não encontrar, use "Mercado / Atacadista".
2. "data": Data da compra no formato AAAA-MM-DD (ISO). Se não encontrar, use a data atual.
3. "formaPagamento": Identifique a forma de pagamento principal utilizada: "PIX", "Cartão de Crédito", "Cartão de Débito", "Dinheiro" ou "Boleto".
4. "valorTotal": Valor total final líquido pago na compra como número float (ex: 117.85).
5. "itens": Lista de todos os produtos comprados identificados na nota. Para cada item:
   - "descricao": Nome/descrição legível do produto como consta no cupom (ex: "MANTEIGA PAULISTA 500G", "ACUCAR REFINADO UNIAO 1KG", "LIMAO THAITI").
   - "quantidade": Quantidade numérica comprada (ex: 3 ou 0.326).
   - "unidade": Unidade de medida ("unidade", "kg", "g", "l", "ml"). Se for quilo ou peso a granel, use "kg". Se for pacote, pote, caixa, use "unidade".
   - "custoTotal": Valor total pago neste item já com eventuais descontos do item aplicados, como número float (ex: 65.70 ou 3.87).
   - "codigoBarras": Código numérico ou EAN se estiver visível no cupom, ou string vazia se não houver.

IMPORTANTE: Responda APENAS com o objeto JSON válido, sem texto explicativo, sem blocos de código com formatação extra além do JSON.
Exemplo de formato esperado:
{
  "fornecedor": "Sendas Distribuidora S/A",
  "data": "2026-09-04",
  "formaPagamento": "PIX",
  "valorTotal": 117.85,
  "itens": [
    {
      "descricao": "MANTEIGA PAULISTA C/S 500G",
      "quantidade": 3,
      "unidade": "unidade",
      "custoTotal": 65.70,
      "codigoBarras": "7896294901948"
    }
  ]
}`;
}

/**
 * Envia uma imagem codificada em base64 para a Gemini Vision API (Google AI Studio)
 * e retorna os dados estruturados da nota fiscal.
 * 
 * @param {string} imageBase64 - Imagem em base64 (com ou sem data:image/... prefixo)
 * @param {string} apiKey - Chave da API do Gemini (Google AI Studio)
 * @returns {Promise<Object>} Dados extraídos da nota
 */
export const CANDIDATE_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash',
];

/**
 * Consulta a API do Google para listar modelos ativos que suportam generateContent com imagem.
 * @param {string} apiKey
 * @returns {Promise<Array<string>>}
 */
export async function listAvailableGeminiModels(apiKey) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data.models)) return [];
    const supported = data.models
      .filter((m) => {
        if (!Array.isArray(m.supportedGenerationMethods) || !m.supportedGenerationMethods.includes('generateContent')) {
          return false;
        }
        const name = (m.name || '').toLowerCase();
        // Exclui modelos estritamente voltados a áudio/voz ou vetores
        if (name.includes('tts') || name.includes('audio') || name.includes('embed')) {
          return false;
        }
        return true;
      })
      .map((m) => m.name.replace(/^models\//, ''));

    // Prioriza modelos 'flash'
    const flashModels = supported.filter((m) => m.includes('flash'));
    const otherModels = supported.filter((m) => !m.includes('flash'));
    return [...flashModels, ...otherModels];
  } catch {
    return [];
  }
}

/**
 * Envia uma imagem codificada em base64 para a Gemini Vision API (Google AI Studio)
 * e retorna os dados estruturados da nota fiscal com fallback automático entre modelos.
 * 
 * @param {string} imageBase64 - Imagem em base64 (com ou sem data:image/... prefixo)
 * @param {string} apiKey - Chave da API do Gemini (Google AI Studio)
 * @returns {Promise<Object>} Dados extraídos da nota
 */
/**
 * Redimensiona e comprime uma imagem em base64 no navegador via Canvas.
 * Reduz fotos pesadas de celulares (10-20MB) para ~300KB mantendo texto nítido para OCR.
 * 
 * @param {string} dataUrl - Imagem em base64
 * @param {number} maxDimension - Largura ou altura máxima (default: 1600px)
 * @param {number} quality - Qualidade JPEG entre 0.1 e 1.0 (default: 0.82)
 * @returns {Promise<{ base64: string, originalSizeKb: number, compressedSizeKb: number }>}
 */
export function compressImageBase64(dataUrl, maxDimension = 1600, quality = 0.82) {
  return new Promise((resolve) => {
    // Se não estiver no ambiente de navegador (ex: Node unit tests), retorna a imagem como está
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      resolve({ base64: dataUrl, originalSizeKb: 0, compressedSizeKb: 0 });
      return;
    }

    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const originalSizeKb = Math.round((dataUrl.length * 3) / 4 / 1024);

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      const compressedSizeKb = Math.round((compressedDataUrl.length * 3) / 4 / 1024);

      console.log(`[Gemini Vision] Imagem otimizada: ${originalSizeKb} KB ➔ ${compressedSizeKb} KB (${width}x${height}px)`);
      resolve({ base64: compressedDataUrl, originalSizeKb, compressedSizeKb });
    };

    img.onerror = () => {
      resolve({ base64: dataUrl, originalSizeKb: 0, compressedSizeKb: 0 });
    };

    img.src = dataUrl;
  });
}

/**
 * Envia uma imagem codificada em base64 para a Gemini Vision API (Google AI Studio)
 * e retorna os dados estruturados da nota fiscal com fallback automático entre modelos.
 * 
 * @param {string} imageBase64 - Imagem em base64 (com ou sem data:image/... prefixo)
 * @param {string} apiKey - Chave da API do Gemini (Google AI Studio)
 * @param {Function} [onStatus] - Callback opcional para relatar modelo em execução
 * @returns {Promise<Object>} Dados extraídos da nota
 */
export async function parseReceiptImageWithGemini(imageBase64, apiKey, onStatus = null) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('Chave de API do Gemini não configurada. Por favor, informe sua chave gratuita do Google AI Studio.');
  }

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    throw new Error('Nenhuma imagem fornecida para leitura.');
  }

  // Remove o prefixo data:image/...;base64, se houver
  let cleanBase64 = imageBase64;
  let mimeType = 'image/jpeg';
  if (imageBase64.includes(';base64,')) {
    const parts = imageBase64.split(';base64,');
    cleanBase64 = parts[1];
    const mimeMatch = parts[0].match(/data:(.*?)$/);
    if (mimeMatch) mimeType = mimeMatch[1];
  }

  const payload = {
    contents: [
      {
        parts: [
          {
            text: getGeminiVisionPrompt(),
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: cleanBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      response_mime_type: 'application/json',
    },
  };

  const modelsToTry = [...CANDIDATE_MODELS];
  let lastError = null;
  let successData = null;

  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

    if (typeof onStatus === 'function') {
      onStatus(`Consultando IA (${model})...`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        let errDetail = '';
        try {
          const errJson = await response.json();
          errDetail = errJson.error ? errJson.error.message : JSON.stringify(errJson);
        } catch {
          errDetail = `HTTP ${response.status} ${response.statusText}`;
        }

        // Se for erro de modelo não encontrado (404), não suportado ou modalidade de imagem desabilitada, tenta o próximo modelo
        const isModelMismatch =
          response.status === 404 ||
          errDetail.toLowerCase().includes('not found') ||
          errDetail.toLowerCase().includes('not supported') ||
          errDetail.toLowerCase().includes('modality is not enabled') ||
          errDetail.toLowerCase().includes('modality');

        if (isModelMismatch) {
          lastError = new Error(`Modelo ${model} não suporta imagem ou não está disponível: ${errDetail}`);
          // Se for o último modelo da lista inicial e ainda não buscou dinamicamente, busca dinamicamente
          if (i === modelsToTry.length - 1) {
            const discovered = await listAvailableGeminiModels(apiKey);
            const newModels = discovered.filter((m) => !modelsToTry.includes(m));
            if (newModels.length > 0) {
              modelsToTry.push(...newModels);
            }
          }
          continue;
        }

        if (response.status === 400 && errDetail.toLowerCase().includes('api_key')) {
          throw new Error('Chave de API do Gemini inválida. Verifique a chave inserida.');
        }
        if (response.status === 429) {
          throw new Error('Limite de requisições por minuto atingido no Gemini. Aguarde alguns instantes e tente novamente.');
        }

        throw new Error(`Falha na API do Gemini (${model}): ${errDetail}`);
      }

      const result = await response.json();
      const candidate = result.candidates && result.candidates[0];
      if (!candidate || !candidate.content || !candidate.content.parts || !candidate.content.parts[0]) {
        throw new Error('O Gemini não retornou resposta para a imagem enviada.');
      }

      let text = candidate.content.parts[0].text || '';
      text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

      try {
        successData = JSON.parse(text);
        break; // Sucesso! Sai do loop de modelos
      } catch (err) {
        throw new Error(`Não foi possível interpretar a resposta da IA como JSON: ${err.message}`);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        lastError = new Error(`Tempo limite de 35s esgotado ao aguardar resposta do modelo ${model}.`);
        continue;
      }
      if (err.message && err.message.includes('não disponível')) {
        continue;
      }
      throw err;
    }
  }

  if (!successData) {
    throw lastError || new Error('Nenhum modelo compatível do Gemini pôde processar a imagem.');
  }

  return normalizeParsedReceipt(successData);
}

/**
 * Normaliza os dados parseados (seja por XML ou IA) garantindo tipos e defaults consistentes.
 * 
 * @param {Object} raw
 * @returns {Object}
 */
export function normalizeParsedReceipt(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Dados de nota fiscal inválidos.');
  }

  const fornecedor = String(raw.fornecedor || 'Mercado / Fornecedor').trim();
  const data = raw.data && /^\d{4}-\d{2}-\d{2}$/.test(raw.data)
    ? raw.data
    : new Date().toISOString().slice(0, 10);
  const formaPagamento = mapPaymentMethod(raw.formaPagamento);
  const valorTotal = Number(raw.valorTotal) || 0;

  const rawItens = Array.isArray(raw.itens) ? raw.itens : [];
  const itens = rawItens
    .map((it) => {
      const desc = String(it.descricao || it.nome || '').trim();
      const qtd = Number(it.quantidade) || 1;
      const custo = Number(it.custoTotal || it.valorTotal) || 0;
      const un = normalizeUnit(it.unidade);
      const cod = String(it.codigoBarras || it.codigo || '').trim();

      return {
        descricao: desc,
        quantidade: qtd > 0 ? qtd : 1,
        unidade: un,
        custoTotal: Math.round(custo * 100) / 100,
        codigoBarras: cod,
      };
    })
    .filter((it) => it.descricao.length > 0 && it.custoTotal > 0);

  return {
    fornecedor,
    data,
    formaPagamento,
    valorTotal: valorTotal > 0 ? valorTotal : itens.reduce((s, i) => s + i.custoTotal, 0),
    itens,
  };
}
