import { GraphAccessor } from "../fileformat/index.js";
import { RouteNode, Direction } from "./common.js"

export function generateGeometry(
    route: RouteNode,
    direction: Direction,
    data: GraphAccessor,
    coordinates: [lon: number, lat: number][] = []
) {
    // Here be dragons
    // And they be off by 1
    RouteNode.iter(route, (candidate) => {
        const edgeIndex = candidate.edgeIndex
        const nodesAmount = data.accessors.edges.nodeListLength(edgeIndex)
        const nodeListStartIndex = data.accessors.edges.nodeListIndex(edgeIndex)
        for(let i = 1; i <= nodesAmount - 1; i++) {
            let nodeListIndex: number
            if(direction === Direction.Forward) {
                nodeListIndex = nodeListStartIndex + nodesAmount - i
            } else {
                nodeListIndex = nodeListStartIndex + i
            }
            const nodeIndex = data.accessors.nodeList.nodeIndex(nodeListIndex)
            const pos = data.nodePos(nodeIndex)
            coordinates.push(pos)
        }
    })
    if(direction === Direction.Forward) {
        coordinates.reverse()
    }
    return coordinates
}