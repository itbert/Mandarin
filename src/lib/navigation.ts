import { getCollection } from 'astro:content';
import { withBase } from '../config/sections';

export interface NavigationNode {
  label: string;
  href?: string;
  order: number;
  children: NavigationNode[];
}

/** The reader tree includes only published pages of the selected direction. */
export async function getSectionNavigation(sectionId: string) {
  const pages = await getCollection('docs', (entry) =>
    entry.id.startsWith(`${sectionId}/`) && !entry.data.draft && !entry.data.sidebar.hidden,
  );
  const tree: NavigationNode[] = [];
  for (const page of pages) {
    const slug = page.id.replace(/\/index$/, '');
    if (slug === sectionId) continue;
    const order = page.data.sidebar.order ?? 100;
    let siblings = tree;
    for (const chapter of page.data.chapters ?? []) {
      let group = siblings.find((node) => !node.href && node.label === chapter);
      if (!group) {
        group = { label: chapter, order, children: [] };
        siblings.push(group);
      }
      group.order = Math.min(group.order, order);
      siblings = group.children;
    }
    siblings.push({ label: page.data.sidebar.label ?? page.data.title, href: withBase(`/${slug}/`), order, children: [] });
  }
  function sort(nodes: NavigationNode[]) {
    nodes.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'ru'));
    nodes.forEach((node) => sort(node.children));
  }
  sort(tree);
  return tree;
}
