import { createCn } from 'cn/config';

// Custom names from globals.css. Without this, cn('text-micro', 'text-foreground')
// treats text-micro as a color and silently drops it.
export const cn = createCn({
  extend: {
    classGroups: {
      'font-size': [{ text: ['micro', 'md', 'field', 'display-sm', 'display-md', 'display-lg'] }],
      shadow: [{ shadow: ['float', 'overlay', 'glow'] }],
    },
  },
});
