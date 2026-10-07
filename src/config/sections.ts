export const sections = [
  {
    id: 'preparation',
    title: 'Математическая подготовка',
    path: '/preparation/',
    category: 'Школьная математика и олимпиадные темы',
    shortCategory: 'Подготовительное направление',
    description: 'Углублённая школьная математика, олимпиадные темы и дополнительные материалы для перехода к вузовской математике.',
    symbol: 'geometry',
  },
  {
    id: 'analysis',
    title: 'Математический анализ',
    path: '/analysis/',
    category: 'Вузовская математика',
    shortCategory: 'Вузовский хендбук',
    description: 'Будущий хендбук по математическому анализу: пространство для последовательного знакомства с этим разделом вузовской математики.',
    symbol: 'curve',
  },
  {
    id: 'linear-algebra',
    title: 'Линейная алгебра',
    path: '/linear-algebra/',
    category: 'Вузовская математика',
    shortCategory: 'Вузовский хендбук',
    description: 'Будущий хендбук по линейной алгебре: самостоятельное направление в открытой библиотеке математических материалов.',
    symbol: 'vectors',
  },
] as const;

export const repository = 'https://github.com/itbert/Mandarin';
/** Every public link is relative to Astro's configured project Pages base. */
export function withBase(path = '/') {
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
export function currentSection(pathname: string) {
  return sections.find((section) => pathname.startsWith(withBase(section.path)));
}
