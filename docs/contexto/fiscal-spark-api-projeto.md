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
- **O endpoint de PRODUÇÃO do ISSNet para Cuiabá não é público.** O projeto antigo nunca o recebeu e sondagem não acha; produção em Cuiabá segue em ABRASF 2.04. Só a homologação (`nfse.issnetonline.com.br/wsnfsenacional/homologacao/nfse.asmx`) responde. Pedir à Nota Control.

O diagnóstico que motivou o reinício está em https://claude.ai/code/artifact/08ba45d5-8d70-4a12-81a0-105def081e19

Relacionado: [[fitmind-arquitetura-ecossistema]], [[fitmind-loja-unificada]]
