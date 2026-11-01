/** Junta os dicionários de cada área por idioma (o português não precisa: é a chave). */
import enCommon from './en/common';
import enEditor from './en/editor';
import enReview from './en/review';
import enAi from './en/ai';
import enProjects from './en/projects';
import enMisc from './en/misc';
import esCommon from './es/common';
import esEditor from './es/editor';
import esReview from './es/review';
import esAi from './es/ai';
import esProjects from './es/projects';
import esMisc from './es/misc';

export const MESSAGES: Record<'en' | 'es', Readonly<Record<string, string>>> = {
  en: { ...enCommon, ...enEditor, ...enReview, ...enAi, ...enProjects, ...enMisc },
  es: { ...esCommon, ...esEditor, ...esReview, ...esAi, ...esProjects, ...esMisc },
};
