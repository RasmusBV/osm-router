import { OSM, Utils, Preprocess } from "../../index.js"
import { profile } from "./profile.js"

// Inspired by the car profile from project OSRM
// https://github.com/Project-OSRM/osrm-backend/blob/master/profiles/car.lua

export function processWay(way: OSM.ProcessedWay, relations: OSM.Relation[] | undefined, data: Preprocess.OSMData) {
    for(const handler of handlers) {
        if(!handler(way, relations, data)) { return false }
    }
    return true
}

const handlers: ((way: OSM.ProcessedWay, relations: OSM.Relation[] | undefined, data: Preprocess.OSMData) => boolean)[] = [
    blocked,
    avoid,
    access,
    oneway,
    alternateOptions,
    service,
    highOccupancyVehicle,
    speed,
    maxspeed,
    surface,
    penalties
]

function blocked(way: OSM.ProcessedWay) {
    // Areas
    if(way.tags?.area === "yes") { return false }

    // Toll roads
    //if(Utils.getTag(way, "toll") === "yes") { return false }

    // Public Transit
    const publicServiceVehicle = way.tags?.psv
    const highway = way.tags?.highway
    if(publicServiceVehicle === "yes" || publicServiceVehicle === "designated") {
        return false
    }
    const bus = way.tags?.bus
    if(bus === "yes" || bus === "designated") {
        return false
    }

    // Steps
    if(profile.avoid.has("steps") && highway === "steps") {
        return false
    }

    // Construction
    if(highway === "construction") { return false }
    if(way.tags?.railway === "construction") { return false }
    const construction = way.tags?.construction
    if(construction && !profile.construction_whitelist.has(construction)) { return false }

    // Proposed
    if(way.tags?.proposed !== undefined) { return false }

    // Reversible oneway
    if(way.tags?.oneway === "reversible") { return false }

    // Impassable
    if(way.tags?.impassable === "yes") { return false }
    if(way.tags?.status === "impassable") { return false }

    return true
}

function avoid(way: OSM.ProcessedWay) {
    const highway = way.tags?.highway
    if(profile.avoid.has(highway)) { return false }
    return true
}

function access(way: OSM.ProcessedWay) {
    const [forwardAccess, backwardAccess] = Utils.getForwardBackwardArray(way, profile.access_tags_hierarchy)
    const highway = way.tags?.highway
    if(profile.restricted_highway_whitelist.has(highway)) {
        way.restricted = {
            forward: Boolean(forwardAccess && profile.restricted_access_tag_list.has(forwardAccess)),
            backward: Boolean(backwardAccess && profile.restricted_access_tag_list.has(backwardAccess))
        }
    }
    if(profile.access_tag_blacklist.has(forwardAccess) && !way.restricted.forward) {
        way.innaccessible.forward = true
    }
    if(profile.access_tag_blacklist.has(backwardAccess) && !way.restricted.backward) {
        way.innaccessible.backward = true
    }
    if(way.innaccessible.forward && way.innaccessible.backward) {
        return false
    }
    return true
}

function oneway(way: OSM.ProcessedWay) {
    const oneway = Utils.prefixValue(way, profile.restrictions, "oneway") ?? way.tags?.oneway
    if(oneway === "-1") {
        way.innaccessible.forward = true
    } else if(oneway === "yes" || oneway === "1" || oneway === "true") {
        way.innaccessible.backward = true
    } else {
        const junction = way.tags?.junction
        if(
            (way.tags?.highway === "motorway" || 
            junction === "roundabout" ||
            junction === "circular") &&
            oneway !== "no"
        ) {
            way.innaccessible.backward = true
        }
    }
    return true
}

function service(way: OSM.ProcessedWay) {
    const service = way.tags?.service
    if(service && way.tags?.foot === "yes") {
        return false
    }
    if(profile.service_tag_forbidden.has(service)) {
        return false
    }
    return true
}

// I skipped bridges because bruh
function alternateOptions(way: OSM.ProcessedWay) {
    if((way.tags?.route ?? "") in profile.route_speeds) {
        return false
    }
    return true
}

function highOccupancyVehicle(way: OSM.ProcessedWay) {
    const hov = way.tags?.hov
    if(hov === "designated") {
        way.restricted.forward = true
        way.restricted.backward = true
    }
    const [forward, backward] = Utils.getForwardBackward(way, "hov:lanes")
    if(forward && forward.split("|").every((val) => val === "designated")) {
        way.innaccessible.forward = true
    }
    if(backward && backward.split("|").every((val) => val === "designated")) {
        way.innaccessible.backward = true
    }
    return true
}

