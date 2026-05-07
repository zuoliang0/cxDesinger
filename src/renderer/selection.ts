import type { SelectionRect } from "../shared/types";

export interface Size {
  width: number;
  height: number;
}

export function selectionToNatural(
  selection: SelectionRect,
  displayed: Size,
  natural: Size
): SelectionRect {
  const scaleX = natural.width / displayed.width;
  const scaleY = natural.height / displayed.height;

  return {
    x: Math.round(selection.x * scaleX),
    y: Math.round(selection.y * scaleY),
    width: Math.max(1, Math.round(selection.width * scaleX)),
    height: Math.max(1, Math.round(selection.height * scaleY))
  };
}
