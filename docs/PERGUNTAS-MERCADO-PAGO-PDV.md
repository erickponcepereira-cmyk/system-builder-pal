# Perguntas ao comercial do Mercado Pago — SmartApp / PDV

Escrito em 09/09/2026. Mensagem pronta para enviar ao contato comercial, na
abertura do processo de SmartApp. Contexto e consequências de cada resposta em
[`PDV-ESTACIONAMENTO.md`](PDV-ESTACIONAMENTO.md).

As três que decidem arquitetura são a **1**, a **6** e a **9** — sem elas não se
escreve SQL de carteira. Peça resposta por escrito nessas.

---

**Assunto: Integração SmartApp na Point Smart — modelo de conta e exigência de OAuth**

Somos a FitMind, plataforma de clube de benefícios e marketplace. Queremos
desenvolver um SmartApp próprio (Android nativo) para rodar nas Point Smart,
com PDV para estacionamento e lava-jato, e distribuir maquininhas para
estabelecimentos parceiros — estacionamentos, lava-jatos, clínicas e academias.

O modelo que pretendemos adotar é este:

- todas as maquininhas vinculadas à **conta Mercado Pago da FitMind**;
- o recebimento das vendas cai na conta da FitMind;
- o repasse ao estabelecimento parceiro é feito **internamente pelo nosso
  sistema**, por controle próprio de saldo, fora do Mercado Pago;
- o estabelecimento parceiro não participa como titular de conta na operação —
  ele é usuário do nosso software.

Na documentação de restrições de SmartApps consta que o uso de OAuth deve ser
implementado para obter informações de pagamento, acessar dados do usuário ou
executar operações na conta do vendedor, como cobranças ou estornos. É sobre
isso que precisamos de orientação.

**Sobre OAuth e modelo de conta**

1. No modelo acima, em que todas as Points pertencem à conta da FitMind, quem é
   considerado "o vendedor" para efeito dessa exigência de OAuth? A própria
   FitMind?
2. Sendo a FitMind titular da conta e da aplicação, o fluxo de OAuth continua
   obrigatório — a conta autorizando a própria aplicação — ou a aplicação pode
   operar com as credenciais da própria conta? Se for obrigatório, qual fluxo
   devemos usar?
3. A exigência de OAuth vale também para o pagamento feito **localmente pelo SDK
   no terminal**, ou se aplica apenas às chamadas de API fora do dispositivo
   (consulta de pagamento, estorno, relatórios)?
4. Podemos concentrar as chamadas de API no **nosso backend** — o SmartApp fala
   apenas com o nosso servidor, e o servidor fala com o Mercado Pago, guardando o
   token OAuth — ou a homologação exige que o token viva no terminal? Se viver no
   terminal, como deve ser feita a renovação?
5. Estorno e cancelamento podem ser executados pelo nosso backend, ou precisam
   partir do terminal?

**Sobre distribuição e escala**

6. A aplicação é privada e de distribuição fechada. Podemos distribuí-la para
   terminais que pertençam a **outras contas** Mercado Pago — as dos
   estabelecimentos parceiros —, ou a distribuição fechada limita a instalação
   aos terminais da própria conta FitMind?
7. Caso a orientação seja o modelo em que cada parceiro tem a própria conta e
   autoriza a FitMind por OAuth: a homologação do SmartApp é **por aplicação ou
   por conta**? Homologaríamos uma vez, ou uma vez por parceiro?
8. Há limite de terminais vinculados a uma mesma conta? E alguma restrição
   quanto a esses terminais operarem em **endereços de terceiros**, nos
   estabelecimentos parceiros?
9. Do ponto de vista comercial e de compliance, o modelo de a FitMind receber as
   vendas realizadas nos estabelecimentos parceiros e repassar internamente é
   aceito, ou vocês orientam split/marketplace? Se for split, ele está disponível
   para pagamentos presenciais na Point?

**Itens práticos para a mesma conversa**

10. Como solicitamos o **terminal Point Smart de desenvolvimento**, com porta USB
    liberada e depuração ativa?
11. Pretendemos publicar **duas variantes** do aplicativo: `minSdk 23` para a
    Point Smart A910 (Android 6) e `minSdk 31` para a Point Smart 2 N950
    (Android 12). Na homologação isso é tratado como duas aplicações, ou como uma
    aplicação com dois APKs?

Se possível, pedimos a resposta por escrito dos itens 1, 6 e 9 — eles definem a
arquitetura financeira do produto e preferimos não avançar no desenvolvimento
antes de tê-los confirmados.
