# Sincronizar novos cadastros com a catraca e permitir foto pelo painel

## Resultado esperado

Depois de cadastrar uma pessoa nova e lançar a mensalidade:

- o identificador criado passa automaticamente para a sincronização da catraca, mesmo sem conta FitMind;
- a recepção pode localizar esse identificador no equipamento e cadastrar o rosto presencialmente;
- a tela também oferece **“Cadastrar rosto agora”**, usando a câmera do celular/computador e a fila facial já existente;
- continua disponível a opção de seguir sem foto e cadastrá-la depois na catraca.

## Implementação

1. **Corrigir a sincronização de acessos locais**
   - Ajustar `academia_agente_retrato` para relacionar mensalidade diretamente por `credencial_id` quando a pessoa não possui `student_id`.
   - Preservar o caminho atual por `student_id` para alunos FitMind.
   - Evitar duplicidade quando uma pessoa possuir mais de uma credencial e continuar enviando somente identificador e validade necessários ao agente.

2. **Enfileirar a facial do cadastro local**
   - Criar uma RPC autenticada específica para enfileirar foto usando `credencial_id`.
   - Reutilizar exatamente o identificador já criado no cadastro, em vez de gerar outro.
   - Validar que a credencial pertence à academia, está ativa e que o operador tem acesso.
   - Manter a regra de privacidade atual: a foto é apagada do banco após o agente confirmar o envio ao equipamento.

3. **Oferecer as duas opções na tela**
   - Após o cadastro, antes ou depois do lançamento da mensalidade, exibir ações claras para **cadastrar rosto agora** ou **fazer depois na catraca**.
   - Reutilizar o componente de câmera existente e mostrar confirmação de que a foto entrou na fila.
   - Não bloquear a renovação/pagamento caso a recepção escolha cadastrar a face presencialmente.

4. **Validar o fluxo completo**
   - Confirmar no banco que o cadastro local com mensalidade ativa aparece no retrato baixado pelo agente.
   - Confirmar que a foto pelo painel entra na fila com o mesmo identificador e pode ser consumida pelo sincronizador.
   - Testar cadastro novo, mensalidade, escolha sem foto e escolha com foto.

## Detalhes técnicos

- Uma migration versionada atualizará a RPC de retrato e criará a RPC de envio facial por credencial, com `SECURITY DEFINER`, `search_path = public`, permissões mínimas e sem abrir acesso anônimo ao cadastro.
- O fluxo existente para alunos FitMind e as credenciais já importadas será mantido.
- A correção principal cobre a falha confirmada: o retrato atual liga mensalidade e credencial apenas por `student_id`; cadastros locais têm `student_id = null`, embora a mensalidade já guarde seu `credencial_id`.
