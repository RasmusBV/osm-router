import * as OSM from "../types.js"
import type { OSMData } from "./data.js";
import getAngle from "@turf/angle"
import { Restriction, isAllowed, RestrictionMap } from "./restrictions.js";
import type { Junction } from "./junctions.js";
import { serialize, SerializeOptions } from "../fileformat/serialize.js";
import { Info } from "../logging.js";

export type ProcessTurn<D extends OSM.CustomData> = (
    turn: Readonly<Turn<D>>,
    junction: Readonly<Junction<D>>, 
    data: OSMData<D>
) => number | undefined

export type Turn<D extends OSM.CustomData> = {
    fromNode: OSM.ProcessedNode<D["node"]>, 
    fromEdge: OSM.Edge<D["way"]>
    fromClosest: OSM.ProcessedNode<D["node"]>,
    fromDirection: OSM.Direction

    viaNode: OSM.ProcessedNode<D["node"]>, 

    toNode: OSM.ProcessedNode<D["node"]>, 
    toEdge: OSM.Edge<D["way"]>,
    toClosest: OSM.ProcessedNode<D["node"]>,
    toDirection: OSM.Direction

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

export type NodeMap<D extends OSM.CustomData> = Map<OSM.NodeId, {pos: [lon: number, lat: number], edges: Set<OSM.Edge<D["way"]>>}>

export class Graph<D extends OSM.CustomData = OSM.CustomData> {
    edges: EdgeExpandedGraph = new Map()
    nodes: NodeMap<D> = new Map()

    serialize(options?: SerializeOptions) {
        return serialize(this, options)
    }
}

export function buildGraph<D extends OSM.CustomData>(
    data: OSMData<D>,
    junctions: Map<OSM.ProcessedNode<D["node"]>, Junction<D>>,
    restrictions: RestrictionMap,
    processTurn: ProcessTurn<D> = () => 0
) {
    let i = 0
    const amount = junctions.size
    let current = Date.now()
    const graph = new Graph<D>()
    try {
        // Reuse the object to 
        const turn = {} as Turn<D>
        for(const [viaNode, toJunction] of junctions) {
            if(i%10_000 === 0 && Date.now() - 2000 > current) {
                current = Date.now()
                data.emit("info", new Info.Progress("graph building", {
                    junctions: [i, amount]
                }))
            }
            for(const [fromNode, fromEdge] of toJunction.from) {
                for(const [toNode, toEdge] of toJunction.to) {
                    if(!isAllowed(fromEdge.way, viaNode, toEdge.way, restrictions)) {
                        continue
                    }
                    const fromDirection = getWayDirection(fromEdge.way, fromNode.id, viaNode.id)
                    const fromClosest = getClosestNode(fromEdge.way, fromNode.id, viaNode.id, data)

                    const toDirection = getWayDirection(toEdge.way, toNode.id, viaNode.id)
                    const toClosest = getClosestNode(toEdge.way, toNode.id, viaNode.id, data)
                    if(
                        !fromDirection || 
                        !fromClosest || 
                        !toDirection || 
                        !toClosest
                    ) { continue }

                    turn.fromNode = fromNode
                    turn.fromEdge = fromEdge
                    turn.fromClosest = fromClosest
                    turn.fromDirection = fromDirection

                    turn.toNode = toNode
                    turn.toEdge = toEdge
                    turn.toClosest = toClosest
                    turn.toDirection = toDirection

                    turn.angle = getAngle(
                        [fromClosest.lon, fromClosest.lat], 
                        [viaNode.lon, viaNode.lat], 
                        [toClosest.lon, toClosest.lat]
                    ) - 180

                    turn.restrictions = restrictions.get(fromEdge.way)?.get(viaNode)?.get(toEdge.way)

                    const turnCost = processTurn(turn, toJunction, data)
                    if(turnCost === undefined) { continue }

                    const totalCost = turnCost + fromEdge.cost

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

function getWayDirection(way: OSM.ProcessedWay<any>, anchor: OSM.NodeId, via: OSM.NodeId) {
    const anchorNodeIndex = way.refs.indexOf(anchor)
    const viaNodeIndex = way.refs.indexOf(via)
    if(anchorNodeIndex === -1 || viaNodeIndex === -1) { return undefined }
    return anchorNodeIndex < viaNodeIndex ? OSM.Direction.Forward : OSM.Direction.Backward
}

function getClosestNode<D extends OSM.CustomData>(way: OSM.ProcessedWay<D["way"]>, anchor: OSM.NodeId, via: OSM.NodeId, data: OSMData<D>) {
    const anchorNodeIndex = way.refs.indexOf(anchor)
    const viaNodeIndex = way.refs.indexOf(via)
    if(anchorNodeIndex === -1 || viaNodeIndex === -1) { return undefined }
    const closestNodeIndex = viaNodeIndex + (anchorNodeIndex < viaNodeIndex ? -1 : 1 )
    return data.nodes.get(way.refs[closestNodeIndex])
}

function getExpandedEdge<D extends OSM.CustomData>(
    from: OSM.ProcessedNode<D["node"]>,
    to: OSM.ProcessedNode<D["node"]>,
    edgeInfo: OSM.Edge<D["way"]>,
    graph: Graph<D>,
    data: OSMData<D>
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