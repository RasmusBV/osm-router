import type * as OSM from "../types.js"
import type { OSMData } from "./data.js"
import * as geokdbush from 'geokdbush';
import { Info } from "../logging.js";

export type Junction = { to: Map<OSM.Node, OSM.Edge>, from: Map<OSM.Node, OSM.Edge> }
export type JunctionMap = Map<OSM.Node, Junction>

export function buildJunctionMap(data: OSMData) {
    const junctions: JunctionMap = new Map()

    let size = 0
    const segment: OSM.Node[] = []
    for(const way of data.ways.values()) {
        if(way.refs.length <= 1) {
            data.emit("warning", new Info.ErrorLike("Malformed Way", { way }))
            continue
        }
        const firstNode = data.nodes.get(way.refs[0])
        if(!firstNode) {
            data.emit("warning", new Info.ErrorLike(
                "Missing Node",
                { nodeId: way.refs[0], way }
            ))
            continue
        }
        segment[0] = firstNode
        size = 1
        const cost = {forward: 0, backward: 0}
        for(let i = 1; i < way.refs.length; i++) {
            const current = data.nodes.get(way.refs[i])
            if(!current) { 
                data.emit("warning", new Info.ErrorLike(
                    "Missing Node",
                    { nodeId: way.refs[i], way }
                ))
                continue 
            }
            const last = segment[size-1]
            const length = geokdbush.distance(last.lon, last.lat, current.lon, current.lat) * 1000
            segment[size++] = current

            cost.forward += (length / way.speed.forward) * way.multiplier.forward
            cost.backward += (length / way.speed.backward) * way.multiplier.backward
            if(
                (data.nodeToWayMap.get(current.id)?.length ?? 0) <= 1 && 
                i !== way.refs.length-1
            ) { continue }
            const first = segment[0]
            let lastJunction = getJunctions(junctions, first)
            let currentJunction = getJunctions(junctions, current)

            if(!way.innaccessible.forward) {
                const edge: OSM.Edge = {
                    way, 
                    cost: cost.forward, 
                    nodes: Array.from({length: size}, (_, i) => segment[i].id)
                }
                lastJunction.to.set(current, edge)
                currentJunction.from.set(first, edge)
            }
            if(!way.innaccessible.backward) {
                const edge: OSM.Edge = {
                    way, 
                    cost: cost.backward, 
                    nodes: Array.from({length: size}, (_, i) => segment[size - 1 - i].id)
                }
                lastJunction.from.set(current, edge)
                currentJunction.to.set(first, edge)
            }
            cost.forward = 0
            cost.backward = 0
            segment[0] = current
            size = 1
        }
    }
    return junctions
}

function getJunctions(map: Map<OSM.Node, Junction>, nodeId: OSM.Node) {
    let junction = map.get(nodeId)
    if(!junction) {
        junction = {to: new Map(), from: new Map()}
        map.set(nodeId, junction)
    }
    return junction
}