function speed(way: OSM.ProcessedWay) {
    const highway = way.tags?.highway
    if(!highway) { return false }
    const speed = profile.speeds.highway[highway] * Utils.kmphToMs
    if(speed) {
        way.speed.forward = speed
        way.speed.backward = speed
    } else {
        const [forward, backward] = Utils.getForwardBackwardArray(way, profile.access_tags_hierarchy)
        if(
            profile.access_tag_whitelist.has(forward) || 
            (forward && !profile.access_tag_blacklist.has(forward))
        ) {
            way.speed.forward = profile.default_speed
        } else if(!forward && backward) {
            way.innaccessible.forward = true
        }
        if(
            profile.access_tag_whitelist.has(backward) || 
            (backward && !profile.access_tag_blacklist.has(backward))
        ) {
            way.speed.backward = profile.default_speed
        } else if(!backward && forward) {
            way.innaccessible.backward = true
        }
    }
    if(way.speed.forward === 0 && way.speed.backward === 0) {
        return false
    }
    return true
}

function maxspeed(way: OSM.ProcessedWay) {
    const keys = ["maxspeed:advisory", "maxspeed", "source:maxspeed", "maxspeed:type"]
    const [forward, backward] = Utils.getForwardBackwardArray(way, keys).map(parseMaxSpeedToMetersPerSecond)
    if(forward) {
        way.speed.forward = forward * profile.speed_reduction
    }
    if(backward) {
        way.speed.backward = backward * profile.speed_reduction
    }
    return true
}

function parseMaxSpeedToMetersPerSecond(source: string | undefined) {
    let maxSpeed = Utils.convertToMetersPerSecond(source)
    if(maxSpeed) { return maxSpeed }
    if(source) {
        maxSpeed = profile.maxspeed_table[source]
    }
    if(maxSpeed) { return maxSpeed }
    if(!source) { return }
    const highwayType = source.match(/[A-Za-z]{2}:([A-Za-z]+)/)?.[1]
    if(!highwayType) { return }
    maxSpeed = profile.maxspeed_table_default[highwayType]
    return maxSpeed
}

function surface(way: OSM.ProcessedWay) {
    const surfaceSpeed = Utils.tagValueLookup(way, "surface", profile.surface_speeds)
    const tracktypeSpeed = Utils.tagValueLookup(way, "tracktype", profile.tracktype_speeds)
    const smoothnessSpeed = Utils.tagValueLookup(way, "smoothness", profile.smoothness_speeds)
    applyMaximumSpeed(way, [surfaceSpeed, tracktypeSpeed, smoothnessSpeed])
    return true
}

function applyMaximumSpeed(way: OSM.ProcessedWay, speeds: (number | undefined | null)[]) {
    const definedSpeeds = speeds.filter((val) => typeof val === "number").map((val) => val * Utils.kmphToMs)
    way.speed.forward = Math.min(...definedSpeeds, way.speed.forward)
    way.speed.backward = Math.min(...definedSpeeds, way.speed.backward)
}

const maxSpeed = Math.max(...Object.values(profile.speeds.highway))
const minSpeed = Math.min(...Object.values(profile.speeds.highway))
const maxSpeedPenalty = minSpeed / maxSpeed
const speedPenaltyScaling = maxSpeedPenalty / profile.speed_penalty_min

function penalties(way: OSM.ProcessedWay) {
    const servicePenalty = Utils.tagValueLookup(way, "service", profile.service_penalties) ?? 1
    const speed = Utils.tagValueLookup(way, "highway", profile.speeds.highway) ?? profile.default_speed
    const width = Utils.convertToMeters(way.tags?.width) ?? Infinity
    let lanes = Infinity
    const parsedLanes = parseInt(way.tags?.lanes ?? "x")
    if(!isNaN(parsedLanes)) {
        lanes = parsedLanes
    }
    const isBidirectional = (!way.innaccessible.forward && !way.innaccessible.backward)
    const widthPenalty = (
        width <= 3 || 
        (lanes <= 1 && isBidirectional)
    ) ? 0.5 : 1

    const alternatingPenalty = (
        way.tags?.oneway === "alternating"
    ) ? 0.4 : 1

    const sideRoad = way.tags?.side_road
    const sideRoadPenalty = (
        sideRoad === "yes" || 
        sideRoad === "rotary"
    ) ? profile.side_road_multiplier : 1

    const speedPenalty = (maxSpeed/speed) / speedPenaltyScaling

    const penalty = Math.min(servicePenalty, widthPenalty, alternatingPenalty, sideRoadPenalty, speedPenalty)

    way.multiplier.forward *= penalty
    way.multiplier.backward *= penalty
    return true
}