# BRIEFING — Chat de Lançamento (APK / iOS)

## Seu escopo
Empacotar o FitMind Club para Play Store e App Store. Nada mais.

## NÃO É seu escopo
- Qualquer arquivo em `supabase/migrations/` — proibido, sem exceção
- Lógica financeira, carteiras, comissões, distribuição
- Rotas novas, loja pública, checkout

Se o trabalho exigir mexer nisso, PARE e avise o usuário.

## Ambiente (já pronto)
- Repo: `C:\dev\fitmind` — branch `feat/mobile-shell`
- Windows, PowerShell. Node v24.17.0, bun 1.3.14, git 2.45.1
- Acesso via Desktop Commander (arquivos + terminal)
- Cuidado com aspas aninhadas no PowerShell: escreva scripts `.ps1` e execute
  com `-File` em vez de `-Command`

## Já feito
- `appId` alterado de `app.lovable.fitmind` para `br.com.fitmindclub`
- Instalados: `@capacitor/cli` 8.4.2, `@capacitor/android` 8.4.2,
  `@capacitor/ios` 8.4.2, `@capacitor/geolocation` 8.2.0, `@capacitor/motion` 8.0.1,
  `@capacitor/device`, `@capacitor/preferences`,
  `@capacitor-community/background-geolocation` 1.2.26
- Domínio `fitmindclub.com.br` ativo, DNS verificado (A → 185.158.133.1)

## Falta fazer, em ordem
1. `AndroidManifest.xml` está SEM NENHUMA permissão — nem INTERNET.
   Adicionar: INTERNET, ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION,
   ACCESS_BACKGROUND_LOCATION, FOREGROUND_SERVICE,
   FOREGROUND_SERVICE_LOCATION, POST_NOTIFICATIONS, WAKE_LOCK
2. Regenerar plataforma Android com o novo appId. `npx cap add android` /
   `npx cap sync`. A pasta `android/` existente está incompleta (só `app/`)
3. Implementar o rastreamento de corrida. O plugin está instalado mas
   NÃO HÁ UMA LINHA DE CÓDIGO usando ele. Precisa de serviço em primeiro
   plano com notificação persistente (exigência do Android)
4. Gerar APK assinado. Guardar o keystore com muito cuidado —
   perder o keystore = nunca mais atualizar o app na Play
5. iOS: gerar pasta `ios/`, configurar CI na nuvem (Codemagic ou GitHub
   Actions com runner macOS). Windows NÃO compila iOS

## Bloqueios externos (dependem do usuário)
- Conta Google Play NÃO criada. Conta pessoal criada hoje cai na regra de
  12 testadores por 14 dias corridos antes de liberar produção.
  Conta de organização é isenta mas exige D-U-N-S (até 30 dias)
- Conta Apple Developer NÃO criada. US$ 99/ano. Verificação leva dias.
  Sem ela, não há TestFlight, e sem TestFlight não há teste em iPhone
- Localização em segundo plano EXIGE declaração especial na Play:
  formulário + vídeo demonstrando o uso. Some dias à análise

## Contexto do produto
App de gestão de corrida. Geolocalização em segundo plano com a tela
apagada é requisito central, não opcional — ninguém corre olhando a tela.

## Bug conhecido em aberto
PWA mostra barra branca com URL no topo e a navegação mudou. Causa provável:
o app foi instalado quando a origem era `fitmindclub.lovable.app` e agora
responde em `fitmindclub.com.br` — origem diferente tira do modo standalone.
O `manifest.webmanifest` está correto (`display: standalone`, `scope: "/"`).
Solução provável: desinstalar e reinstalar o PWA da origem nova, mais
redirecionamento do `.lovable.app` para o domínio novo. NÃO CONFIRMADO.

## Regras de convivência
- Trabalhe só na branch `feat/mobile-shell`
- Antes de começar, leia `docs/STATUS.md`
- Ao terminar cada bloco, atualize `docs/STATUS.md`
- Não edite na Lovable (ela commita direto na `main` e gera conflito)
