//
// Copyright 2022 DXOS.org
//

import * as d3 from 'd3';
import React, { type PropsWithChildren, useEffect, useMemo } from 'react';
import { useResizeDetector } from 'react-resize-detector';

import { SVGContext } from '../context';
import { SVGContextDef } from '../hooks';

export type SVGContextProviderProps = PropsWithChildren<{ context?: SVGContext }>;

/**
 * Makes the SVG context available to child nodes.
 * Automatically resizes the SVG element, which expands to fit the container.
 */
export const SVGContextProvider = ({ context: provided, children }: SVGContextProviderProps) => {
  const { ref: resizeRef, width = 0, height = 0 } = useResizeDetector();
  const context = useMemo<SVGContext>(() => provided || new SVGContext(), []);

  useEffect(() => {
    if (width && height) {
      context.setSize({ width, height });
      d3.select(context.svg)
        .attr('display', 'block')
        .attr('viewBox', context.viewBox)
        .attr('width', width)
        .attr('height', height);
    } else {
      d3.select(context.svg).attr('display', 'none'); // Hide until mounted.
    }
  }, [width, height]);

  return (
    <SVGContextDef.Provider value={context}>
      {/* Flex is important otherwise div has extra padding. */}
      <div ref={resizeRef} className='flex w-full h-full'>
        {width !== 0 && height !== 0 && children}
      </div>
    </SVGContextDef.Provider>
  );
};
