
import * as OSM from "../../types.js"
import * as Utils from "../../utils.js"

import * as Preprocess from "../../preprocess/index.js"
import { profile } from "./profile.js"

export function processNode(node: OSM.Node, relations: OSM.Relation[] | undefined, data: Preprocess.OSMData) {
    const access = profile.access_tags_hierarchy.find((tag) => Utils.getTag(node, tag))
    const barrier = Utils.getTag(node, "barrier")
    const highway = Utils.getTag(node, "highway")
    if(access) {
        const accessVal = node.tags?.[access]
        if(
            accessVal && 
            profile.access_tag_blacklist.has(accessVal) && 
            !profile.restricted_access_tag_list.has(accessVal)
        ) {
            data.addObstacle(node, Preprocess.Obstacle.fill({type: Preprocess.Obstacle.types.barrier}))
        }
    } else if(barrier) {
        const bollard = Utils.getTag(node, "bollard")
        const risingBollard = bollard === "rising"
    
        const kerb = Utils.getTag(node, "kerb")
        const flatKerb = kerb && (kerb === "lowered" || kerb === "flush")
        const highwayCrossingKerb = barrier === "kerb" && highway === "crossing"
        if(
            !profile.barrier_whitelist.has(barrier) &&
            !risingBollard &&
            !flatKerb &&
            !highwayCrossingKerb
        ) {
            data.addObstacle(node, Preprocess.Obstacle.fill({type: Preprocess.Obstacle.types.barrier}))
        }
    } else if(highway) {
        let type: Preprocess.Obstacle.Type | undefined = Preprocess.Obstacle.types[highway as Preprocess.Obstacle.Type]
        if(!type || type === Preprocess.Obstacle.types.barrier) { return true }
        let direction = Utils.getTag(node, "direction")
        let duration = 0
        switch(type) {
            case Preprocess.Obstacle.types.traffic_signals: {
                direction = Utils.getTag(node, "traffic_signals:direction") ?? direction
                duration = profile.properties.traffic_signal_penalty
                break
            } case Preprocess.Obstacle.types.stop: {
                if(Utils.getTag(node, "stop") === "minor") {
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