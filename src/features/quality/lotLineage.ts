type Edge = { parent_lot_id: string; child_lot_id: string }
/** Traverses recorded edges only, retaining every branch and bounding cycles. */
export function lotAncestors(lotId: string, edges: Edge[]) {
  const visited = new Set([lotId])
  const queue = [lotId]
  for (let index = 0; index < queue.length; index++) {
    for (const edge of edges) {
      if (edge.child_lot_id === queue[index] && !visited.has(edge.parent_lot_id)) {
        visited.add(edge.parent_lot_id); queue.push(edge.parent_lot_id)
      }
    }
  }
  return visited
}
