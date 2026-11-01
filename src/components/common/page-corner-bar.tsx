import { ThemeMenu } from './theme-menu';

/** Cabeçalho mínimo das telas sem barra própria (login, página não encontrada): só o tema, no canto. */
export function PageCornerBar() {
  return (
    <header className="fixed inset-x-0 top-0 z-10 flex justify-end px-2 pt-safe">
      <div className="py-1.5">
        <ThemeMenu />
      </div>
    </header>
  );
}
