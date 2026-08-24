revoke execute on function public.criar_curso(text, text, numeric, text) from public;
revoke execute on function public.atualizar_curso(uuid, text, text, numeric, text) from public;
revoke execute on function public.enviar_curso_para_aprovacao(uuid) from public;
revoke execute on function public.voltar_curso_para_rascunho(uuid) from public;

grant execute on function public.criar_curso(text, text, numeric, text) to authenticated;
grant execute on function public.atualizar_curso(uuid, text, text, numeric, text) to authenticated;
grant execute on function public.enviar_curso_para_aprovacao(uuid) to authenticated;
grant execute on function public.voltar_curso_para_rascunho(uuid) to authenticated;