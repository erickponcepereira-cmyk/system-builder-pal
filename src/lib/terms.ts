// Constantes centrais de versionamento dos termos de adesão FitMind.
// Ao alterar o texto de qualquer termo, incremente a versão correspondente aqui.
// Usuários que já aceitaram versão anterior podem ser notificados para re-aceite.

import termoAlunoAsset from "@/assets/legal/termo-aluno.pdf.asset.json";
import termoCoachAsset from "@/assets/legal/termo-coach.pdf.asset.json";
import termoParceiroAsset from "@/assets/legal/termo-parceiro.pdf.asset.json";
import termoProfissionalAsset from "@/assets/legal/termo-profissional.pdf.asset.json";

export type TermType = "aluno" | "coach" | "parceiro" | "profissional" | "desafio";

export const TERMS_VERSION: Record<TermType, string> = {
  aluno: "1.0.0",
  coach: "1.0.0",
  parceiro: "1.0.0",
  profissional: "1.0.0",
  desafio: "1.0.0",
};

export const TERMS_ROUTES: Record<Exclude<TermType, "desafio">, string> = {
  aluno: "/termos-aluno",
  coach: "/termos-coach",
  parceiro: "/termos-parceiro",
  profissional: "/termos-profissional",
};

export const TERMS_PDF_URL: Record<Exclude<TermType, "desafio">, string> = {
  aluno: termoAlunoAsset.url,
  coach: termoCoachAsset.url,
  parceiro: termoParceiroAsset.url,
  profissional: termoProfissionalAsset.url,
};

export const TERMS_TITLE: Record<TermType, string> = {
  aluno: "Termo de Adesão FitMind — Aluno / Cliente",
  coach: "Termo de Adesão FitMind — Coach",
  parceiro: "Termo de Adesão FitMind — Empresa Parceira",
  profissional: "Termo de Adesão FitMind — Profissional",
  desafio: "Termo de Participação — Desafio FitMind",
};

// 14 declarações obrigatórias para entrada em um desafio (ticket).
export const CHALLENGE_ACCEPTANCE_DECLARATIONS: string[] = [
  "Declaro ciência de que minha participação no Desafio FitMind poderá iniciar automaticamente conforme minha entrada, plano, campanha, avaliação inicial ou ativação dentro da plataforma.",
  "Declaro ciência de que meu desafio poderá ter ciclo individual, com data própria de início, encerramento, avaliação inicial e avaliação final.",
  "Declaro ciência de que devo acompanhar minhas datas, alertas, prazos e janelas do desafio dentro do aplicativo FitMind.",
  "Declaro ciência de que o não recebimento de lembrete, push, WhatsApp, e-mail ou aviso automático não me isenta de cumprir os prazos exibidos no aplicativo.",
  "Declaro ciência de que, caso eu perca a data, prazo ou janela oficial de avaliação inicial ou final, poderei ser desclassificado do desafio, perder o ranking e perder a elegibilidade à premiação.",
  "Declaro ciência de que somente avaliações oficiais, validadas pela FitMind, realizadas no prazo, local, equipamento e formato definido pela plataforma poderão contar para ranking e premiação.",
  "Declaro ciência de que o Desafio FitMind possui caráter educativo, motivacional e de acompanhamento, não sendo tratamento médico, nutricional, psicológico ou terapêutico.",
  "Declaro ciência de que resultados de emagrecimento, redução de gordura, ganho de massa muscular, estética, saúde ou performance não são garantidos.",
  "Declaro ciência de que devo procurar profissional habilitado antes de iniciar atividade física, dieta, suplementação, procedimento ou mudança relevante de rotina, especialmente se eu possuir doença, lesão, limitação, gestação, uso de medicamentos ou condição de saúde específica.",
  "Declaro ciência de que o uso de suplementos, medicamentos, hormônios, termogênicos, manipulados ou substâncias é de minha responsabilidade e/ou do profissional habilitado que eventualmente orientar.",
  "Declaro ciência de que estou apto(a), ou devo buscar avaliação profissional adequada para confirmar minha aptidão, antes de realizar atividade física, treino, desafio, dieta, suplementação, procedimento ou mudança relevante de rotina.",
  "Declaro ciência de que atividades físicas realizadas em casa, academia, parque, condomínio, empresa, espaço público, espaço privado ou qualquer outro local envolvem riscos naturais, e que sou responsável por respeitar meus limites, verificar o ambiente, interromper a prática diante de sintomas e buscar atendimento profissional quando necessário.",
  "Declaro ciência de que a FitMind não se responsabiliza por lesões, acidentes, intercorrências, dores, quedas, mal-estar, agravamento de condição pré-existente, uso inadequado de equipamentos, excesso de esforço, automedicação, uso de suplementos, medicamentos ou substâncias, quando decorrentes de minha conduta pessoal, ausência de avaliação profissional, fato de terceiro ou prática realizada fora de falha comprovada da própria FitMind.",
  "Declaro ciência de que Coach FitMind não substitui médico, nutricionista, psicólogo, profissional de educação física, fisioterapeuta ou qualquer outro profissional habilitado.",
];
