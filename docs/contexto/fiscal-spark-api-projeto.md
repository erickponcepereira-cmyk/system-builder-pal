---
name: fiscal-spark-api-projeto
description: "A vertical fiscal (NFS-e Padrão Nacional) — onde o código vive hoje, e as decisões que não se descobrem lendo o repo"
metadata: 
  node_type: memory
  type: project
  originSessionId: 21a650c2-55e2-4a47-bb11-17816f552d2c
  modified: 2026-08-17T20:30:14.828Z
---

Vertical fiscal do ecossistema FitMind: emissão de NFS-e no Padrão Nacional, por venda via API ou manual. Emissor: FITMIND SECRETS, CNPJ 64568656000198.

**Em 17/08/2026 o projeto foi reiniciado.** O antigo (`fiscal-spark-api`, Lovable + TanStack Start em Cloudflare workerd) foi arquivado; o novo é `C:\projetos\fiscal-engine` — Node + Fastify + Supabase, git local, ainda sem remote.

Fatos que não se descobrem lendo o código:

- **O runtime mudou por causa de mTLS.** A API Sefin exige certificado cliente ICP-Brasil, e `workerd` não faz handshake mTLS. Era isso que obrigava o projeto antigo a delegar transmissão a um proxy Node no Railway, com o PFX e a senha viajando pela rede a cada emissão. Em Node o proxy deixou de existir. Não reintroduza runtime de borda nesse caminho.
- **Existem duas faixas de município, e o eixo de abstração é o transporte, não o município.** Faixa A (~2.517) usa o Emissor Nacional via REST; Faixa B (~3.004) mantém emissor próprio com SOAP. A DPS é a mesma nos dois. Modelar "provider por município" foi o erro do projeto antigo.
- **Cuiabá ADIOU a migração de 01/09 para 01/11/2026** (confirmado em 02/09: o ADN ainda devolve `aderenteEmissorNacional: 0`, e o webservice municipal fica ativo até 31/10). Até lá o CNPJ da FitMind não emite pela Sefin — `E0084`, sem estabelecimento em município Faixa A. Várzea Grande já é Faixa A, mas **não existe em produção restrita**: não há sandbox para VG.
- **Produção de Cuiabá liberada em 02/09/2026**: `https://wscuiaba.issnetonline.com.br/wsnfsenacional/nfse.asmx`, série **14** (homologação segue em 8). O padrão é subdomínio por município, igual ao `nfse.fazenda.df.gov.br` do DF. Emitir ainda exige **liberação de numeração pela prefeitura** no ISS.Net Online — `npm run consultar:numeracao` responde se saiu (`E319` = ainda não).
- **Primeira NFS-e de produção: 12/09/2026**, série 14 nº 3, chave `51034031264568656000198000000000000326091789237571`. Três transmissões: `E0712`+`EM061`, depois `E0166`+`E0322`+`EM062`, depois autorizada. Cancelada pelo portal. A lição das duas rodadas: **`minOccurs="0"` no XSD não é permissão** — `cNBS` e `regApTribSN` são 0-1 na estrutura e obrigatórios na regra de negócio. As tabelas de leiaute B-94/B-193 do manual diziam 1-1 e estavam certas.
- **O `pTotTribSN` saiu 2,01 e provavelmente está errado.** 2,01% é exatamente a fatia do ISS na 1ª faixa do Anexo III (6% × 33,5%); o campo pede o TOTAL da composição do Simples (a Nota Control confirmou). Confirmar com a Eva antes da próxima nota real — ele sai impresso no rodapé do DANFSe.
- **Cancelar em Cuiabá pelo webservice devolve `E999`, "serviço em construção".** O portal cancela normalmente porque assina no navegador com o Web PKI — é outra porta. Por isso existe a conferência periódica (`npm run start:conferencia`), e ela lê cancelamento em `<ListaEvento>`, **nunca no `cStat`**: nota cancelada continua `cStat 100`. E `e101103` é só PEDIDO de cancelamento, não cancelamento.
- **O manual do ISSNet erra nomes de operação** — diz `ConsultarNfsePorDps`, o WSDL declara `ConsultarNfseDps`. Para nome de operação e SOAPAction vale o WSDL (que exige o certificado para baixar; sem ele, 403).
- **O Supabase do plano gratuito pausa depois de ~10 dias parado** (aconteceu em agosto e em 22/09). Sinal: o host deixa de resolver no DNS. Em 22/09 o `SUPABASE_ACCESS_TOKEN` também expirou (401), então a restauração pela Management API parou de funcionar — precisa despausar no painel e gerar token novo.
- **NF-e de produto (modelo 55) ganhou a fundação em 22/09**: catálogo com NCM e CEST validados contra as tabelas oficiais, e `POST /v1/nfe/validar`. **Não transmite.** Vender mercadoria com ICMS exige Inscrição Estadual e credenciamento na SEFAZ; mas **"sem IE não existe NF-e" é falso** a partir de 03/11/2026 — a NT 2026.007 cria o contribuinte exclusivo do IBS/CBS, que emite NF-e sem IE e sem ICMS, e é o caso do prestador de serviço. Esse perfil não está implementado. Três fatos que mudaram o desenho: Lucro Presumido e Lucro Real são o **mesmo CRT (3)**, o leiaute não distingue; a **SEFAZ não confere o CEST** (só a 806, ausência em ST), então a gente confere; e **a partir de 03/11/2026 o CRT é conferido contra a Receita** (rejeição 180). Fontes e armadilhas em `fiscal-engine/docs/oficial/nfe/LEIAME.md`. **A página do CONFAZ com a tabela CEST tem camadas históricas** (parágrafos de classe `verde`) indistinguíveis no texto — a primeira versão do gerador aceitava CEST revogado. E a CNPJ alfanumérico (NT 2026.004, produção desde 01/07/2026) muda a chave de acesso: ler antes de escrever o transporte.

O diagnóstico que motivou o reinício está em https://claude.ai/code/artifact/08ba45d5-8d70-4a12-81a0-105def081e19

Relacionado: [[fitmind-arquitetura-ecossistema]], [[fitmind-loja-unificada]]
