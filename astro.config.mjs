import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { sections } from './src/config/sections.ts';

export default defineConfig({
  site: 'https://itbert.github.io',
  base: '/Mandarin',
  trailingSlash: 'always',
  output: 'static',
  markdown: {
    processor: unified({ remarkPlugins: [remarkMath], rehypePlugins: [rehypeKatex] }),
  },
  integrations: [starlight({
    title: 'Mandarin',
    description: 'Открытый русскоязычный учебник по математике.',
    defaultLocale: 'root',
    locales: { root: { label: 'Русский', lang: 'ru' } },
    favicon: '/favicon.svg',
    tableOfContents: false,
    pagination: false,
    disable404Route: true,
    sidebar: sections.map((section) => ({ label: section.title, link: section.path })),
    customCss: ['./src/styles/global.css'],
    head: [
      { tag: 'meta', attrs: { property: 'og:type', content: 'website' } },
      { tag: 'meta', attrs: { property: 'og:locale', content: 'ru_RU' } },
      { tag: 'meta', attrs: { property: 'og:image', content: 'https://itbert.github.io/Mandarin/og-default.png' } },
      { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
      { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
      { tag: 'meta', attrs: { property: 'og:image:alt', content: 'Mandarin — математика понятным языком' } },
    ],
    components: {
      PageFrame: './src/components/PageFrame.astro',
      Header: './src/components/Header.astro',
      PageTitle: './src/components/PageTitle.astro',
      ContentPanel: './src/components/ContentPanel.astro',
      MarkdownContent: './src/components/MarkdownContent.astro',
      Footer: './src/components/Empty.astro',
      ThemeProvider: './src/components/ThemeProvider.astro',
      SkipLink: './src/components/SkipLink.astro',
    },
  })],
});
