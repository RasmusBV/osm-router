import { OSM, Utils } from "../../index.js"
import { profile } from "./profile.js"

// Inspired by the car profile from project OSRM
// https://github.com/Project-OSRM/osrm-backend/blob/master/profiles/car.lua

export const wayProcessors = [
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

function blocked<T>(way: OSM.ProcessedWay<T>) {
    // Areas
    if(way.tags?.area === "yes") { return }

    // Public Transit
    const publicServiceVehicle = way.tags?.psv
    const highway = way.tags?.highway
    if(publicServiceVehicle === "yes" || publicServiceVehicle === "designated") {
        return
    }
    const bus = way.tags?.bus
    if(bus === "yes" || bus === "designated") {
        return
    }

    // Steps
    if(profile.avoid.has("steps") && highway === "steps") {
        return
    }

    // Construction
    if(highway === "construction") { return }
    if(way.tags?.railway === "construction") { return }
    const construction = way.tags?.construction
    if(construction && !profile.construction_whitelist.has(construction)) { return }

    // Proposed
    if(way.tags?.proposed !== undefined) { return }

    // Reversible oneway
    if(way.tags?.oneway === "reversible") { return }

    // Impassable
    if(way.tags?.impassable === "yes") { return }
    if(way.tags?.status === "impassable") { return }

    return way
}

function avoid<T>(way: OSM.ProcessedWay<T>) {
    const highway = way.tags?.highway
    if(profile.avoid.has(highway)) { return }
    return way
}

function access<T>(way: OSM.ProcessedWay<T>) {
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
        return
    }
    return way
}

function oneway<T>(way: OSM.ProcessedWay<T>) {
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
    return way
}

function service<T>(way: OSM.ProcessedWay<T>) {
    const service = way.tags?.service
    if(service && way.tags?.foot === "yes") {
        return
    }
    if(profile.service_tag_forbidden.has(service)) {
        return
    }
    return way
}

function alternateOptions<T>(way: OSM.ProcessedWay<T>) {
    if((way.tags?.route ?? "") in profile.route_speeds) {
        return
    }
    return way
}

function highOccupancyVehicle<T>(way: OSM.ProcessedWay<T>) {
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
    return way
}

function speed<T>(way: OSM.ProcessedWay<T>) {
    const highway = way.tags?.highway
    if(!highway) { return }
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
        return
    }
    return way
}

function maxspeed<T>(way: OSM.ProcessedWay<T>) {
    const keys = ["maxspeed:advisory", "maxspeed", "source:maxspeed", "maxspeed:type"]
    const [forward, backward] = Utils.getForwardBackwardArray(way, keys).map(parseMaxSpeedToMetersPerSecond)
    if(forward) {
        way.speed.forward = forward * profile.speed_reduction
    }
    if(backward) {
        way.speed.backward = backward * profile.speed_reduction
    }
    return way
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

function surface<T>(way: OSM.ProcessedWay<T>) {
    const surfaceSpeed = Utils.tagValueLookup(way, "surface", profile.surface_speeds)
    const tracktypeSpeed = Utils.tagValueLookup(way, "tracktype", profile.tracktype_speeds)
    const smoothnessSpeed = Utils.tagValueLookup(way, "smoothness", profile.smoothness_speeds)
    applyMaximumSpeed(way, [surfaceSpeed, tracktypeSpeed, smoothnessSpeed])
    return way
}

function applyMaximumSpeed<T>(way: OSM.ProcessedWay<T>, speeds: (number | undefined | null)[]) {
    const definedSpeeds = speeds.filter((val) => typeof val === "number").map((val) => val * Utils.kmphToMs)
    way.speed.forward = Math.min(...definedSpeeds, way.speed.forward)
    way.speed.backward = Math.min(...definedSpeeds, way.speed.backward)
}

const maxSpeed = Math.max(...Object.values(profile.speeds.highway))
const minSpeed = Math.min(...Object.values(profile.speeds.highway))
const maxSpeedPenalty = minSpeed / maxSpeed
const speedPenaltyScaling = maxSpeedPenalty / profile.speed_penalty_min

function penalties<T>(way: OSM.ProcessedWay<T>) {
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
    return way
}