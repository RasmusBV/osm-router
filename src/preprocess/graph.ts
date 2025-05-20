import type * as OSM from "../types.js"
import type { OSMData } from "./data.js";
import getAngle from "@turf/angle"
import { Restriction, isAllowed, RestrictionMap } from "./restrictions.js";
import type { Junction } from "./junctions.js";
import { serialize, SerializeOptions } from "../fileformat/serialize.js";
import { Info } from "../logging.js";

export type ProcessTurn = (
    turn: Readonly<Turn>,
    junction: Readonly<Junction>, 
    data: OSMData
) => number | undefined

export type Turn = {
    fromNode: OSM.Node, 
    fromEdge: OSM.Edge
    fromClosest: OSM.Node,

    viaNode: OSM.Node, 

    toNode: OSM.Node, 
    toEdge: OSM.Edge,
    toClosest: OSM.Node,

    angle: number
    restrictions: Restriction[] | undefined
}

/**
 * An Edge Expanded graph in the format
 * 
 * fromNode -> viaNode -> Edge info + valid toNodes
 * 
 * Traversal is done by indexing with **(fromNode, viaNode)** to obtain an edge,
 * then each connection references a valid edge **(viaNode, toNode)**,
 * and the cost associated with the manoeuvre
 */
export type EdgeExpandedGraph = Map<OSM.NodeId, Map<OSM.NodeId, {

    /**All nodes between fromNode and viaNode. */
    nodes: OSM.NodeId[],

    /**All valid connections with associated costs. */
    to: Map<OSM.NodeId, number> 
    from: Map<OSM.NodeId, number>

}>>

export type NodeMap = Map<OSM.NodeId, {pos: [lon: number, lat: number], edges: Set<OSM.Edge>}>

export class Graph {
    edges: EdgeExpandedGraph = new Map()
    nodes: NodeMap = new Map()

    serialize(options?: SerializeOptions) {
        return serialize(this, options)
    }
}

export function buildGraph(
    data: OSMData,
    junctions: Map<OSM.Node, Junction>,
    restrictions: RestrictionMap,
    processTurn: ProcessTurn = () => 0
) {
    let i = 0
    const amount = junctions.size
    let current = Date.now()
    const graph = new Graph()
    try {
        // Reuse the object to 
        const turn = {} as Turn
        for(const [viaNode, toJunction] of junctions) {
            if(i%10_000 === 0 && Date.now() - 2000 > current) {
                current = Date.now()
                data.emit("info", new Info.Progress({
                    junctions: [i, amount]
                }))
            }
            for(const [fromNode, fromEdge] of toJunction.from) {
                for(const [toNode, toEdge] of toJunction.to) {
                    if(!isAllowed(fromEdge.way, viaNode, toEdge.way, restrictions)) {
                        continue
                    }

                    const fromClosest = getClosestNode(fromEdge.way, fromNode.id, viaNode.id, data)
                    const toClosest = getClosestNode(toEdge.way, toNode.id, viaNode.id, data)
                    if(!fromClosest || !toClosest) { continue }

                    turn.fromNode = fromNode
                    turn.fromEdge = fromEdge
                    turn.fromClosest = fromClosest

                    turn.toNode = toNode
                    turn.toEdge = toEdge
                    turn.toClosest = toClosest

                    turn.angle = getAngle(
                        [fromClosest.lon, fromClosest.lat], 
                        [viaNode.lon, viaNode.lat], 
                        [toClosest.lon, toClosest.lat]
                    ) - 180

                    turn.restrictions = restrictions.get(fromEdge.way)?.get(viaNode)?.get(toEdge.way)

                    const turnCost = processTurn(turn, toJunction, data)
                    if(turnCost === undefined) { continue }

                    // Unsure about this cost calculation
                    const totalCost = turnCost + fromEdge.cost/2 + toEdge.cost/2

                    getExpandedEdge(fromNode, viaNode, fromEdge, graph, data)?.to.set(toNode.id, totalCost)
                    getExpandedEdge(viaNode, toNode, toEdge, graph, data)?.from.set(fromNode.id, totalCost)
                }
            }
            i++
        }
    } catch(e) {
        throw e
    } finally {
        
    }
    return graph
}

function getClosestNode(way: OSM.ProcessedWay, anchor: OSM.NodeId, via: OSM.NodeId, data: OSMData) {
    const anchorNodeIndex = way.refs.indexOf(anchor)
    const viaNodeIndex = way.refs.indexOf(via)
    if(anchorNodeIndex === -1 || viaNodeIndex === -1) { return undefined }
    const closestNodeIndex = viaNodeIndex + (anchorNodeIndex < viaNodeIndex ? -1 : 1 )
    return data.nodes.get(way.refs[closestNodeIndex])
}

function getExpandedEdge(
    from: OSM.Node,
    to: OSM.Node,
    edgeInfo: OSM.Edge,
    graph: Graph,
    data: OSMData
) {
    let edges = graph.edges.get(from.id)
    if(!edges) {
        edges = new Map()
        graph.edges.set(from.id, edges)
    }
    let edge = edges.get(to.id)
    if(!edge) {
        for(const nodeId of edgeInfo.nodes) {
            const node = data.nodes.get(nodeId)
            if(!node) { continue }
            let nodeInfo = graph.nodes.get(nodeId)
            if(!nodeInfo) {
                nodeInfo = {pos: [node.lon, node.lat], edges: new Set()}
                graph.nodes.set(nodeId, nodeInfo)
            }
            nodeInfo.edges.add(edgeInfo)
        }
        edge = {
            nodes: edgeInfo.nodes,
            to: new Map(),
            from: new Map()
        }
        edges.set(to.id, edge)
    }
    return edge
}