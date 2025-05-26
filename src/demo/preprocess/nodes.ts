import { OSM, Preprocess } from "../../index.js"
import { profile } from "./profile.js"

// Inspired by the car profile from project OSRM
// https://github.com/Project-OSRM/osrm-backend/blob/master/profiles/car.lua

export function processNode(node: OSM.Node, relations: OSM.Relation[] | undefined, data: Preprocess.OSMData) {
    const access = profile.access_tags_hierarchy.find((tag) => node.tags?.[tag])
    const barrier = node.tags?.barrier
    const highway = node.tags?.highway
    if(access) {
        const accessVal = node.tags?.[access]
        if(
            accessVal && 
            profile.access_tag_blacklist.has(accessVal) && 
            !profile.restricted_access_tag_list.has(accessVal)
        ) {
            const obstacle = Preprocess.Obstacle.getDefault()
            obstacle.type = Preprocess.Obstacle.types.barrier
            data.addObstacle(node, obstacle)
        }
    } else if(barrier) {
        const bollard = node.tags?.bollard
        const risingBollard = bollard === "rising"
    
        const kerb = node.tags?.kerb
        const flatKerb = kerb && (kerb === "lowered" || kerb === "flush")
        const highwayCrossingKerb = barrier === "kerb" && highway === "crossing"
        if(
            !profile.barrier_whitelist.has(barrier) &&
            !risingBollard &&
            !flatKerb &&
            !highwayCrossingKerb
        ) {
            const obstacle = Preprocess.Obstacle.getDefault()
            obstacle.type = Preprocess.Obstacle.types.barrier
            data.addObstacle(node, obstacle)
        }
    } else if(highway) {
        let type: Preprocess.Obstacle.Type | undefined = Preprocess.Obstacle.types[highway as Preprocess.Obstacle.Type]
        if(!type || type === Preprocess.Obstacle.types.barrier) { return true }
        let direction = node.tags?.direction
        let duration = 0
        switch(type) {
            case Preprocess.Obstacle.types.traffic_signals: {
                direction = node.tags?.["traffic_signals:direction"] ?? direction
                duration = profile.traffic_signal_penalty
                break
            } case Preprocess.Obstacle.types.stop: {
                if(node.tags?.stop === "minor") {
                    type = Preprocess.Obstacle.types.stop_minor
                }
                duration = 2
                break
            } case Preprocess.Obstacle.types.give_way: {
                duration = 1
            }
        }
        const qualifiedDirection = Preprocess.Obstacle.directions[direction as Preprocess.Obstacle.Direction] ?? Preprocess.Obstacle.directions.none
        data.addObstacle(node, {type, direction: qualifiedDirection, duration})
    }
    return true
}