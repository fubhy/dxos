//
// Copyright 2023 DXOS.org
//

import { type Plugin } from '@dxos/react-surface';

import { type Node } from './graph';
import { type GraphProvides } from './types';

export const isGraphNode = (data: unknown): data is Node =>
  data && typeof data === 'object' ? 'id' in data && 'label' in data : false;

type GraphPlugin = Plugin<GraphProvides>;
export const graphPlugins = (plugins: Plugin[]): GraphPlugin[] =>
  (plugins as GraphPlugin[]).filter(
    (p) => typeof p.provides?.graph?.nodes === 'function' || typeof p.provides?.graph?.withPlugins === 'function',
  );
