import * as OSM from "../types.js"
import { OSMData } from "./data.js"
import { WarningType } from "../warnings.js";

export type Junction = { to: Map<OSM.Node, OSM.Edge>, from: Map<OSM.Node, OSM.Edge> }

export function buildJunctionMap(data: OSMData) {
    const junctions = new Map<OSM.Node, Junction>()

    let size = 0
    const segment: OSM.Node[] = []
    for(const way of data.ways.values()) {
        if(way.refs.length <= 1) {
            data.warn(WarningType.MalformedWay, { way })
            continue
        }
        const firstNode = data.nodes.get(way.refs[0])
        if(!firstNode) {
            data.warn(
                WarningType.MissingNode,
                { nodeId: way.refs[0], way }
            )
            continue
        }
        segment[0] = firstNode
        size = 1
        const cost = {forward: 0, backward: 0}
        for(let i = 1; i < way.refs.length; i++) {
            const current = data.nodes.get(way.refs[i])
            if(!current) { 
                data.warn(
                    WarningType.MissingNode,
                    { nodeId: way.refs[i], way }
                )
                continue 
            }
            const last = segment[size-1]
            const length = distance(last.lat, last.lon, current.lat, current.lon)
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

const EARTH_RADIUS_M = 6_378_137
const TO_RADIANS_CONVERSION = (Math.PI / 180)

function distance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const dLat = (lat2 - lat1)*TO_RADIANS_CONVERSION
    const dLon = (lon2 - lon1)*TO_RADIANS_CONVERSION

    const lat1_r = (lat1)*TO_RADIANS_CONVERSION
    const lat2_r = (lat2)*TO_RADIANS_CONVERSION

    const dLat2 = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    const dLon2 = Math.sin(dLon / 2) * Math.sin(dLon / 2)

    const a = dLat2 + (dLon2 * Math.cos(lat1_r) * Math.cos(lat2_r))

    return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}