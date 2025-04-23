import { OSMData } from "./data.js";
import * as OSM from "../types.js"

export type Restriction = {
    relation: OSM.Relation
    restriction: string
    type: Restriction.Type
}

export namespace Restriction {
    export enum Type {
        No,
        Only
    }
}

export type RestrictionMap = Map<OSM.Way, Map<OSM.Node, Map<OSM.Way, Restriction[]>>>

export function isAllowed(from: OSM.Way, via: OSM.Node, to: OSM.Way, restrictionMap: RestrictionMap) {
    const destinations = restrictionMap.get(from)?.get(via)
    if(!destinations) { return true }

    const restrictions = destinations.get(to)
    if(restrictions && restrictions.some((restriction) => restriction.type === Restriction.Type.No)) {
        return false
    }

    let hasMandatoryWays = false
    let destinationIsIncluded = false
    for(const [destination, restrictions] of destinations) {
        if(restrictions.some((restriction) => restriction.type === Restriction.Type.Only)) {
            hasMandatoryWays = true
            if(!destinationIsIncluded) {
                destinationIsIncluded = destination === to
            }
        }
    }
    if(hasMandatoryWays) {
        return destinationIsIncluded
    }
    return true
}

export function buildRestrictionMap(data: OSMData) {
    const restrictionMap: RestrictionMap = new Map()
    for(const relation of data.relationList) {

        const fromId = relation.members.find((m): m is OSM.WayMember => m.role === 'from')?.ref;
        const toId = relation.members.find((m): m is OSM.WayMember => m.role === 'to')?.ref;
        const viaId = relation.members.find((m): m is OSM.NodeMember => m.role === 'via')?.ref;
        const restriction = relation.tags?.restriction;

        if (!fromId || !toId || !viaId || !restriction) { continue }

        const type = getRestrictionType(restriction)
        if(!type) { continue }

        const fromWay = data.ways.get(fromId)
        const toWay = data.ways.get(toId)
        const viaNode = data.nodes.get(viaId)
        if(!fromWay || !toWay || !viaNode) {
            continue
        }

        let vias = restrictionMap.get(fromWay)
        if(!vias) {
            vias = new Map()
            restrictionMap.set(fromWay, vias)
        }
        let tos = vias.get(viaNode)
        if(!tos) {
            tos = new Map()
            vias.set(viaNode, tos)
        }
        let restrictions = tos.get(toWay)
        if(!restrictions) {
            restrictions = []
            tos.set(toWay, restrictions)
        }
        restrictions.push({
            relation,
            restriction,
            type,
        })
    }
    return restrictionMap
}

function getRestrictionType(restriction: string) {
    if(restriction.startsWith("no_")) {
        return Restriction.Type.No
    }
    if(restriction.startsWith("only_")) {
        return Restriction.Type.Only
    }
}